#!/bin/bash
# all.sh — every UI suite against the Tauri build; prints how many checks passed and lists the failed ones
cd "$(dirname "$(readlink -f "$0")")/../.."
for t in ${TESTS:-features dock copy zoom titlebar views books text tools library v049 v061 v062 v063 v064}; do
  case $t in
    library) cp /tmp/claude-0/editbook.bak "/tmp/claude-0/libmods/Edit Book.gbk.twm" 2>/dev/null
      r=$(FOLDERS='["/home/claude/testmods","/home/claude/esreal","/tmp/claude-0/libmods"]' EXTRA=',"dock":{"v":1,"zones":{"left":{"size":240,"groups":[{"panels":["tree"],"active":"tree","size":1}]},"right":{"size":560,"groups":[{"panels":["lib","cmt","study"],"active":"lib","size":1}]},"bottom":{"size":200,"groups":[{"panels":["search"],"active":"search","size":1}]}},"floats":[],"hidden":[]}' bash test/tauri/run.sh test/tauri/$t.js /tmp/claude-0/t-$t.png 6000) ;;
    books|text|tools) r=$(FOLDERS='["/home/claude/testmods","/home/claude/testmods4","/home/claude/esreal"]' bash test/tauri/run.sh test/tauri/$t.js /tmp/claude-0/t-$t.png 3000) ;;
    *) r=$(bash test/tauri/run.sh test/tauri/$t.js /tmp/claude-0/t-$t.png) ;;
  esac
  n=$(echo "$r" | grep -o '✓' | wc -l)
  echo "== $t: $n ok $(echo "$r" | tr '|' '\n' | grep -E '✗|NO RESULT|ERROR' | cut -c1-200)"
done
