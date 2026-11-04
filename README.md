# Timotheos

Offline Bible study with theWord and e-Sword modules. This branch is the Tauri 2 edition (Windows, Linux, Android).

- `app/renderer/` – the screens (plain JavaScript, no framework)
- `app/main.js`, `app/lib/` – module readers, search, settings (the former Electron main process; unchanged)
- `tauri-shim/` – lets that code run inside Tauri: it runs in a Web Worker and reaches files and SQLite databases
  through the Rust side (`src-tauri/src/lib.rs`, custom protocol `tfs://`)
- `scripts/build-web.mjs` – builds `dist/`
- `test/tauri/` – the UI checks (`bash test/tauri/all.sh`, needs `xvfb`)

Build: `npm ci`, then `npx tauri build` (desktop) or `npx tauri android build --apk` (needs the Android SDK and NDK).
GitHub Actions builds all three (see `.github/workflows/build.yml`).

The Electron edition lives on the branch `electron-0.6`. Licence: MIT.
