#!/bin/bash
# copies of test modules for test/props.js (the originals are never changed), and files to import
P=/tmp/claude-0/propmods; I=/tmp/claude-0/imports
rm -rf $P $I; mkdir -p $P $I
cp /home/claude/testmods/kjv.ont "/home/claude/testmods/Test Dictionary.dct.twm" /home/claude/testmods/esword/TestCmt11.cmti /home/claude/testmods/esword/TestDict11.dcti $P/
cp /home/claude/testmods/kjvplain.ont $I/
cp /home/claude/testmods/esword/TestTopics.topx $I/
cp /home/claude/testmods/esword/Test.harx $I/
printf 'not really' > $I/Secret.ontx
printf 'MZ' > $I/setup.exe
printf 'hello' > $I/notes.txt
python3 - <<'P'
import zipfile
with zipfile.ZipFile('/tmp/claude-0/imports/pack.twzip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('/home/claude/testmods/Test Book.gbk.twm', 'mods/Test Book.gbk.twm')
    z.writestr('readme.txt', 'x')
P
