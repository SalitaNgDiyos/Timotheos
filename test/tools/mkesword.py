# Synthetic e-Sword modules (both generations) built from the published table layouts, for tests.
import sqlite3, os, sys, zipfile
D = sys.argv[1]
def db(name):
    p = os.path.join(D, name)
    if os.path.exists(p): os.remove(p)
    return sqlite3.connect(p)
def details(c, title, abbr, extra=''):
    c.execute('CREATE TABLE Details (Title NVARCHAR(100), Abbreviation NVARCHAR(50), Information TEXT, Version INT, OldTestament BOOL, NewTestament BOOL, Apocrypha BOOL, Strongs BOOL, RightToLeft BOOL)')
    c.execute('insert into Details values (?,?,?,?,?,?,?,?,?)', (title, abbr, 'About <b>' + title + '</b>', 1, 1, 1, 1, 1, 0))

# e-Sword 11 Bible (HTML) with Strong's, morph, notes, red letters, refs and Apocrypha (e-Sword numbers 67-78)
c = db('KJVA11.bbli'); details(c, 'King James with Apocrypha (test, e-Sword 11)', 'KJVA11')
c.execute('CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT)')
c.execute('CREATE TABLE Notes (Book INT, Chapter INT, Verse INT, ID TEXT, Note TEXT)')
rows = [
 (1,1,1,'<h2>The Creation</h2>In the beginning <num>H7225</num> God <num>H430</num> created <num>H1254</num> the heaven.<not>N1</not>'),
 (43,3,16,'<red>For God <num>G2316</num> <tvm>N-NSM</tvm> so loved <num>G25</num> <tvm>V-AAI-3S</tvm> the world,</red> <ref>Rom 5:8</ref>'),
 (17,10,3,'For Mordecai the Jew was next unto king Ahasuerus.'),
 (17,11,1,'Rest of Esther 11:1 (Greek addition).'),
 (27,13,1,'Susanna 1 as Daniel 13:1.'),
 (67,1,1,'Tobit 1:1 text.'), (68,1,1,'Judith 1:1 text.'), (69,1,1,'Wisdom 1:1 text.'), (70,1,1,'Sirach 1:1 text.'),
 (71,1,1,'Baruch 1:1 text.'), (72,1,1,'1 Maccabees 1:1 text.'), (73,1,1,'2 Maccabees 1:1 text.'), (74,1,1,'1 Esdras 1:1 text.'),
 (75,1,1,'2 Esdras 1:1 text.'), (76,1,1,'3 Maccabees 1:1 text.'), (77,1,1,'4 Maccabees 1:1 text.'), (78,1,1,'Prayer of Manasseh 1:1 text.'),
 (39,4,6,'Malachi 4:6 last verse.'), (40,1,1,'Matthew 1:1 first verse.'),
]
c.executemany('insert into Bible values (?,?,?,?)', rows)
c.execute("insert into Notes values (1,1,1,'N1','Hebrew: <i>bereshit</i>')")
c.commit()

# e-Sword 9/10 Bible (RTF)
c = db('KJV10.bblx'); details(c, 'KJV (test, e-Sword 10)', 'KJV10')
c.execute('CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT)')
c.executemany('insert into Bible values (?,?,?,?)', [
 (43,3,16,r'{\cf15 For God so loved the world}{\cf11\super  G2316}, that he gave his only begotten Son'),
 (43,3,17,r'For God sent not his Son into the world to {\i condemn} the world'),
])
c.commit()

# commentary (.cmtx, RTF) with book/chapter/verse/passage comments
c = db('TestCmt.cmtx'); details(c, 'Test e-Sword Commentary', 'ECmt')
c.execute('CREATE TABLE BookCommentary (Book INT, Comments TEXT)')
c.execute('CREATE TABLE ChapterCommentary (Book INT, Chapter INT, Comments TEXT)')
c.execute('CREATE TABLE VerseCommentary (Book INT, ChapterBegin INT, VerseBegin INT, ChapterEnd INT, VerseEnd INT, Comments TEXT)')
c.execute("insert into BookCommentary values (43, '{\\rtf1 John book intro (e-Sword).}')")
c.execute("insert into ChapterCommentary values (43, 3, '{\\rtf1 John 3 chapter note (e-Sword).}')")
c.execute("insert into VerseCommentary values (43, 3, 16, 3, 16, '{\\rtf1 {\\b John 3:16} verse note (e-Sword).}')")
c.execute("insert into VerseCommentary values (43, 3, 14, 3, 21, '{\\rtf1 Passage 3:14-21 (e-Sword).}')")
c.execute("insert into VerseCommentary values (70, 1, 1, 1, 1, '{\\rtf1 Sirach 1:1 note (e-Sword book 70).}')")
c.commit()

# e-Sword 11 commentary (HTML)
c = db('TestCmt11.cmti'); details(c, 'Test e-Sword 11 Commentary', 'ECmt11')
c.execute('CREATE TABLE VerseCommentary (Book INT, ChapterBegin INT, VerseBegin INT, ChapterEnd INT, VerseEnd INT, Comments TEXT)')
c.execute("insert into VerseCommentary values (1, 1, 1, 1, 2, '<p>Creation note (HTML). See <ref>John 1:1</ref>.</p>')")
c.commit()

# Strong's dictionary (.dctx)
c = db('TestStrong.dctx'); details(c, "Test Strong's (e-Sword)", 'EStr')
c.execute('CREATE TABLE Dictionary (Topic TEXT, Definition TEXT)')
c.executemany('insert into Dictionary values (?,?)', [('G2316', r'{\rtf1 {\b theos} God (e-Sword)}'), ('G25', r'{\rtf1 agapao}'), ('H430', r'{\rtf1 elohim}'), ('H7225', r'{\rtf1 reshith}')])
c.commit()
# word dictionary (.dcti, HTML)
c = db('TestDict11.dcti'); details(c, 'Test e-Sword 11 Dictionary', 'EDct11')
c.execute('CREATE TABLE Dictionary (Topic TEXT, Definition TEXT)')
c.executemany('insert into Dictionary values (?,?)', [('Grace', '<b>Grace</b> (e-Sword 11).'), ('World', 'The world (e-Sword 11).')])
c.commit()
# topic book (.topx)
c = db('TestTopics.topx'); details(c, 'Test e-Sword Topics', 'ETop')
c.execute('CREATE TABLE Topics (Topic TEXT, Notes TEXT)')
c.executemany('insert into Topics values (?,?)', [('Faith', r'{\rtf1 On faith.}'), ('Hope', r'{\rtf1 On hope.}')])
c.commit()
# devotional (.devx)
c = db('TestDev.devx'); details(c, 'Test e-Sword Devotional', 'EDev')
c.execute('CREATE TABLE Devotions (Month INT, Day INT, Devotion TEXT)')
c.executemany('insert into Devotions values (?,?,?)', [(10, 27, r'{\rtf1 October 27 reading (e-Sword).}'), (10, 28, r'{\rtf1 October 28 reading.}')])
c.commit()
# encrypted stand-in (not SQLite)
open(os.path.join(D, 'Locked.cmtx'), 'wb').write(os.urandom(4096))
# unsupported type
c = db('Test.refx'); c.execute('create table X (a)'); c.commit()
print('ok')
