#!/bin/bash
# run.sh <script.js> <shot.png> [seconds] [width height]: start the release build under a virtual screen,
# run the script in the window, take a screenshot of the screen, print the RESULT line.
H=/tmp/claude-0/th; rm -rf $H; mkdir -p "$H/.local/share/org.tanglaw.bible"
cat > "$H/.local/share/org.tanglaw.bible/settings.json" <<J
{"folders":["/home/claude/testmods","/home/claude/esreal"],"ref":{"b":43,"c":3},"skin":"${SKIN:-parchment}"}
J
BIN=/home/claude/tanglaw/tanglaw-next/src-tauri/target/release/tanglaw
W=${4:-1280}; HH=${5:-860}
cat > /tmp/claude-0/th-run.sh <<R
HOME=$H TANGLAW_SIZE=${4:+${4}x${5}} TANGLAW_SCRIPT="$1" WEBKIT_DISABLE_COMPOSITING_MODE=1 $BIN > /tmp/claude-0/th-out.log 2>&1 &
P=\$!
sleep ${3:-10}
import -window root "$2"
kill \$P
R
xvfb-run -a -s "-screen 0 ${W}x${HH}x24" bash /tmp/claude-0/th-run.sh
grep -E "RESULT|panicked|Error" /tmp/claude-0/th-out.log | head -5
