#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
"""Puts the SPDX identifier and the copyright line at the top of every original source file that lacks one.
Usage: python3 scripts/add-headers.py   (run from anywhere inside the repository; safe to run again)"""
import os, subprocess, sys
root = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True, check=True).stdout.strip()
files = subprocess.run(['git', 'ls-files'], cwd=root, capture_output=True, text=True, check=True).stdout.split('\n')
C = ('Edmund P. Valdez', '2026')
SKIP = ('app/renderer/fonts/', 'src-tauri/icons/', 'src-tauri/gen/', 'dist/', 'node_modules/')
def hdr(ext):
    t = f'SPDX-License-Identifier: AGPL-3.0-or-later'; c = f'Copyright (C) {C[1]} {C[0]}'
    if ext in ('.js', '.mjs', '.css'): return f'/* {t}\n * {c} */\n'
    if ext in ('.rs',): return f'// {t}\n// {c}\n'
    if ext in ('.tpl',): return f'// {t}\n// {c}\n'
    if ext in ('.sh', '.py', '.yml'): return f'# {t}\n# {c}\n'
    if ext in ('.html',): return f'<!-- {t}\n     {c} -->\n'
    return None
done = skipped = 0
for rel in files:
    if not rel or rel.startswith(SKIP): continue
    ext = os.path.splitext(rel)[1]; h = hdr(ext)
    if h is None: continue
    p = os.path.join(root, rel); raw = open(p, encoding='utf-8').read()
    if 'SPDX-License-Identifier' in raw[:600]: skipped += 1; continue
    if raw.startswith('#!'):
        nl = raw.index('\n') + 1; raw = raw[:nl] + h + raw[nl:]
    elif ext == '.html' and raw.lower().startswith('<!doctype'):
        nl = raw.index('\n') + 1; raw = raw[:nl] + h + raw[nl:]
    else: raw = h + raw
    open(p, 'w', encoding='utf-8', newline='').write(raw); done += 1
print('headers added:', done, ' already had one:', skipped)
