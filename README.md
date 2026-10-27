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
- phone layout: book → chapter picker sheet, swipe left/right for the next/previous chapter;
- **study panel** (beside the text on a computer, full screen on a phone): **Commentary** follows the
  selected verse (filled dot = comment on this verse, ring = on the passage/chapter/book; "c" marks in the
  text), **Library** opens any commentary, dictionary, book or devotional (topic list, filter, back,
  previous/next topic, Bible references in entries jump to the verse), **Search** with theWord-style
  queries (AND/OR/NOT, "phrases", wildcards, G/H Strong's numbers, NEAR, ranges) – the same search
  engine as the Electron version;
- **your study**: highlights (selection or whole verse, five colours, underline, bold), notes under the
  verses (typed references become links), bookmarks 1–0, verse lists, a **My Study** tab; right-click a
  verse (long-press on a phone) for the verse menu; the same data file layout as Tanglaw 0.4, with a
  copy kept for each of the last 7 days;
- **first start on a computer that has Tanglaw 0.4**: its module folders, open Bibles, place, skin and
  all study data are taken over automatically (from `%APPDATA%\Tanglaw Bible`); Tanglaw 0.4 itself is
  not changed;
- keys: ← → chapter, Ctrl+← → book, ↑ ↓ verse, type a number for a verse (Shift: chapter), Alt+← →
  or Backspace for history, Ctrl+1…0 / Ctrl+Shift+1…0 bookmarks, Ctrl+L add to list, Ctrl+C copy verse.
Encrypted modules are listed as "cannot be opened" and never decoded.

## How it is built
- `src-tauri/src/lib.rs` – the native side, kept thin: find module files, read theWord text Bibles
  line by line, **read-only** SQLite queries (native SQLite, so modules are not loaded into memory as a
  whole – needed on phones), settings, import. No module format knowledge lives here.
- `src/*.ts` – everything that understands modules and the screen, in TypeScript:
  `bibles.ts` (theWord + e-Sword Bibles), `books.ts` (commentaries, dictionaries, books, devotionals –
  port of lib/bookmod.js), `panel.ts` (Commentary, Library, Search), `main.ts` (screen),
  `skins.ts`, `native.ts` (calls to the native side).
- `src/legacy/*.js` – shared unchanged with the Electron version: `canon.js` (books, KJV
  versification, 1611 order), `render.js` (theWord tags → HTML), `rtf.js`, `eswordfmt.js`, `search.js`.

## Build
```
npm ci
npx tauri build --bundles deb            # Linux (needs libwebkit2gtk-4.1-dev etc.)
npx tauri build --bundles nsis,msi       # Windows (on Windows)
npx tauri android init && npx tauri android build --apk   # Android (Android SDK + NDK)
```
`.github/workflows/build.yml` builds all three on GitHub's machines (Actions → Build Tanglaw).

## Test
`test/run.sh test/ui.js shot.png 30` starts the release build under a virtual screen with the test
module folders, runs `test/ui.js` in the window (env `TANGLAW_SCRIPT`), prints the results and saves a
screenshot. Add `400 800` at the end for a phone-sized window. `LEGACY=1 test/run.sh test/study.js shot.png 30`
checks the study tools and taking over data from Tanglaw 0.4.

## Not yet moved over from 0.4.x
Reading plans, Copy Verses window, search statistics and
custom ranges, cross-references, docking panels, Options window, user guide, module properties. The plan
is to move them module by module, in TypeScript.
