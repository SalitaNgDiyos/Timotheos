# Timotheos
Open Source Bible App that supports theWord and e-Sword

## Tanglaw Bible – Tauri edition (proof of concept, 0.5.0)

The next Tanglaw: the same look and the same module readers as the Electron version (0.4.x), on
**Tauri 2** + **TypeScript**, so one code base builds for **Windows, Linux and Android**.

What it does now (proof of concept):
- finds theWord (.ont/.ot/.nt) and e-Sword (.bblx/.bbli) Bibles in Tanglaw's own module folder and in
  folders you add (desktop) or modules you import (desktop and Android);
- shows a chapter, several Bibles side by side (desktop) or one under another (phone);
- the Apocrypha in its 1611 KJV place, or (Options) all books in one Old Testament in the Septuagint order of
  NETS or the Greek Orthodox order; e-Sword's Daniel 13–14 as Susanna / Bel;
- Strong's numbers, red letters, italics, headings, footnotes (theWord tags rendered by the same
  `render.js`), Strong's popups from theWord .dct.twm and e-Sword lexicons/dictionaries
  (popup with the mouse, bottom sheet on a phone), with the morphology dictionary entry first for tagged words;
- the eight skins; a title bar drawn in the skin (Tauri draws no system frame);
- phone layout: book → chapter picker sheet, swipe left/right for the next/previous chapter;
- **study panel** (beside the text on a computer, full screen on a phone): **Commentary** follows the
  selected verse (filled dot = comment on this verse, ring = on the passage/chapter/book; "c" marks in the
  text), **Library** opens any commentary, dictionary, book or devotional (topic list, filter, back,
  previous/next topic; Bible references in entries – also plain-text ones like "1 Cor. 13:4-7" or
  e-Sword's "Joh_3:16" – are links that show the verse when the mouse rests on them), **Search** with
  theWord-style queries (AND/OR/NOT, "phrases", wildcards, G/H Strong's numbers, morphology, NEAR) –
  the same engine as the Electron version – with predefined and custom ranges (saved by name), options,
  Books and Statistics views, and earlier searches;
- **docking panes** as in the Electron edition (`dock.ts`): each side (left, right, bottom) holds several
  panes; drag a tab or title bar onto the edge arrows or a pane's compass (tab / above / below), or elsewhere
  to float it; per-pane A−/A+ (and Ctrl+wheel), float, maximize, close; Commentary, Library, Search, My
  Study, Dictionary (follows the word under the mouse), and any number of Bible views and book views, each
  in a pane of its own; ready-made and saved layouts; one full-screen panel on a phone;
- **books & chapters icon** on the Bible caption and every Bible view; resizable topic lists;
- **Options menu**: what to show, text size, order of the books, the Options window;
- **your study**: highlights (selection or whole verse, five colours, underline, bold), notes under the
  verses (typed references become links), verse lists, a **My Study** tab; right-click a
  verse (long-press on a phone) for the verse menu; the same data file layout as Tanglaw 0.4, with a
  copy kept for each of the last 7 days;
- **Copy Verses** window (F5 or the copy button): From/To pickers (book → chapter → verse), mouse wheel
  or PageUp/PageDown to widen the range (Shift: by chapter), formats with templates, live preview,
  resizable; the format is remembered;
- **cross-references** under each verse from theWord `.xrefs.twm` sets in your module folders
  (each verse once, in Bible order; [brackets] = verses that point here; hover for the text); add your own from the verse menu, kept in
  the same open format, and remove them with ×;
- **reading plans** (My Study → Reading): whole Bible, NT, Psalms/Proverbs and more, by days, end date or
  chapters per sitting, catch up, restart, schedule;
- **verse list** beside book and chapter at the top (phone picker: book → chapter → verse);
- **module properties** (ⓘ in the Bibles menu and the Library): About as an editable page, details, all
  settings, make the file smaller (compact; compress theWord books); the original is kept once as
  `<file>.tanglaw-backup` and can be put back;
- **import report**: each imported file is checked first; .zip/.twzip unpacked; encrypted modules,
  installers and unsupported files are refused with the reason;
- **user guide** (F1 or the ? button), with contents and find;
- **Options** (Skin menu → Options…, or Ctrl+,): skin, coloured captions, Bible text font, Greek and Hebrew fonts, size, line
  spacing, text width, background colour and paper texture, verse numbers in a column, in the text or
  hidden, plain/bold/circled;
- **first start on a computer that has Tanglaw 0.4**: its module folders, open Bibles, place, skin and
  all study data are taken over automatically (from `%APPDATA%\Tanglaw Bible`); Tanglaw 0.4 itself is
  not changed;
- keys: ← → chapter, Ctrl+← → book, ↑ ↓ verse, type a number for a verse (Shift: chapter), Alt+← →
  or Backspace for history, Ctrl+L add to list, Ctrl+C copy verse, F5 Copy Verses, Ctrl+, Options, F1 guide.
Encrypted modules are skipped quietly (the import report says why) and never decoded.

## How it is built
- `src-tauri/src/lib.rs` – the native side, kept thin: find module files, read theWord text Bibles
  line by line, **read-only** SQLite queries (native SQLite, so modules are not loaded into memory as a
  whole – needed on phones), settings, import. No module format knowledge lives here.
- `src/*.ts` – everything that understands modules and the screen, in TypeScript:
  `bibles.ts` (theWord + e-Sword Bibles), `books.ts` (commentaries, dictionaries, books, devotionals –
  port of lib/bookmod.js), `panel.ts` (Commentary, Library), `search.ts`, `dock.ts` (panel places),
  `study.ts`, `copy.ts`, `xrefs.ts`, `refs.ts` (references in text), `plans.ts`, `options.ts`,
  `modprops.ts` + `props.ts` (module properties), `importer.ts`, `guide.ts`, `main.ts` (screen),
  `skins.ts`, `native.ts` (calls to the native side). The native side only writes to a module when you
  save its properties or make it smaller (on a copy that is then swapped in; the original is kept once).
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
checks the study tools and taking over data from Tanglaw 0.4; `test/features.js` checks Copy Verses,
cross-references, references in commentaries, the verse list, reading plans and Options; `test/search.js`
search ranges, books and statistics; `test/panels.js` the panel places and the guide;
`test/props-setup.sh` then `FOLDERS='["/tmp/claude-0/propmods"]' test/run.sh test/props.js shot.png 60`
module properties and the import report (on copies of the test modules).

## Not yet moved over from 0.4.x
The option to put the Apocrypha after the New Testament; printing.
