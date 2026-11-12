#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# all.sh — every UI suite against the Tauri build; prints how many checks passed and lists the failed ones
cd "$(dirname "$(readlink -f "$0")")/../.."
for t in ${TESTS:-features dock copy zoom titlebar views books text tools library v049 v061 v062 v063 v064 v065 v066 seed report download logo fxkeep}; do
  case $t in
    fxkeep) r=$(bash test/tauri/fxkeep.sh 2>&1) ;;
    download) r=$(bash test/tauri/download.sh 2>&1) ;;
    logo) r=$(bash test/tauri/run.sh test/tauri/logo.js /tmp/claude-0/t-logo.png 2>&1) ;;
    seed) r=$(FOLDERS='[]' bash test/tauri/run.sh test/tauri/seed.js /tmp/claude-0/t-seed.png 2>&1) ;;
    v065) bash test/tauri/fx-profile.sh make; r=$(bash test/tauri/run.sh test/tauri/v065.js /tmp/claude-0/t-v065.png 2>&1); bash test/tauri/fx-profile.sh clean ;;
    library) cp /tmp/claude-0/editbook.bak "/tmp/claude-0/libmods/Edit Book.gbk.twm" 2>/dev/null
      r=$(FOLDERS='["/home/claude/testmods","/home/claude/esreal","/tmp/claude-0/libmods"]' EXTRA=',"dock":{"v":1,"zones":{"left":{"size":240,"groups":[{"panels":["tree"],"active":"tree","size":1}]},"right":{"size":560,"groups":[{"panels":["lib","cmt","study"],"active":"lib","size":1}]},"bottom":{"size":200,"groups":[{"panels":["search"],"active":"search","size":1}]}},"floats":[],"hidden":[]}' bash test/tauri/run.sh test/tauri/$t.js /tmp/claude-0/t-$t.png 6000) ;;
    books|text|tools) r=$(FOLDERS='["/home/claude/testmods","/home/claude/testmods4","/home/claude/esreal"]' bash test/tauri/run.sh test/tauri/$t.js /tmp/claude-0/t-$t.png 3000) ;;
    *) r=$(bash test/tauri/run.sh test/tauri/$t.js /tmp/claude-0/t-$t.png) ;;
  esac
  n=$(echo "$r" | grep -o '✓' | wc -l)
  echo "== $t: $n ok $(echo "$r" | tr '|' '\n' | grep -E '✗|NO RESULT|ERROR' | cut -c1-200)"
done
echo "== unit: $(node test/unit/studybackup.test.js 2>&1 | tail -1)"
echo "== licence: $(node scripts/check-licence.mjs | tail -3 | tr '\n' ' ')"
