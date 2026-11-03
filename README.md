# Tanglaw Bible 0.6.0

An offline Bible study app for Windows that reads and creates **theWord** and **e-Sword** modules and shows the
**Apocrypha in the Bible view, in its 1611 King James place** (between Malachi and Matthew), or in the **Septuagint (NETS)** or **Greek Orthodox** order, side by side with your other Bibles.

## Install and run
1. Unzip the Windows package anywhere (e.g. `C:\Tools\Tanglaw Bible`).
2. Run `TanglawBible.exe`. Windows SmartScreen may warn because the program is not code-signed:
   choose *More info → Run anyway*.
   - **Portable mode (new in 0.4.9):** create a folder named `Tanglaw Data` (or an empty file `portable.json`) next to `TanglawBible.exe` to keep all settings, imported modules, and study data on a USB drive without touching `%APPDATA%`.
3. Bring in modules either way:
   - **Import** (toolbar or the *Modules* panel, or *File → Import Modules…*, *Ctrl+I*), or drag module files onto
     the window. Tanglaw checks each file, copies the ones it can use into its own library
     (`%APPDATA%\Tanglaw Bible\modules`) and shows a report saying, for every file, what it was
     recognised as or why it was not imported. `.zip` and theWord `.twzip` downloads are unpacked.
   - **Options → Modules → Add folder…** reads modules where they are (for example theWord's or e-Sword's own module
     folder) without copying them. Sub-folders are scanned (4 levels; folders starting with `-` or `.`
     are skipped, as in theWord).

Settings are stored in `%APPDATA%\Tanglaw Bible\settings.json` (or `Tanglaw Data\settings.json` in portable mode).

## What it reads and writes
| Program | Module | Extension | Shown in |
|---|---|---|---|
| theWord | Bible | `.ont` `.ot` `.nt` | Bible view. All tags: FI/FR/FO/FU, TS headings, RF footnotes, RX cross-refs, CM/CI/CL, PI/PF, WG/WH Strong's (including sub-letters and `s`/`x` flags), WT morphology + lemma, `<a>` links, `verse.rule` (with `toggle=`, `ot_only=1`, `nt_only=1`, `onsearch=1`, `regex_off=1`), `tag.rule`, and per-Bible `strongs.dct`/`morph.dct`/`lemma.dct` |
| theWord | Book with Bible text | `.gbk.twm` | Bible view (e.g. *King James Version Apocrypha*) |
| theWord | Commentary (read & user-editable) | `.cmt.twm` | Commentary tab (follows the verse), Library tab |
| theWord | Dictionary / lexicon (read & user-editable) | `.dct.twm` | Strong's & morphology popups, word lookups, Library tab |
| theWord | General book, map, devotional (read & user-editable) | `.gbk.twm` `.map.twm` `.dev.twm` | Library tab (plus Commentary tab when `verse.sync=1` / `rel_refs` is present; supports `content_type=meta` redirect link-topics and `#bkm-` footnote range popups) |
| theWord | Cross-reference set | `.xrefs.twm` | Under each verse (*Cross-refs*) |
| theWord | Headings & paragraph overlays | `.hdgs.twm` `.prgs.twm` | Applied automatically onto Bibles without built-in headings or paragraph marks |
| theWord | Verse lists & reading plans | `.vsls.twm` `.rdp.twm` | Imported into and exported from *My Study* |
| e-Sword | Bible | `.bblx` (9/10, RTF) `.bbli` (11+, HTML) | Bible view, including Strong's (`<num>`), morphology (`<tvm>`), notes, red letters, references |
| e-Sword | Commentary & study notes | `.cmtx` `.cmti` `.notx` | Commentary tab, Library tab |
| e-Sword | Dictionary / lexicon | `.dctx` `.dcti` `.lexx` `.lexi` | Strong's popups, word lookups, Library tab |
| e-Sword | Topic notes, reference books, harmonies, journals | `.topx` `.topi` `.refx` `.refi` `.harx` `.hari` `.jnlx` | Library tab |
| e-Sword | Maps / graphics | `.mapx` `.mapi` | Library tab and picture viewer |
| e-Sword | Devotional | `.devx` `.devi` | Library tab |

**Cannot be opened (by design):** encrypted modules – theWord `.ontx/.otx/.ntx` and locked/paid
`.twm` modules (`secure=1`), and encrypted e-Sword modules. Both programs' licenses forbid getting
around that protection, so Tanglaw names these modules and skips them.

## New in 0.4.9
- **Your own commentaries, dictionaries and books** (*File → New User Module…* or *New user module…* in the Modules panel): create editable `.cmt.twm`, `.dct.twm`, and `.gbk.twm` modules (`user=1`). Add, edit, rename, reorder (`↑`/`↓`), nest (`+Sub`), and delete topics in the Library panel, or write verse, passage, chapter, and book comments directly in the Commentary panel.
- **Export your personal verse notes to `.cmt.twm`** (*My Study → Notes → Export notes as .cmt.twm…*): turns your personal JSON verse notes into a standard theWord commentary module.
- **Tagalog / Filipino interface** (*Options → Skin & colours → Interface language*): switches menus, toolbar buttons, panel titles, and Options tabs between English and Tagalog immediately, plus full Tagalog book name recognition (`Exodo`, `Mga Awit`, `Mga Gawa`, `Pahayag`, etc.).
- **Customizable keyboard shortcuts** (*Options → Shortcuts*): click any action or view toggle, press a new key or key combination (with automatic conflict resolution), or reset to defaults.
- **theWord hyperlink & module enhancements**: `#bkm`, `#bkm-`, and `#bkm1-bkm2` bookmark footnote popups and anchor scrolling (`popup=0|1|2`), `content_type=meta` redirect link-topics, hybrid verse-synced books (`verse.sync=1` and `rel_refs`), target-specific Bible links (`tw://bible.MODID?id=b.c.v`), `preserve.fonts` / `preserve.fonts.list`, `tag.rule`, `verse.rule` (`ot_only`, `nt_only`, `onsearch`, `regex_off`), per-Bible dictionary properties (`strongs.dct`, `morph.dct`, `lemma.dct`), and `.hdgs.twm` / `.prgs.twm` overlays.
- **Search & study upgrades**: nested `NEARv` anywhere inside Boolean Bible searches (with cross-chapter `NEARv` option), Boolean (`AND`, `OR`, `NOT`, `XOR`), proximity (`NEARw` / `@n`), and regex operators in Book Search, Lookup panel Back/Forward history, `.vsls.twm` and `.rdp.twm` import/export, e-Sword `.mapx`/`.harx`/`.notx`/`.jnlx` support, and Portable Mode.
