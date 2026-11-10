#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
"""Writes THIRD-PARTY-LICENSES.md: every Rust crate (Windows, Linux and Android builds) and every npm package that is
built into the app, with its licence and the licence/copyright files shipped in its own source, grouped by identical text.
Needs: cargo (crates fetched, run `cargo fetch` in src-tauri first) and `npm ci`. Usage: python3 scripts/gen-third-party.py"""
import glob, hashlib, json, os, subprocess, sys, collections

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
reg = glob.glob(os.path.expanduser('~/.cargo/registry/src/*/'))
NAMES = ('LICENSE', 'LICENCE', 'COPYING', 'NOTICE', 'UNLICENSE', 'COPYRIGHT')
def texts(d):
    out = []
    if not d or not os.path.isdir(d): return out
    for f in sorted(os.listdir(d)):
        up = f.upper()
        if any(up.startswith(n) for n in NAMES) and os.path.isfile(os.path.join(d, f)) and os.path.getsize(os.path.join(d, f)) < 200000:
            try: out.append((f, open(os.path.join(d, f), encoding='utf-8', errors='replace').read().strip()))
            except OSError: pass
    return out

pk = {}
for t in ('x86_64-pc-windows-msvc', 'x86_64-unknown-linux-gnu', 'aarch64-linux-android'):
    m = json.loads(subprocess.run(['cargo', 'metadata', '--format-version', '1', '--locked', '--filter-platform', t], cwd=os.path.join(root, 'src-tauri'), capture_output=True, text=True, check=True).stdout)
    for p in m['packages']:
        if p['source'] is None: continue
        pk[(p['name'], p['version'])] = p
rows, groups = [], collections.OrderedDict()
def add(kind, name, ver, lic, repo, tx):
    rows.append((kind, name, ver, lic or '(see files)', repo or ''))
    if not tx: tx = [('(none shipped)', f'No licence file ships with this package; it declares: {lic}.')]
    for fn, body in tx:
        h = hashlib.sha256(' '.join(body.split()).encode()).hexdigest()
        g = groups.setdefault(h, {'body': body, 'who': []}); g['who'].append(f'{name} {ver}')
for (n, v), p in sorted(pk.items()):
    d = None
    for r in reg:
        c = os.path.join(r, f'{n}-{v}')
        if os.path.isdir(c): d = c; break
    add('Rust crate', n, v, p.get('license'), p.get('repository'), texts(d))
NPM = ['@tauri-apps/api', '@tauri-apps/plugin-clipboard-manager', '@tauri-apps/plugin-dialog', '@tauri-apps/plugin-opener', 'buffer', 'base64-js', 'ieee754', 'fflate', 'pathe', 'path-browserify']
for n in NPM:
    d = os.path.join(root, 'node_modules', n); j = json.load(open(os.path.join(d, 'package.json')))
    rep = j.get('repository'); rep = rep.get('url') if isinstance(rep, dict) else rep
    add('npm package', n, j['version'], j.get('license'), rep, texts(d))
head = open(os.path.join(root, 'scripts', 'third-party-head.md'), encoding='utf-8').read()
with open(os.path.join(root, 'THIRD-PARTY-LICENSES.md'), 'w', encoding='utf-8') as f:
    f.write(head.rstrip() + '\n\n## Packages built into Timotheos\n\n| Kind | Name | Version | Licence (as declared) | Source |\n|---|---|---|---|---|\n')
    for k, n, v, l, r in rows: f.write(f'| {k} | {n} | {v} | {l} | {r} |\n')
    f.write('\n## Licence and copyright texts\n\nEach text is printed once, followed by the packages that ship it.\n')
    for i, g in enumerate(groups.values(), 1):
        who = ', '.join(sorted(set(g['who'])))
        f.write(f'\n### Text {i}\n\nUsed by: {who}\n\n```text\n{g["body"]}\n```\n')
print(len(rows), 'packages,', len(groups), 'distinct texts')
