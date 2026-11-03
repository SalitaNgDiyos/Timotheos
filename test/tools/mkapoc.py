import sqlite3, os, sys
p = os.path.join(sys.argv[1], 'Test Apocrypha.gbk.twm')
if os.path.exists(p): os.remove(p)
c = sqlite3.connect(p)
c.execute('create table config(name text, value text)')
c.execute('create table topics(id integer primary key, pid integer, subject text, rel_order integer default 1, content_type string)')
c.execute('create table content(topic_id integer primary key, data text, data2 blob)')
for k, v in {'type':'3','id':'TstApoc','title':'Test KJV Apocrypha','abbrev':'TApoc','content.type':'rtf'}.items():
    c.execute('insert into config values(?,?)', (k, v))
chapters = [('1 Esdras',1),('1 Esdras',2),('2 Esdras',1),('Tobit',1),('Tobit',2),('Judith',1),('Wisdom of Solomon',1),
            ('Sirach',1),('Baruch',1),('1 Maccabees',1),('2 Maccabees',1),('2 Maccabees',15)]
i = 0
for bk, ch in chapters:
    i += 1
    verses = ''.join('{\\*\\bkmkstart v%d}{\\*\\bkmkend v%d}{\\super %d}%s %d:%d text. ' % (v, v, v, bk, ch, v) for v in range(1, 4))
    c.execute('insert into topics values(?,?,?,?,?)', (i, 0, f'{bk} {ch}', i, None))
    c.execute('insert into content values(?,?,?)', (i, '{\\rtf1\\ansi{\\fonttbl{\\f0 Segoe UI;}}\\pard\\plain\\f0 ' + verses + '\\par}', None))
c.commit(); print('ok')
