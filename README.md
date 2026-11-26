# Konsolku — emulator GBA pribadi

Web app emulator Game Boy Advance (juga GB/GBC) berbasis mGBA yang di-compile ke WebAssembly.
ROM tidak disertakan: muat file hasil dump dari kaset milikmu sendiri.

## Menjalankan di PC

Browser tidak mengizinkan WebAssembly dimuat dari `file://`, jadi folder ini harus disajikan lewat server lokal:

```bash
cd konsolku
python3 -m http.server 8000
# buka http://localhost:8000
```

Atau pakai `npx serve .` kalau lebih suka Node.

## Menjalankan di HP Android

Cara paling enak: unggah folder ini ke repo GitHub, lalu aktifkan GitHub Pages
(Settings → Pages → branch main, folder root). Buka URL-nya di Chrome HP, lalu
"Tambahkan ke layar utama" supaya terasa seperti aplikasi. HTTPS dari GitHub Pages
diperlukan agar penyimpanan (OPFS) berfungsi. Netlify atau Vercel juga bisa (drag & drop folder).

## Fitur

- Muat ROM .gba / .gb / .gbc / .zip (tombol atau drag & drop), dan ROM terakhir diingat
- Kontrol sentuh: D-pad bisa digeser termasuk diagonal, A/B/L/R/Start/Select, getar halus
- Keyboard dan gamepad (USB/Bluetooth)
- Save in-game (battery save) otomatis tersimpan per game
- 4 slot save state dengan thumbnail
- Ekspor/impor file .sav (backup atau pindah dari emulator lain seperti My Boy!/mGBA)
- Volume, filter gambar halus, frame blending, layar penuh + kunci landscape

## Kontrol keyboard

| GBA | Tombol |
|---|---|
| D-pad | Panah |
| A / B | X / Z |
| L / R | A / S |
| Start / Select | Enter / Shift kanan |
| Menu jeda | Esc |

## Struktur

- `index.html` — UI, kontrol sentuh, menu, save/load
- `mgba/` — runtime emulator dari paket npm `@wasm-gaming/mgba-wasm` 0.3.1 (lisensi MPL-2.0)

Catatan: belum ada fast-forward karena core ini belum menyediakannya.
