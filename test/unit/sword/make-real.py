# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# Makes SWORD test packages with SWORD's own writer programs (imp2vs, imp2ld, imp2gbs from libsword-utils), so the files are not
# written from my own reading of the format. Run from the repository root:  python3 test/unit/sword/make-real.py
import json, os, subprocess, tempfile, zipfile, shutil
C = json.load(open('app/lib/sword_canons.json'))
out = 'test/unit/sword/real'; os.makedirs(out, exist_ok=True)
BOOKS = {'Gen', 'Ps', 'Matt', 'John', 'Rev', 'Sir', 'Tob', 'Dan'}
def picks(vers):
    r = []
    for t in ('ot', 'nt'):
        for osis, counts in C[vers][t]:
            if osis in BOOKS:
                for c, n in enumerate(counts, 1):
                    for v in range(1, n + 1):
                        if v in (1, n) or (c == 1 and v < 4): r.append((osis, c, v))
    return r
expect = {}
def pack(name, files, conf):
    with zipfile.ZipFile(f'{out}/{name}.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(f'mods.d/{name.lower()}.conf', conf)
        for arc, path in files: z.write(path, arc)
def verse_module(name, vers, comp, block, wide, kind='text'):
    v = picks(vers); expect[name] = {'vers': vers, 'verses': v, 'kind': kind}
    imp = ''.join(f'$$${o}.{c}.{x}\n{o} {c}:{x} text <w lemma="strong:G{c}{x}">w</w>.\n' for o, c, x in v)
    tmp = tempfile.mkdtemp(); open(f'{tmp}/in.imp', 'w').write(imp); os.makedirs(f'{tmp}/m')
    args = ['imp2vs', f'{tmp}/in.imp', '-o', f'{tmp}/m/', '-v', vers.capitalize() if vers not in ('nrsva', 'kjva', 'darbyfr', 'mt', 'synodalprot', 'catholic2', 'lxx', 'nrsv') else {'nrsva': 'NRSVA', 'kjva': 'KJVA', 'darbyfr': 'DarbyFr', 'mt': 'MT', 'synodalprot': 'SynodalProt', 'catholic2': 'Catholic2', 'lxx': 'LXX', 'nrsv': 'NRSV'}[vers]]
    if comp: args += ['-z', comp, '-b', {'book': '4', 'chapter': '3', 'verse': '2'}[block]]
    if wide: args += ['-4']
    subprocess.run(args, check=True, capture_output=True)
    base = {'text': ('zText', 'RawText', 'texts'), 'com': ('zCom', 'RawCom', 'comments')}[kind]
    drv = (base[0] if comp else base[1]) + ('4' if wide else '')
    d = f'modules/{base[2]}/{drv.lower().rstrip("4") if False else ("ztext" if kind=="text" else "zcom") if comp else ("rawtext" if kind=="text" else "rawcom")}/{name.lower()}/'
    conf = f'[{name}]\nDataPath=./{d}\nModDrv={drv}\n' + (f'CompressType={ {"z":"ZIP","b":"BZIP2","x":"XZ","l":"LZSS"}[comp] }\nBlockType={block.upper()}\n' if comp else '') + f'SourceType=OSIS\nEncoding=UTF-8\nVersification={vers.upper()}\nDescription=Test {name}\n'
    pack(name, [(d + f, f'{tmp}/m/{f}') for f in os.listdir(f'{tmp}/m')], conf); shutil.rmtree(tmp)
for vers in C: verse_module('V_' + vers, vers, 'z', 'book', False)
verse_module('Raw', 'kjv', None, 'book', False); verse_module('Raw4', 'kjv', None, 'book', True)
verse_module('Z4', 'kjv', 'z', 'book', True); verse_module('ZVerse', 'kjv', 'z', 'verse', False); verse_module('ZChap', 'kjv', 'z', 'chapter', False)
verse_module('Bz', 'kjv', 'b', 'book', False); verse_module('Xz', 'kjv', 'x', 'book', False)
verse_module('ComZ', 'kjv', 'z', 'book', False, 'com'); verse_module('ComRaw', 'kjv', None, 'book', False, 'com'); verse_module('ComZ4', 'kjv', 'z', 'book', True, 'com')
# dictionaries (imp2ld) and a general book (imp2gbs)
DICT = [('Abraham', 'Abraham was the father of Isaac. See <ref target="Test:Isaac">Isaac</ref>.'), ('apple', 'An apple, a fruit: <b>red</b>.'), ('Zebra', 'Striped.'), ('Isaac', 'Isaac was the son of Abraham and Sarah.'), ('Çedille', 'Not ascii: ΑΩ.')]
for name, flags, drv, comp in [('LdRaw', [], 'RawLD', ''), ('LdRaw4', ['-4'], 'RawLD4', ''), ('LdZ', ['-z', 'z'], 'zLD', 'ZIP'), ('LdBz', ['-z', 'b'], 'zLD', 'BZIP2'), ('LdXz', ['-z', 'x'], 'zLD', 'XZ')]:
    tmp = tempfile.mkdtemp(); open(f'{tmp}/in.imp', 'w').write(''.join(f'$$${k}\n{t}\n' for k, t in DICT)); os.makedirs(f'{tmp}/m')
    subprocess.run(['imp2ld', f'{tmp}/in.imp', '-s', '-o', f'{tmp}/m/d'] + flags, check=True, capture_output=True)
    d = f'modules/lexdict/{"zld" if comp else "rawld"}/{name.lower()}/'
    conf = f'[{name}]\nDataPath=./{d}d\nModDrv={drv}\n' + (f'CompressType={comp}\n' if comp else '') + f'SourceType=OSIS\nEncoding=UTF-8\nDescription=Test {name}\n'
    pack(name, [(d + f, f'{tmp}/m/{f}') for f in os.listdir(f'{tmp}/m')], conf); shutil.rmtree(tmp)
GB = [('Chapter One', 'First chapter text.'), ('Chapter One/Section A', 'Section A text with <b>bold</b>.'), ('Chapter One/Section B', 'Section B text.'), ('Chapter Two', 'Second chapter.'), ('Chapter Two/Deep/Leaf', 'Leaf text.')]
tmp = tempfile.mkdtemp(); open(f'{tmp}/in.imp', 'w').write(''.join(f'$$${k}\n{t}\n' for k, t in GB)); os.makedirs(f'{tmp}/m')
subprocess.run(['imp2gbs', f'{tmp}/in.imp', '-o', f'{tmp}/m/g'], check=True, capture_output=True)
d = 'modules/genbook/rawgenbook/gbook/'
pack('GBook', [(d + f, f'{tmp}/m/{f}') for f in os.listdir(f'{tmp}/m')], f'[GBook]\nDataPath=./{d}g\nModDrv=RawGenBook\nSourceType=ThML\nEncoding=UTF-8\nDescription=Test general book\n'); shutil.rmtree(tmp)
json.dump({'verse': expect, 'dict': DICT, 'genbook': GB}, open(f'{out}/expect.json', 'w'))
