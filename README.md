# Timotheos
Open Source Bible App that supports theWord and e-Sword

## Tanglaw Bible – Tauri edition (proof of concept, 0.5.0)

The next Tanglaw: the same look and the same module readers as the Electron version (0.4.x), on
**Tauri 2** + **TypeScript**, so one code base builds for **Windows, Linux and Android**.

What it does now (proof of concept):
- finds theWord (.ont/.ot/.nt) and e-Sword (.bblx/.bbli) Bibles in Tanglaw's own module folder and in
  folders you add (desktop) or modules you import (desktop and Android);
- shows a chapter, several Bibles side by side (desktop) or one under another (phone);
- the Apocrypha in its 1611 KJV place; e-Sword's Daniel 13–14 as Susanna / Bel;
- Strong's numbers, red letters, italics, headings, footnotes (theWord tags rendered by the same
  `render.js`), Strong's popups from theWord .dct.twm and e-Sword lexicons/dictionaries
  (popup with the mouse, bottom sheet on a phone);
- the eight skins; a title bar drawn in the skin (Tauri draws no system frame);
- phone layout: book → chapter picker sheet, swipe left/right for the next/previous chapter.
Encrypted modules are listed as "cannot be opened" and never decoded.

## How it is built
- `src-tauri/src/lib.rs` – the native side, kept thin: find module files, read theWord text Bibles
  line by line, **read-only** SQLite queries (native SQLite, so modules are not loaded into memory as a
  whole – needed on phones), settings, import. No module format knowledge lives here.
- `src/*.ts` – everything that understands modules and the screen, in TypeScript:
  `bibles.ts` (theWord + e-Sword Bibles), `dict.ts` (Strong's dictionaries), `main.ts` (screen),
  `skins.ts`, `native.ts` (calls to the native side).
- `src/legacy/*.js` – shared unchanged with the Electron version: `canon.js` (books, KJV
  versification, 1611 order), `render.js` (theWord tags → HTML), `rtf.js`, `eswordfmt.js`.

## Build
```
npm ci
npx tauri build --bundles deb            # Linux (needs libwebkit2gtk-4.1-dev etc.)
npx tauri build --bundles nsis,msi       # Windows (on Windows)
npx tauri android init && npx tauri android build --apk   # Android (Android SDK + NDK)
```
`.github/workflows/build.yml` builds all three on GitHub's machines (Actions → Build Tanglaw).

## Test
`test/run.sh test/ui.js shot.png 12` starts the release build under a virtual screen with the test
module folders, runs `test/ui.js` in the window (env `TANGLAW_SCRIPT`), prints the results and saves a
screenshot. Add `400 800` at the end for a phone-sized window.

## Not yet moved over from 0.4.x
Library (commentaries, books, devotionals), search, study tools (highlights, notes, bookmarks, lists,
reading plans), Copy Verses, docking panels, Options window, user guide, module properties. The plan
is to move them module by module, in TypeScript.
