#!/bin/bash
# run.sh <script.js> <out.png> [wait]
H=/tmp/claude-0/ui/home; rm -rf $H; mkdir -p "$H"
DEF='["/home/claude/testmods","/home/claude/esreal"]'; F=${FOLDERS:-$DEF}
cat > "$H/settings.json" <<J
{"moduleFolders":$F,"openBibles":["tw:kjv.ont","es:a_001_b_wycliffe_1394_-_purvey_revision.bbli"],"ref":{"b":43,"c":3,"v":16}}
J
cd /home/claude/tanglaw/tanglaw
ELECTRON_ENABLE_LOGGING=1 TANGLAW_SCRIPT="$1" TANGLAW_WAIT=${3:-4000} TANGLAW_SCREENSHOT="$2" timeout 150 xvfb-run -a -s "-screen 0 1440x900x24" ./node_modules/.bin/electron --no-sandbox --user-data-dir=$H . 2>&1 | grep -iE "error|uncaught|fail|RESULT" | grep -viE "dbus|bus.cc|gpu|viz|vaapi|openssl" | head -40
