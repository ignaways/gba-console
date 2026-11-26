export const DEFAULT_MGBA_OPTIONS = {
    system: 'auto',
    gbModel: 'auto',
    idleOptimization: 'remove',
    skipBios: true,
    allowOpposingDirections: false,
    renderFilter: 'pixelated',
    aspect: 'native',
    interframeBlending: false,
    volume: 1.0,
    gamepads: true,
    logLevel: 'error',
};
/** Platform ids consumed by `mgbawasm_setup()` (mPLATFORM_* in core/core.h). */
export const MGBA_PLATFORM_IDS = {
    auto: -1,
    gba: 0,
    gb: 1,
};
/** Values mGBA's `gb.model` config key takes; `auto` means "leave unset". */
export const MGBA_GB_MODEL_VALUES = {
    auto: null,
    dmg: 'DMG',
    sgb: 'SGB',
    cgb: 'CGB',
    agb: 'AGB',
};
export const MGBA_LOG_LEVEL_IDS = {
    off: 0,
    error: 1,
    debug: 2,
};
export const MGBA_OPTION_GROUPS = [
    {
        id: 'video',
        label: 'Video',
        options: [
            {
                key: 'renderFilter',
                label: 'Image filtering',
                description: 'Scaling filter applied when the picture is stretched to the canvas. Pixelated keeps pixel art crisp; smooth softens it.',
                type: 'enum',
                default: DEFAULT_MGBA_OPTIONS.renderFilter,
                values: [
                    { value: 'pixelated', label: 'Pixelated' },
                    { value: 'smooth', label: 'Smooth' },
                ],
            },
            {
                key: 'aspect',
                label: 'Aspect ratio',
                description: 'Native is square pixels, as the handheld LCDs had them: 3:2 on GBA, 10:9 on Game Boy. 4:3 stretches the picture into a TV-shaped frame.',
                type: 'enum',
                default: DEFAULT_MGBA_OPTIONS.aspect,
                values: [
                    { value: 'native', label: 'Native' },
                    { value: '4:3', label: '4:3' },
                ],
            },
            {
                key: 'interframeBlending',
                label: 'Interframe blending',
                description: 'Blend each frame with the previous one, approximating the ghosting of the original unlit LCD. Restores transparency effects that games drew by flickering sprites every other frame.',
                type: 'boolean',
                default: DEFAULT_MGBA_OPTIONS.interframeBlending,
            },
        ],
    },
    {
        id: 'audio',
        label: 'Audio',
        options: [
            {
                key: 'volume',
                label: 'Volume',
                description: 'Master audio volume.',
                type: 'number',
                default: DEFAULT_MGBA_OPTIONS.volume,
                values: [
                    { value: 0, label: 'Mute' },
                    { value: 0.25, label: '25%' },
                    { value: 0.5, label: '50%' },
                    { value: 0.75, label: '75%' },
                    { value: 1, label: '100%' },
                ],
                range: { minimum: 0, maximum: 1 },
            },
        ],
    },
    {
        id: 'emulation',
        label: 'Emulation',
        options: [
            {
                key: 'system',
                label: 'System',
                description: 'Which core boots the ROM. Auto sniffs the image, which is right for every well-formed dump; force it for headerless or mislabelled files.',
                type: 'enum',
                default: DEFAULT_MGBA_OPTIONS.system,
                requiresReset: true,
                values: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'gba', label: 'GBA' },
                    { value: 'gb', label: 'Game Boy' },
                ],
            },
            {
                key: 'gbModel',
                label: 'Game Boy model',
                description: 'Hardware the Game Boy core emulates. Auto follows the cartridge header. Ignored when a GBA ROM is loaded.',
                type: 'enum',
                default: DEFAULT_MGBA_OPTIONS.gbModel,
                requiresReset: true,
                values: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'dmg', label: 'DMG' },
                    { value: 'sgb', label: 'Super GB' },
                    { value: 'cgb', label: 'Color' },
                    { value: 'agb', label: 'GBA' },
                ],
            },
            {
                key: 'idleOptimization',
                label: 'Idle loops',
                description: 'How the GBA core treats the busy-wait loops games spin in. Remove skips them and is where nearly all of the speed comes from; ignore emulates them cycle for cycle.',
                type: 'enum',
                default: DEFAULT_MGBA_OPTIONS.idleOptimization,
                values: [
                    { value: 'remove', label: 'Remove' },
                    { value: 'detect', label: 'Detect' },
                    { value: 'ignore', label: 'Ignore' },
                ],
            },
            {
                key: 'skipBios',
                label: 'Skip BIOS intro',
                description: 'Jump straight into the game instead of playing the boot animation. Forced on when no BIOS image was supplied, since the built-in HLE BIOS has no intro.',
                type: 'boolean',
                default: DEFAULT_MGBA_OPTIONS.skipBios,
                requiresReset: true,
            },
        ],
    },
    {
        id: 'controllers',
        label: 'Controllers',
        options: [
            {
                key: 'allowOpposingDirections',
                label: 'Opposing directions',
                description: 'Let the D-pad report left+right (or up+down) at once. Real hardware cannot, and a few games misbehave when it happens.',
                type: 'boolean',
                default: DEFAULT_MGBA_OPTIONS.allowOpposingDirections,
            },
            {
                key: 'gamepads',
                label: 'Gamepads',
                description: 'Poll connected gamepads (standard mapping) each frame.',
                type: 'boolean',
                default: DEFAULT_MGBA_OPTIONS.gamepads,
            },
        ],
    },
    {
        id: 'debug',
        label: 'Debug',
        options: [
            {
                key: 'logLevel',
                label: 'Core logging',
                description: 'Core messages printed to the browser console: errors and warnings, or also its informational ones.',
                type: 'enum',
                default: DEFAULT_MGBA_OPTIONS.logLevel,
                values: [
                    { value: 'off', label: 'Off' },
                    { value: 'error', label: 'Errors' },
                    { value: 'debug', label: 'Debug' },
                ],
            },
        ],
    },
];
/** Flat view of every runtime-tweakable option across all groups. */
export const MGBA_ENGINE_OPTIONS = MGBA_OPTION_GROUPS.flatMap((group) => group.options);
const OPTION_BY_KEY = new Map(MGBA_ENGINE_OPTIONS.map((option) => [option.key, option]));
export function mgbaOption(key) {
    return OPTION_BY_KEY.get(key);
}
/**
 * Coerces a host- or storage-supplied value to what the option accepts,
 * returning `undefined` when it is not a value the option can take. Numbers
 * outside a `range` are clamped rather than rejected; enums are exact.
 */
export function coerceOptionValue(option, value) {
    if (option.type === 'boolean') {
        return typeof value === 'boolean' ? value : undefined;
    }
    if (option.type === 'enum') {
        const next = String(value);
        return option.values.some((choice) => choice.value === next) ? next : undefined;
    }
    const next = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(next))
        return undefined;
    if (option.range) {
        return Math.min(option.range.maximum, Math.max(option.range.minimum, next));
    }
    return option.values.some((choice) => choice.value === next) ? next : undefined;
}
/**
 * Projects the catalog onto the shape `@wasm-gaming/engine-specs` (>=0.2.5)
 * feeds its `esc-menu` component.
 *
 * The menu lives in the demo shell now, not in this package: the shell renders
 * the rows and emits `option-change`, and the host writes the value back
 * through `engine.config`. Since the component only draws chips for `boolean`
 * and `enum`, numeric options are handed over as an enum of their menu choices
 * — the numbers survive, because the chips compare values with `===`.
 *
 * Pass the running engine's `config.values()` so the menu opens on what the
 * emulator is actually set to rather than on this package's defaults.
 */
export function toEscMenuGroups(values = {}) {
    return MGBA_OPTION_GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        options: group.options.map((option) => ({
            key: option.key,
            label: option.label,
            description: option.description,
            type: option.type === 'boolean' ? 'boolean' : 'enum',
            value: values[option.key] ?? option.default,
            ...(option.type === 'boolean' ? {} : { values: option.values }),
            ...(option.requiresReset ? { requiresReset: true } : {}),
        })),
    }));
}
/** The GBA picture: 240 × 160 (Game Boy: 160 × 144; 256 × 224 with a Super Game Boy border). */
export const MGBA_VIDEO = { width: 240, height: 160, aspect: '3:2' };
/** One option of the catalog as the contract describes it: live unless it needs a reset. */
/**
 * The settings screen's words (engine-specs `settingsModel()`): the Spanish of each label and
 * value label, and the screen section of each catalog group. A group without a section
 * (`debug`) is not shown to players.
 */
const SETTING_GROUP = {
    video: 'video',
    audio: 'audio',
    emulation: 'emulation',
    controllers: 'emulation',
};
const SPANISH = {
    renderFilter: { label: 'Suavizado', values: { pixelated: 'Píxeles nítidos', smooth: 'Suavizado' } },
    aspect: { label: 'Proporción', values: { native: 'Nativa' } },
    interframeBlending: { label: 'Fusión de fotogramas' },
    volume: { label: 'Volumen', values: { Mute: 'Silencio' } },
    system: { label: 'Sistema', values: { auto: 'Automático' } },
    gbModel: { label: 'Modelo de Game Boy', values: { auto: 'Automático' } },
    idleOptimization: { label: 'Bucles de espera', values: { remove: 'Quitar', detect: 'Detectar', ignore: 'Emular' } },
    skipBios: { label: 'Saltar la intro de la BIOS' },
    allowOpposingDirections: { label: 'Direcciones opuestas' },
    gamepads: { label: 'Mandos' },
};
const groupOf = (key) => MGBA_OPTION_GROUPS.find((group) => group.options.some((option) => option.key === key))?.id;
function settingFields(option) {
    const group = SETTING_GROUP[groupOf(option.key) ?? ''];
    if (!group)
        return {};
    const es = SPANISH[option.key];
    const label = es ? { en: option.label, es: es.label } : option.label;
    if (option.type === 'boolean')
        return { label, group };
    const valueLabels = option.values.map((choice) => {
        const spanish = es?.values?.[String(choice.value)] ?? es?.values?.[choice.label];
        return spanish ? { en: choice.label, es: spanish } : choice.label;
    });
    return { label, group, valueLabels };
}
function specForOption(option) {
    return {
        default: option.default,
        description: option.description,
        live: !option.requiresReset,
        ...(option.type === 'boolean'
            ? { enum: [true, false] }
            : { enum: option.values.map((choice) => choice.value) }),
        ...settingFields(option),
    };
}
export const MGBA_SPEC = {
    config: {
        jsUrl: { live: false, description: 'Emscripten glue URL. Defaults to ./mgba.js.' },
        wasmUrl: { live: false, description: 'WASM URL. Defaults to ./mgba.wasm.' },
    },
    options: Object.fromEntries(MGBA_ENGINE_OPTIONS.map((option) => [option.key, specForOption(option)])),
    assets: {
        rom: {
            allowedTypes: ['.gba', '.gb', '.gbc', '.sgb', '.zip'],
            live: false,
            description: 'The Game Boy Advance / Game Boy / Game Boy Color cartridge, or a zip holding one. Required to start.',
        },
        bios: {
            allowedTypes: ['.bin', '.gba', '.rom'],
            live: false,
            description: 'A real GBA BIOS (16 KiB). Optional: mGBA replaces it with its own high-level BIOS.',
        },
    },
    storage: {
        namespace: {
            default: 'default',
            live: false,
            description: "Folder for this game's battery RAM and save states (OPFS mgba/<namespace>/).",
        },
        persist: {
            enum: ['opfs', null],
            live: false,
            description: 'null keeps nothing; otherwise the folder is mirrored to OPFS.',
        },
    },
};
//# sourceMappingURL=mgba.options.js.map