/**
 * The engine package's entry point: an `EngineSDK` for mGBA, the Game Boy Advance /
 * Game Boy / Game Boy Color emulator.
 *
 * ```js
 * import MgbaSDK from '@wasm-gaming/mgba-wasm';
 *
 * const play = await new MgbaSDK()
 *   .assets({ rom: () => readRom() })         // bytes, or a thunk
 *   .storage({ namespace: 'minish-cap' })     // → OPFS mgba/minish-cap/
 *   .mount(document.querySelector('#stage'))
 *   .start();
 *
 * play.pause('menu'); play.resume('menu');
 * await play.states.save(0, { thumbnail: await play.snapshot() });
 * play.states.load(0);
 * await play.restart();                        // power cycle
 * await play.destroy();                        // battery RAM flushed, loop stopped, audio closed
 * ```
 *
 * Everything a host drives is the contract's (`@wasm-gaming/engine-specs`); what is this
 * engine's own: the options (the live settings catalog), owner-aware
 * {@link MgbaPlay.pause} / {@link MgbaPlay.resume}, {@link MgbaPlay.states},
 * {@link MgbaPlay.snapshot}, {@link MgbaPlay.storagePath} and the `saves` event —
 * the same shape as blastem-wasm and fbneo-wasm, so the engine app is one app.
 *
 * Files in OPFS `mgba/<namespace>/`: `sram.bin` (battery RAM, flushed every 15 s, on
 * pause and on destroy), and per save-state slot `slot_N.state`, `slot_N.png` (its frame)
 * and `slot_N.lock`. The slots are read into memory at start, so listing them is
 * synchronous; every change is written through.
 */
import { EnginePlayBase, EngineSDKBase, EventEmitter, } from './engine-specs.js';
import { createMgbaCore } from './mgba.core.js';
import { MGBA_SPEC, MGBA_VIDEO, } from './mgba.options.js';
export { DEFAULT_KEYMAP, DEFAULT_PADMAP } from './mgba.core.js';
export { toEscMenuGroups } from './mgba.options.js';
export { MGBA_SPEC, MGBA_VIDEO } from './mgba.options.js';
const ENGINE_ID = 'mgba';
const DEFAULT_STORAGE_NAMESPACE = 'default';
/**
 * Where an engine keeps one namespace: `<engineId>/<namespace>`, relative to the OPFS
 * root. The same rule as every engine's: segments cleaned, `.` and `..` dropped,
 * anything outside `[A-Za-z0-9._-]` → `_`, nothing usable → `default`; a leading
 * `<engineId>/` is stripped once.
 */
export function storagePath(engineId, namespace) {
    const segments = typeof namespace === 'string'
        ? namespace
            .split('/')
            .map((segment) => segment.trim())
            .filter((segment) => segment && segment !== '.' && segment !== '..')
            .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, '_'))
        : [];
    const prefixed = segments.length > 1 && segments[0] === engineId;
    if (prefixed)
        segments.shift();
    const cleaned = segments.join('/') || DEFAULT_STORAGE_NAMESPACE;
    return { namespace: cleaned, path: `${engineId}/${cleaned}`, prefixed };
}
async function opfsDir(path, create) {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory)
        return null;
    try {
        let dir = await navigator.storage.getDirectory();
        for (const segment of path.split('/').filter(Boolean)) {
            dir = await dir.getDirectoryHandle(segment, { create });
        }
        return dir;
    }
    catch {
        return null;
    }
}
async function resolveAsset(asset) {
    const value = typeof asset === 'function' ? await asset() : asset;
    if (value == null)
        return null;
    if (value instanceof Uint8Array)
        return value;
    if (value instanceof ArrayBuffer)
        return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
        const view = value;
        return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    }
    throw new TypeError('mgba: an asset must be a Uint8Array, an ArrayBuffer or a thunk returning one');
}
/** The player's save-state slots: 0-3. */
export const STATE_SLOTS = 4;
/**
 * The *unsaved* suspend point (Classic Mini style): written when the player leaves,
 * offered when they come back, and saved into a numbered slot only when they ask.
 */
export const AUTO_STATE_SLOT = 9;
/** The live engine: one booted mGBA and its session. */
export class MgbaPlay extends EnginePlayBase {
    #core = null;
    #destroyed = false;
    #controls = null;
    #frameListeners = new Set();
    #pauseOwner = null;
    #canvas = null;
    #ownsCanvas = false;
    #box = null;
    #boxObserver = null;
    #namespace = DEFAULT_STORAGE_NAMESPACE;
    #storagePath = `${ENGINE_ID}/${DEFAULT_STORAGE_NAMESPACE}`;
    #persist = true;
    /** The slot files of this namespace, read at start and written through. */
    #files = new Map();
    #onHidden = () => {
        if (document.visibilityState === 'hidden')
            void this.flushSaves();
    };
    constructor(init, events) {
        super(MGBA_SPEC, init, events);
    }
    /** The normalised namespace this session uses. */
    get namespace() {
        return this.#namespace;
    }
    /** Where this session's files live, relative to the OPFS root: `mgba/<namespace>`. */
    get storagePath() {
        return this.#storagePath;
    }
    /** Who holds the pause, or null while running. */
    get pausedBy() {
        return this.#pauseOwner;
    }
    /** Which core booted the ROM: `gba`, or `gb` for Game Boy / Color. */
    get system() {
        return this.#requireCore().system;
    }
    /** The live settings (the options catalog); writes apply to the running game. */
    get settings() {
        return this.#requireCore().config;
    }
    /**
     * Rebind the handheld's controls: physical keys (`KeyboardEvent.code`) and gamepad
     * buttons (standard mapping) per control. What is left out keeps its default. Live.
     */
    setControls(controls) {
        this.#controls = controls;
        this.#core?.setControls(controls);
    }
    /** Hear every batch of emulated frames (for a performance counter); returns the unsubscribe. */
    onFrames(listener) {
        this.#frameListeners.add(listener);
        return () => this.#frameListeners.delete(listener);
    }
    /** The current frame as a PNG (the 2D canvas keeps the last one, paused or not). */
    async snapshot() {
        return this.#core ? this.#core.snapshot() : null;
    }
    /** Save states — see {@link MgbaStates}. */
    get states() {
        const core = this.#requireCore();
        const name = {
            state: (slot) => `slot_${slot}.state`,
            png: (slot) => `slot_${slot}.png`,
            lock: (slot) => `slot_${slot}.lock`,
        };
        const checkSlot = (slot) => {
            if (slot === AUTO_STATE_SLOT || (Number.isInteger(slot) && slot >= 0 && slot < STATE_SLOTS))
                return slot;
            throw new RangeError(`mgba: a state slot is 0-${STATE_SLOTS - 1} or ${AUTO_STATE_SLOT}, not ${slot}`);
        };
        const isLocked = (slot) => this.#files.has(name.lock(slot));
        const refuseLocked = (slot) => {
            if (isLocked(slot))
                throw new Error(`mgba: state slot ${slot} is locked`);
        };
        const get = (slot) => {
            checkSlot(slot);
            const state = this.#files.get(name.state(slot));
            const png = state ? this.#files.get(name.png(slot)) : undefined;
            return {
                slot,
                savedAt: state ? new Date(state.at) : null,
                thumbnail: png ? new Blob([png.bytes], { type: 'image/png' }) : null,
                locked: isLocked(slot),
            };
        };
        return {
            list: () => Array.from({ length: STATE_SLOTS }, (_, slot) => get(slot)),
            get,
            save: async (slot, options = {}) => {
                checkSlot(slot);
                refuseLocked(slot);
                const bytes = core.saveState();
                const thumbnail = options.thumbnail ? new Uint8Array(await options.thumbnail.arrayBuffer()) : null;
                await this.#write(name.state(slot), bytes);
                if (thumbnail)
                    await this.#write(name.png(slot), thumbnail);
                else
                    await this.#forget([name.png(slot)]);
                this.emit('saves', { files: [name.state(slot), name.png(slot)] });
            },
            load: (slot) => {
                checkSlot(slot);
                const state = this.#files.get(name.state(slot));
                return state ? core.loadState(state.bytes) : false;
            },
            copy: async (from, to) => {
                checkSlot(from);
                checkSlot(to);
                refuseLocked(to);
                const state = this.#files.get(name.state(from));
                if (!state)
                    throw new Error(`mgba: state slot ${from} is empty`);
                const png = this.#files.get(name.png(from));
                await this.#write(name.state(to), state.bytes);
                if (png)
                    await this.#write(name.png(to), png.bytes);
                else
                    await this.#forget([name.png(to)]);
                this.emit('saves', { files: [name.state(to), name.png(to)] });
            },
            lock: async (slot, locked) => {
                checkSlot(slot);
                if (locked) {
                    if (!this.#files.has(name.state(slot)))
                        throw new Error(`mgba: state slot ${slot} is empty`);
                    await this.#write(name.lock(slot), new Uint8Array([1]));
                }
                else
                    await this.#forget([name.lock(slot)]);
                this.emit('saves', { files: [name.lock(slot)] });
            },
            remove: async (slot) => {
                checkSlot(slot);
                refuseLocked(slot);
                const names = [name.state(slot), name.png(slot)];
                await this.#forget(names);
                this.emit('saves', { files: names });
            },
        };
    }
    /**
     * Freeze emulation and sound. The first caller owns the pause, and only that owner's
     * {@link resume} lifts it, so an overlay cannot resume a game the host had already
     * frozen. Battery RAM is flushed, since a paused game is often a closed one.
     */
    pause(owner = 'host') {
        const core = this.#core;
        if (!core || this.#pauseOwner)
            return;
        this.#pauseOwner = owner;
        core.pause();
        void this.flushSaves();
        this.emit('pause', { owner });
    }
    resume(owner = 'host') {
        const core = this.#core;
        if (!core || this.#pauseOwner !== owner)
            return;
        this.#pauseOwner = null;
        core.resume();
        this.emit('resume', { owner });
    }
    /** Battery RAM to OPFS `mgba/<namespace>/sram.bin`, when it changed. Emits `saves`. */
    async flushSaves() {
        if (!this.#core || !this.#persist)
            return;
        if (await this.#core.persistSram())
            this.emit('saves', { files: ['sram.bin'] });
    }
    // ---- Contract hooks ----
    mounted(target) {
        if (target instanceof HTMLCanvasElement) {
            this.#canvas = target;
            this.#ownsCanvas = false;
            this.#box = target.parentElement;
        }
        else {
            this.#canvas = document.createElement('canvas');
            this.#ownsCanvas = true;
            this.#box = target;
            target.appendChild(this.#canvas);
        }
        const canvas = this.#canvas;
        canvas.width = MGBA_VIDEO.width;
        canvas.height = MGBA_VIDEO.height;
        canvas.tabIndex = 0;
        canvas.style.imageRendering = 'pixelated';
        canvas.style.display = 'block';
        canvas.addEventListener('contextmenu', (event) => event.preventDefault());
        if (this.#box && this.#ownsCanvas) {
            this.#boxObserver?.disconnect();
            this.#boxObserver = new ResizeObserver(() => this.#fit());
            this.#boxObserver.observe(this.#box);
            this.#fit();
        }
    }
    async open(_options) {
        if (this.#destroyed) {
            throw new Error('mgba: this engine has been destroyed and cannot be started again — build a new MgbaSDK');
        }
        if (this.#core) {
            // Already running: a restart is a power cycle.
            if (this.#pauseOwner)
                this.resume(this.#pauseOwner);
            this.#core.reset();
            return;
        }
        await this.#boot();
    }
    patched(kind, patch) {
        if (kind !== 'options' || !this.#core)
            return;
        for (const [key, value] of Object.entries(patch)) {
            this.#core.config.write(key, value);
        }
    }
    async close() {
        document.removeEventListener('visibilitychange', this.#onHidden);
        window.removeEventListener('pagehide', this.#onHidden);
        const core = this.#core;
        if (core)
            await core.destroy();
        this.#boxObserver?.disconnect();
        this.#boxObserver = null;
        if (this.#ownsCanvas)
            this.#canvas?.remove();
        this.#canvas = null;
        this.#core = null;
        this.#pauseOwner = null;
        this.#destroyed = true;
    }
    // ---- Boot ----
    async #boot() {
        const config = await this.#values('config');
        const options = await this.#values('options');
        const assets = await this.#values('assets');
        const storage = await this.#values('storage');
        const canvas = this.#canvas;
        if (!canvas)
            throw new Error('mgba: mount() an element (or a canvas) before start()');
        const rom = await resolveAsset(assets.rom);
        if (!rom)
            throw new Error('mgba: no ROM — hand one over as assets.rom (bytes or a thunk)');
        const bios = await resolveAsset(assets.bios);
        const resolved = storagePath(ENGINE_ID, storage.namespace);
        this.#namespace = resolved.namespace;
        this.#storagePath = resolved.path;
        this.#persist = storage.persist !== null;
        if (this.#persist)
            await this.#readFiles();
        this.#core = await createMgbaCore({
            canvas,
            rom,
            bios,
            storagePath: this.#storagePath,
            settingsKey: this.#namespace,
            persist: this.#persist,
            options,
            jsUrl: config.jsUrl,
            wasmUrl: config.wasmUrl,
            onResize: () => this.#fit(),
            onFrames: (count) => {
                for (const listener of this.#frameListeners)
                    listener(count);
            },
        });
        if (this.#controls)
            this.#core.setControls(this.#controls);
        this.#core.start();
        if (this.#persist) {
            document.addEventListener('visibilitychange', this.#onHidden);
            window.addEventListener('pagehide', this.#onHidden);
        }
        this.#fit();
    }
    /** The plain values behind one payload's descriptors. */
    async #values(kind) {
        const described = (await this[kind]());
        const out = {};
        for (const [key, property] of Object.entries(described)) {
            if (property.value !== undefined)
                out[key] = property.value;
        }
        return out;
    }
    #requireCore() {
        if (!this.#core)
            throw new Error('mgba: the engine is not running — start() it first');
        return this.#core;
    }
    // ---- Files ----
    /** The slot files of this namespace into memory (battery RAM is the core's). */
    async #readFiles() {
        const dir = await opfsDir(this.#storagePath, false);
        if (!dir)
            return;
        const iterable = dir;
        for await (const [fileName, handle] of iterable.entries()) {
            if (handle.kind !== 'file' || !fileName.startsWith('slot_'))
                continue;
            const file = await handle.getFile();
            this.#files.set(fileName, { bytes: new Uint8Array(await file.arrayBuffer()), at: file.lastModified });
        }
    }
    async #write(fileName, bytes) {
        this.#files.set(fileName, { bytes, at: Date.now() });
        if (!this.#persist)
            return;
        const dir = await opfsDir(this.#storagePath, true);
        if (!dir)
            return;
        const writable = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
        await writable.write(bytes);
        await writable.close();
    }
    async #forget(fileNames) {
        for (const fileName of fileNames)
            this.#files.delete(fileName);
        if (!this.#persist)
            return;
        const dir = await opfsDir(this.#storagePath, false);
        for (const fileName of fileNames)
            await dir?.removeEntry(fileName).catch(() => { });
    }
    // ---- Picture ----
    #fit() {
        const canvas = this.#canvas;
        const box = this.#box;
        if (!canvas || !box || !this.#ownsCanvas)
            return;
        const { width, height } = box.getBoundingClientRect();
        if (!width || !height)
            return;
        const aspect = this.#core?.aspect() ?? 3 / 2;
        const w = Math.min(width, height * aspect);
        canvas.style.width = `${Math.floor(w)}px`;
        canvas.style.height = `${Math.floor(w / aspect)}px`;
    }
}
/**
 * The factory a host constructs: static identity, the configuration chain, and a
 * `start()` that boots mGBA and opens a session.
 */
export class MgbaSDK extends EngineSDKBase {
    static id = ENGINE_ID;
    /** Kept in step with package.json. */
    static version = '0.1.1';
    static name = 'mGBA';
    static description = 'mGBA, the Game Boy Advance / Game Boy / Game Boy Color emulator, compiled to WebAssembly. Ships no games: the player provides the ROM, and it never leaves their browser.';
    createPlay(init, events) {
        return new MgbaPlay(init, events);
    }
}
/** CI's conformance line: if this class stops satisfying the contract, `make test` fails. */
export const MGBA_ENGINE = MgbaSDK;
export default MgbaSDK;
//# sourceMappingURL=mgba.sdk.js.map