# Builds synthetic test modules in theWord formats (for local testing only).
import sqlite3, os, re, sys, zlib
D = sys.argv[1]
def rtf(s): return '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Segoe UI;}}\\f0\\fs20 ' + s + '\\par}'
def mk(name, cfg, topics, extra=None):
    p = os.path.join(D, name)
    if os.path.exists(p): os.remove(p)
    c = sqlite3.connect(p)
    c.execute('create table config(name text, value text)')
    c.execute('create table topics(id integer primary key, pid integer, subject text, rel_order integer default 1, content_type string)')
    c.execute('create table content(topic_id integer primary key, data text, data2 blob)')
    for k, v in cfg.items(): c.execute('insert into config values(?,?)', (k, v))
    for i, (pid, subj, body) in enumerate(topics, 1):
        c.execute('insert into topics values(?,?,?,?,?)', (i, pid, subj, i, None))
        c.execute('insert into content values(?,?,?)', (i, rtf(body) if body is not None else None, None))
    if extra: extra(c)
    c.commit(); c.close()

# commentary: verse, passage, chapter and book level comments
cmt = [
  (0, 'John', 'Book intro: the Gospel of {\\b John}.'),
  (0, 'John 3', 'Chapter 3 overview: Nicodemus.'),
  (0, 'John 3:16', 'Verse comment on {\\i God so loved} the world. See {\\field{\\*\\fldinst HYPERLINK "tw://bible.*?id=45.5.8"}{\\fldrslt Rom 5:8}}.'),
  (0, 'John 3:14-18', 'Passage comment on 3:14-18.'),
  (0, 'Genesis 1:1-3', 'Creation: verses 1-3.'),
  (0, 'Tobit 1:1', 'Apocrypha comment on Tobit 1:1.'),
]
def refs(c):
    c.execute('create table bible_refs(topic_id integer, bi integer, ci integer, fvi integer, tvi integer, content_type text)')
    for row in [(1,43,0,0,0),(2,43,3,0,0),(3,43,3,16,16),(4,43,3,14,18),(5,1,1,1,3),(6,67,1,1,1)]:
        c.execute('insert into bible_refs values(?,?,?,?,?,null)', row)
mk('Test Commentary.cmt.twm', {'type':'2','id':'tstcmt','title':'Test Commentary','abbrev':'TCmt','content.type':'rtf','description':'Synthetic commentary for tests'}, cmt, refs)

# general book with a tree
bk = [(0,'Introduction','Intro text about {\\b grace}.'),(0,'Part One',None),(2,'Chapter A','Text A mentions John 3:16 and love.'),(2,'Chapter B','Text B.'),(0,'Love','A topic called love.')]
mk('Test Book.gbk.twm', {'type':'3','id':'tstbk','title':'Test Book','abbrev':'TBk','content.type':'rtf'}, bk)

# plain-word dictionary (non-Strong)
dc = [(0,'Grace','{\\b Grace}: unmerited favour.'),(0,'Love','Love: charity.'),(0,'Beginning','The start.'),(0,'World','The world.'),(0,'Heaven','Heaven entry.')]
mk('Test Dictionary.dct.twm', {'type':'1','id':'tstdct','title':'Test Bible Dictionary','abbrev':'TDct','content.type':'rtf'}, dc)

# plain Strong's dictionary (non-secure)
sd = [(0,'G26','{\\b agape} love'),(0,'G25','{\\b agapao} to love'),(0,'H430','{\\b elohim} God'),(0,'G2316','{\\b theos} God')]
mk('Test Strongs.dct.twm', {'type':'1','id':'tststr','title':'Test Strongs','abbrev':'TStr','content.type':'rtf','strong':'1','strong.g':'1','strong.h':'1'}, sd)

# devotional
def dev(c):
    c.execute('create table devotion(topic_id integer, monthOfYear integer, dayOfMonth integer, morningOrEvening integer)')
    for i in range(1,4): c.execute('insert into devotion values(?,?,?,0)', (i, 10, 26+i))
mk('Test Devotional.dev.twm', {'type':'3','id':'tstdev','title':'Test Devotional','abbrev':'TDev','content.type':'rtf'}, [(0,'October 27','Reading for Oct 27.'),(0,'October 28','Reading for Oct 28.'),(0,'October 29','Reading for Oct 29.')], dev)

# locked module stand-in
mk('Locked.dct.twm', {'type':'1','id':'lck','title':'Locked Module','abbrev':'Lck','secure':'1','content.type':'rtf'}, [(0,'X','secret')])

# second Bible: KJV with tags removed and a few word changes (for compare/diff tests)
src = open(os.path.join(D,'kjv.ont'), encoding='cp1252').read().split('\n')
out = []
for i, l in enumerate(src[:31102]):
    t = re.sub(r'<[^>]*>', '', l)
    if i == 26136: t = t.replace('only begotten', 'one and only')
    out.append(t)
out += ['id=tstplain', 'short.title=KJVp', 'title=KJV plain (test)', 'lang=eng']
open(os.path.join(D,'kjvplain.ont'),'w',encoding='utf-8-sig',newline='\r\n').write('\n'.join(out))
print('ok')
