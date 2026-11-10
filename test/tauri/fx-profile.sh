#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# fx-profile.sh make|clean — a pretend Firefox profile in ~/.mozilla/firefox with two installed themes (with small pictures
# drawn here) and one ordinary add-on, for the "Import themes from my Firefox" test (v065.js)
ROOT="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
P="$HOME/.mozilla/firefox/twtest.default-release"
if [ "$1" = clean ]; then rm -rf "$P"; rmdir "$HOME/.mozilla/firefox" "$HOME/.mozilla" 2>/dev/null; exit 0; fi
mkdir -p "$P/extensions"
python3 - "$ROOT" "$P" <<'PY'
import sys, os, zipfile, json
root, prof = sys.argv[1], sys.argv[2]
import zlib, struct
def png(w, h, f):   # a small picture made here (no third-party art): f(x, y) -> (r, g, b)
    raw = b''.join(b'\x00' + bytes(c for x in range(w) for c in f(x, y)) for y in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
def xpi(out, manifest, files):
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('manifest.json', json.dumps(manifest))
        for n, b in files.items(): z.writestr(n, b)
# a modern theme: colours and a dark repeating background
xpi(os.path.join(prof, 'extensions', 'crimson@test.xpi'), {'manifest_version': 2, 'name': 'Crimson Test', 'version': '1.0', 'author': 'Test',
    'theme': {'images': {'additional_backgrounds': ['images/0.png']}, 'properties': {'additional_backgrounds_alignment': ['left top'], 'additional_backgrounds_tiling': ['repeat']},
              'colors': {'frame': [11, 7, 14], 'tab_background_text': [238, 194, 199], 'toolbar': [20, 0, 8, 0.65], 'toolbar_text': [244, 224, 228], 'popup': [26, 6, 15], 'popup_text': [255, 237, 234]}}},
    {'images/0.png': png(120, 40, lambda x, y: (60 + (x * 3 + y * 5) % 90, 8, 20))})
# an old-style theme: a light header picture with a dark frame colour and dark text
xpi(os.path.join(prof, 'extensions', 'birds@test.xpi'), {'manifest_version': 2, 'name': '__MSG_extName__', 'default_locale': 'en', 'version': '2.0',
    'theme': {'images': {'theme_frame': 'header.png'}, 'colors': {'frame': '#0d0d0d', 'tab_background_text': '#080808'}}},
    {'header.png': png(300, 60, lambda x, y: (235 - y, 236, 190 + x % 40)), '_locales/en/messages.json': json.dumps({'extName': {'message': 'Light Birds Test'}})})
with zipfile.ZipFile(os.path.join(prof, 'extensions', 'tool@test.xpi'), 'w') as z: z.writestr('manifest.json', json.dumps({'name': 'A tool', 'manifest_version': 2, 'version': '1'}))
ad = [{'id': 'crimson@test', 'type': 'theme', 'active': True, 'location': 'app-profile', 'path': os.path.join(prof, 'extensions', 'crimson@test.xpi'), 'defaultLocale': {'name': 'Crimson Test', 'creator': 'Test'}},
      {'id': 'birds@test', 'type': 'theme', 'active': False, 'location': 'app-profile', 'path': os.path.join(prof, 'extensions', 'birds@test.xpi'), 'defaultLocale': {'name': None, 'creator': None}},
      {'id': 'tool@test', 'type': 'extension', 'active': True, 'location': 'app-profile', 'path': os.path.join(prof, 'extensions', 'tool@test.xpi')},
      {'id': 'firefox-compact-dark@mozilla.org', 'type': 'theme', 'active': False, 'location': 'app-builtin', 'path': None}]
json.dump({'schemaVersion': 36, 'addons': ad}, open(os.path.join(prof, 'extensions.json'), 'w'))
PY
