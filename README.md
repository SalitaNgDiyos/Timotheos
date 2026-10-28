# Timotheos
Open Source Bible App that supports theWord and e-Sword

## Tanglaw Bible – Tauri edition (0.7.0)

The next Tanglaw: the same look and the same module readers as the Electron version (0.4.x), on
**Tauri 2** + **TypeScript**, so one code base builds for **Windows, Linux and Android**.

What it does now (proof of concept):
- finds theWord (.ont/.ot/.nt) and e-Sword (.bblx/.bbli) Bibles in Tanglaw's own module folder and in
  folders you add (desktop) or modules you import (desktop and Android);
- shows a chapter in **Bible views**: one Bible per view; open as many views as you like (Layouts → + New Bible view)
  and they sit side by side in the middle (desktop) or as tabs (phone);
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
- **0.6.0 – features learned from theWord's manual** (described and built in Tanglaw's own way):
  - *Bible text:* footnote marks counted through the chapter (numbers, letters or a star; optionally listed
    under the chapter), paragraph mode (P; borrows paragraph breaks from another open Bible), lemmas,
    column text (Alt+I: each word over its original word, transliteration, Strong's number, morphology and
    lemma), a Bible's own switches (theWord user toggles, e.g. V), words of Jesus / added words / headings
    styles, a font and size per Bible;
  - *Bibles menu:* order (↑ ↓), hide, Bible sets; *compare view* (Ctrl+M) with differences marked;
  - *word popups:* original word and transliteration, chosen Strong's dictionaries for Greek, Hebrew and
    morphology, order of entries, verse popups in all open Bibles, a bar (keep open, copy, to the
    Dictionary panel); word lookup dictionaries (D) for any word of the text; book views that follow the
    verse or word;
  - *search:* a References view (hover a reference for the verse), book search across commentaries,
    dictionaries and books with module sets, any number of search panels;
  - *tools:* clipboard monitor, graphics viewer for pictures in modules (RTF PNG/JPEG pictures are now
    shown), printing (Ctrl+P), your own marks in book modules, export of topics (.docx, .rtf, .html, .txt);
  - *your own modules:* commentaries, dictionaries and books written in Tanglaw (theWord .twm with
    user=1), with section links (theWord topic links);
  - Tagalog menus and windows (Options → Language / Wika) with a table to correct the translation;
  - keyboard shortcuts you can change (Ctrl+/); a once-a-day check for a newer release on GitHub
    (only tells you and opens the download page; can be switched off).
- **0.7.0 – the screen laid out as in theWord:**
  - each Bible view has its own side bar (books and chapters, previous/next, move together with the other views
    or read on alone, font and size, verse numbers, Strong's, morphology, lemmas, paragraphs, column text,
    footnotes, cross-references, headings, words of Jesus, read aloud, all options) and its own caption
    (Bible, book, chapter, verse); the book/chapter controls left the title bar;
  - the Library (book view) has its own side bar too (topic list, back, previous/next, text size, your marks,
    print, export, read aloud, properties);
  - Bible search and Book search are two separate panels;
  - **RichView book modules** (theWord .twm with content.type=rvf, e.g. many user-made commentaries) are read:
    text styles, paragraphs, links, bookmarks, pictures and tables (read only – Tanglaw does not edit them);
  - **reading aloud** for Bibles (verse by verse, on into the next chapter) and book topics, with the voices of
    the computer or phone (Windows' natural voices where installed) and of the web engine; choose a voice per
    language in Tools → Read aloud: voices….
Encrypted modules are skipped quietly (the import report says why) and never decoded.

## How it is built
- `src-tauri/src/lib.rs` – the native side, kept thin: find module files, read theWord text Bibles
  line by line, **read-only** SQLite queries (native SQLite, so modules are not loaded into memory as a
  whole – needed on phones), settings, import. No module format knowledge lives here.
- `src/*.ts` – everything that understands modules and the screen, in TypeScript:
  `bibles.ts` (theWord + e-Sword Bibles), `books.ts` (commentaries, dictionaries, books, devotionals –
  port of lib/bookmod.js), `panel.ts` (Commentary, Library), `search.ts`, `dock.ts` (panel places),
  `study.ts`, `copy.ts`, `xrefs.ts`, `refs.ts` (references in text), `plans.ts`, `options.ts`, `bibleviews.ts` (the Bible views), `rvf.ts` (RichView), `tts.ts` (reading aloud),
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
module properties and the import report (on copies of the test modules). 0.6.0 adds `test/text.js`
(footnotes, paragraphs, lemmas, Bibles menu, word popups, search references), `test/tools.js` (switches,
column text, word lookup, book search, module sets, search panels, clipboard monitor, graphics viewer,
printing, marks, export), `test/user.js` (your own modules, section links, Tagalog), `test/own.js`
(compare view, keyboard shortcuts, versions, text styles), and `test/morph.js`. 0.7.0 adds `test/newui.js`
(RichView, Library side bar, the two search panels, the Bible view side bar, reading aloud); its RichView
test module is made by `python3 test/make-rvf.py <folder>`.

## Not yet moved over from 0.4.x
The option to put the Apocrypha after the New Testament.
