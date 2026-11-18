# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# Makes small SWORD "Raw ZIP" test packages (written from the SWORD file-format description, NOT with SWORD's own tools):
#   python3 test/unit/sword/make.py   (run from the repository root)
import json, struct, zlib, bz2, lzma, zipfile, os
C = json.load(open('app/lib/sword_canons.json'))
out = 'test/unit/sword'
VERSES = {  # (osis, chapter, verse): marked-up text
 ('Matt',5,3): '<w lemma="strong:G3107" morph="robinson:A-NPM">Blessed</w> <w lemma="strong:G3588">are</w> the poor<note type="study">a footnote &amp; more</note>',
 ('John',3,16): 'For God so loved the world<note type="crossReference"><reference osisRef="Rom.5.8">Rom 5:8</reference></note>, <q who="Jesus" marker="">that he gave his only <transChange type="added">begotten</transChange> Son</q>. <divineName>Lord</divineName>',
 ('Matt',1,1): '<title>The genealogy</title>The book of the generation of Jesus Christ,<lb/>the son of David.',
 ('Rev',22,21): 'Grace be with you all. Amen.',
}
def build(name, driver, comp, canon, block='BOOK', src='OSIS', extra='', lang='en', only=('nt',)):
    d = f'modules/texts/{"ztext" if driver.startswith("z") else "rawtext"}/{name.lower()}/'
    files = {}
    for t in only:
        recs = []  # list of text per index
        recs += [b'', b'']  # module and testament headings
        for osis, counts in C[canon][t]:
            recs.append(b'')  # book heading
            for ci, n in enumerate(counts, 1):
                recs.append(b'')  # chapter heading
                for v in range(1, n + 1):
                    recs.append(VERSES.get((osis, ci, v), '').encode('utf-8'))
        assert not driver.startswith('z') or True
        if driver.startswith('z'):
            wide = driver.endswith('4'); bl = {'BOOK':'b','CHAPTER':'c','VERSE':'v'}[block]
            # one block per book (BOOK); the test modules use BOOK or VERSE blocks only
            blocks = []; vrec = []
            if block == 'BOOK':
                i = 2; groups = []
                for osis, counts in C[canon][t]:
                    n = 1 + sum(counts) + len(counts); groups.append(range(i, i + n)); i += n
                groups.insert(0, range(0, 2))
            else:
                groups = [range(i, i + 1) for i in range(len(recs))]
            for g in groups:
                buf = b''; pos = {}
                for i in g: pos[i] = (len(buf), len(recs[i])); buf += recs[i]
                blocks.append((buf, pos))
            bzz = b''; bzs = b''; vv = {}
            for bn, (buf, pos) in enumerate(blocks):
                cb = zlib.compress(buf) if comp == 'ZIP' else bz2.compress(buf) if comp == 'BZIP2' else lzma.compress(buf)
                bzs += struct.pack('<III', len(bzz), len(cb), len(buf)); bzz += cb
                for i, (st, ln) in pos.items(): vv[i] = (bn, st, ln)
            bzv = b''.join(struct.pack('<III' if wide else '<IIH', *vv[i][:2], vv[i][2]) for i in range(len(recs)))
            files[d + f'{t}.{bl}zz'] = bzz; files[d + f'{t}.{bl}zs'] = bzs; files[d + f'{t}.{bl}zv'] = bzv
        else:
            wide = driver.endswith('4'); txt = b''; vss = b''
            for r in recs:
                vss += struct.pack('<II' if wide else '<IH', len(txt), len(r)); txt += r
            files[d + t] = txt; files[d + t + '.vss'] = vss
    conf = f'[{name}]\nDataPath=./{d}\nModDrv={driver}\n'
    if driver.startswith('z'): conf += f'CompressType={comp}\nBlockType={block}\n'
    conf += f'SourceType={src}\nEncoding=UTF-8\nLang={lang}\nVersification={canon.upper()}\nDescription=Test {name} Bible\nAbout=Made for tests.\\par Second line.\nFeature=StrongsNumbers\n' + extra
    with zipfile.ZipFile(f'{out}/{name}.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(f'mods.d/{name.lower()}.conf', conf)
        for k, v in files.items(): z.writestr(k, v)
build('TestZ', 'zText', 'ZIP', 'kjv')
build('TestZ4', 'zText4', 'ZIP', 'kjv', block='VERSE')
build('TestRaw', 'RawText', 'ZIP', 'kjv')
build('TestRaw4', 'RawText4', 'ZIP', 'kjv')
build('TestBz', 'zText', 'BZIP2', 'kjv')
build('TestXz', 'zText', 'XZ', 'kjv')
build('TestLz', 'zText', 'LZSS', 'kjv')
build('TestLock', 'zText', 'ZIP', 'kjv', extra='CipherKey=\n')
build('TestGuess', 'zText', 'ZIP', 'kjv')   # conf below says a numbering that does not fit the index
build('TestVulg', 'zText', 'ZIP', 'vulg')
# GBF, ThML and plain text
VERSES[('Matt', 5, 3)] = 'Blessed<WG3107> are the poor<RF>a footnote<Rf> <FR>in spirit<Fr> <FI>for<Fi>'
build('TestGbf', 'zText', 'ZIP', 'kjv', src='GBF')
VERSES[('Matt', 5, 3)] = 'Blessed<sync type="Strongs" value="G3107" /> are <i>the</i> poor<note>a footnote</note>'
build('TestThml', 'zText', 'ZIP', 'kjv', src='ThML')
VERSES[('Matt', 5, 3)] = 'Blessed are the poor & humble'
build('TestPlain', 'RawText', 'ZIP', 'kjv', src='Plain')
