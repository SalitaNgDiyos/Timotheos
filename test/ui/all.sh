#!/bin/bash
# all UI tests: bash test/ui/all.sh   (TESTS="views zoom" to pick some)
cd "$(dirname "$(readlink -f "$0")")/../.."
for t in ${TESTS:-features dock copy zoom titlebar views books text tools library v049 v061 v062 v063 v064}; do
  case $t in
    library) cp /tmp/claude-0/editbook.bak "/tmp/claude-0/libmods/Edit Book.gbk.twm" 2>/dev/null; r=$(bash test/ui/runlib.sh test/ui/library.js /tmp/claude-0/ui-$t.png 6000 2>&1 | grep -o "RESULT.*") ;;
    books|text|tools|user) r=$(FOLDERS='["/home/claude/testmods","/home/claude/testmods4","/home/claude/esreal"]' bash test/ui/run.sh test/ui/$t.js /tmp/claude-0/ui-$t.png 6000 2>&1 | grep -o "RESULT.*\|screenshot failed.*") ;;
    lang) r=$(EXTRA=',"lang":"fil"' bash test/ui/run.sh test/ui/$t.js /tmp/claude-0/ui-$t.png 6000 2>&1 | grep -o "RESULT.*\|screenshot failed.*") ;;
    *) r=$(bash test/ui/run.sh test/ui/$t.js /tmp/claude-0/ui-$t.png 6000 2>&1 | grep -o "RESULT.*\|screenshot failed.*") ;;
  esac
  echo "== $t: $(echo "$r" | grep -o '✓' | wc -l) ok $(echo "$r" | grep -o '✗[^✓✗|]*\|failed.*' | head -6 | tr '\n' ' ')"
done
