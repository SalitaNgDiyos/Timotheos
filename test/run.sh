#!/bin/bash
# run.sh <script.js> <shot.png> [seconds] [width height]: start the release build under a virtual screen,
# run the script in the window, take a screenshot of the screen, print the RESULT line.
H=/tmp/claude-0/th; rm -rf $H; mkdir -p "$H/.local/share/org.tanglaw.bible"
if [ -n "$LEGACY" ]; then
  # an Electron Tanglaw 0.4 on this computer, and no settings of the new one yet
  mkdir -p "$H/.config/Tanglaw Bible"
  cat > "$H/.config/Tanglaw Bible/settings.json" <<J
{"moduleFolders":["/home/claude/testmods","/home/claude/esreal"],"openBibles":["tw:kjv.ont","es:a_001_b_wycliffe_1394_-_purvey_revision.bbli"],"ref":{"b":43,"c":3,"v":16},"appearance":{"skin":"sampaguita"},"show":{"woj":true}}
J
  cat > "$H/.config/Tanglaw Bible/my-study-data.json" <<J
{"version":1,"bookmarks":[{"b":19,"c":23,"v":1},null,null,null,null,null,null,null,null,null],"lists":{"My verses":[{"b":45,"c":5,"v":8}]},"currentList":"My verses","highlights":{"tw:kjv.ont":{"43.3.16":[{"s":11,"e":16,"style":"yellow"}]}},"notes":{"43.3.16":{"html":"God's love: compare <a class=\"link\" data-href=\"tw://bible.*?id=45.5.8\">Rom 5:8</a>.","t":1}},"plans":[]}
J
else
DEF='["/home/claude/testmods","/home/claude/esreal"]'; F=${FOLDERS:-$DEF}
cat > "$H/.local/share/org.tanglaw.bible/settings.json" <<J
{"folders":$F,"ref":{"b":43,"c":3},"skin":"${SKIN:-parchment}"}
J
fi
BIN=${TANGLAW_BIN:-$(cd "$(dirname "$0")/.." && pwd)/src-tauri/target/release/tanglaw}
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
