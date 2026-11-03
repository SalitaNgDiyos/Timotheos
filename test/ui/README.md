Headless UI checks (Linux + xvfb). `run.sh <script.js> <out.png> [wait-ms]` starts Tanglaw with a fresh
data folder whose settings.json points at the test module folders, runs the script inside the page,
and saves a screenshot. `features.js` drives navigation keys, bookmarks, quick keys, paragraph mode,
the right-click menu, highlighting, notes, verse lists, search, rows layout, differences and reading
plans, and prints ✓/✗ for each in the Lookup panel. Edit the module folders in run.sh to your own.

`dock.js` (0.4) drags panels to the window edges, onto another panel as a tab, above a panel and onto
the text (floating), moves and re-docks a floating window, closes/reopens, maximizes, resizes with a
splitter, checks reading focus, layout presets and that the layout is saved; then switches skins, fonts
(including a Greek-only font), verse-number modes, texture and colours in the Options window.
Results are printed to the console as one `RESULT` line (run.sh shows it).

`copy.js` (0.4.1) checks the Copy Verses window: wheel / Page Up / Page Down / Shift on the From and To
buttons, the Book → Chapter → Verse picker and its book filter, ranges across books, × (one verse),
resizing and the remembered size.

`zoom.js` (0.4.2) checks the A−/A+ caption buttons and Ctrl + mouse wheel for each panel, that sizes are
kept per panel and saved, and that Ctrl + wheel never zooms the whole window.

`titlebar.js` (0.4.3): title bar and menus follow the skin, Alt+letter and arrow keys in the menus, menu
commands and shortcuts (F5 not twice), popup order (morphology first), popup resize and saved size, User
Guide window (run.sh also saves `<name>-guide.png`).

`library.js` (0.4.4): Library layout (topics left, splitter, hide), previous/next topic buttons and keys,
Properties window (edit, save, backup, compress, restore). It needs a writable test module: see
`/tmp/claude-0/runlib.sh` in the handoff; `node test/modprops.test.js` checks lib/modprops.js on copies.
