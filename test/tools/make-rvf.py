#!/usr/bin/env python3
"""Makes a small RichView (RVF) book module for the tests: "RVF Test.gbk.twm".
Written by hand from TRichView's public RVF description; the text is our own.
Usage: python3 test/make-rvf.py <folder>"""
import sqlite3, struct, sys, zlib, os

def sstr(s): b = s.encode('cp1252'); return bytes([len(b)]) + b
def ident(s): return b'\x07' + sstr(s)          # an identifier value (e.g. a colour or an enum)
def i8(n): return b'\x02' + struct.pack('<b', n)
def true(): return b'\x09'
def iset(*names): return b'\x0b' + b''.join(sstr(n) for n in names) + b'\x00'
def item(**props):
    out = b'\x01'
    for k, v in props.items(): out += sstr(k.replace('_', '.')) + v
    return out + b'\x00'
def collection(*items): return b'\x0e' + b''.join(items) + b'\x00'

text_styles = collection(
    item(FontName=b'\x06' + sstr('Arial'), Size=i8(10)),                                     # 0 plain
    item(FontName=b'\x06' + sstr('Arial'), Size=i8(10), Style=iset('fsBold')),               # 1 bold
    item(FontName=b'\x06' + sstr('Arial'), Size=i8(10), Color=ident('clBlue'), Jump=true()), # 2 link
    item(FontName=b'\x06' + sstr('Arial'), Size=i8(10), Color=ident('clRed'), Style=iset('fsItalic')),  # 3 red italic
)
para_styles = collection(item(), item(Alignment=ident('rvaCenter')))

def uni(s): return s.encode('utf-16le') + ' '.encode('utf-16le')
def binrec(header, data): return header.encode() + b'\r\n' + struct.pack('<I', len(data)) + data + b'\r\n'
def rec(header, payload=b''): return header.encode() + b'\r\n' + payload

def doc(parts):
    out = b'-8 1 3\r\n'
    out += binrec('-9 1 0 0 2 1', text_styles)
    out += binrec('-9 1 0 0 2 2', para_styles)
    for p in parts: out += p
    return out

topics = {
    1: ('Grace', doc([
        rec('1 1 1 8 0', uni('Grace')),                                   # bold, centred paragraph
        rec('0 1 0 8 0', uni('Grace is the free favour of God. ')),
        rec('3 1 0 9 0', uni('Not of works.')),                           # same paragraph, red italic
        rec('-2 1 0 0 0', b'faith\r\n'),                                  # a bookmark
        rec('0 1 0 8 0', uni('See ')),
        rec('2 1 0 9 0 "tw://bible.*?id=49.2.8"', uni('Eph 2:8')),             # a link to a verse
    ])),
    2: ('Faith', doc([rec('0 1 0 8 0', uni('Faith is the substance of things hoped for. Ἐλπίς.'))])),
}

folder = sys.argv[1] if len(sys.argv) > 1 else '.'
path = os.path.join(folder, 'RVF Test.gbk.twm')
if os.path.exists(path): os.remove(path)
c = sqlite3.connect(path)
c.execute('create table config(name text, value text)')
c.execute('create table topics(id integer primary key, pid integer, subject text, rel_order integer default 1, content_type string)')
c.execute('create table content(topic_id integer primary key, data blob, data2 blob)')
for k, v in [('type', '3'), ('id', 'rvftest'), ('title', 'RVF Test'), ('abbrev', 'RVFT'), ('content.type', 'rvf'), ('compressed', '1'), ('lang', 'en')]:
    c.execute('insert into config values (?, ?)', (k, v))
for i, (subj, body) in topics.items():
    c.execute('insert into topics values (?, 0, ?, ?, null)', (i, subj, i))
    c.execute('insert into content values (?, ?, null)', (i, zlib.compress(body)))
c.commit(); print(path)
