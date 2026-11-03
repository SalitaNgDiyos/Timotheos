Generators for the synthetic test modules used by `test/readers.test.js` and `test/import.test.js`.

    python3 mkmods.py   <dir>          # theWord commentary/book/dictionaries/devotional/locked + kjvplain.ont
    python3 mkapoc.py   <dir>          # theWord book module with Apocrypha chapters (v1, v2 … bookmarks)
    python3 mkesword.py <dir>/esword   # e-Sword .bbli/.bblx/.cmtx/.cmti/.dctx/.dcti/.topx/.devx samples

`mkmods.py` expects theWord's own `kjv.ont`, `default.xrefs.twm` and `Mickelson's Strong.dct.twm`
copied into `<dir>` from a theWord installation (they are theWord's files and are not distributed here).
`test/real-esword.test.js` runs against real e-Sword modules in `TIMOTHEOS_REAL` (not distributed).
