# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# Rebuilds app/lib/sword_canons.json (verse counts per chapter for the SWORD versification
# systems) from the PySword package (MIT licence, https://pypi.org/project/PySword/):
#   python3 scripts/gen-sword-canons.py <path-to>/pysword/canons.py
import sys, json, importlib.util
spec = importlib.util.spec_from_file_location('canons', sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
out = {}
for k, v in m.canons.items():
    out[k] = {t: [[b[1], b[3]] for b in v[t]] for t in ('ot', 'nt')}
open('app/lib/sword_canons.json', 'w').write(json.dumps(out, separators=(',', ':')))
