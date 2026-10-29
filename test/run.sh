#!/bin/bash
# run.sh <script.js> <shot.png> [seconds] [width height]: start the release build under a virtual screen,
# run the script in the window, take a screenshot of the screen, print the RESULT line.
# ELECTRON=1 runs the Electron edition (electron/, built with `npm run electron:web`) instead of the Tauri build.
H=/tmp/claude-0/th; rm -rf $H; mkdir -p "$H/.local/share/org.tanglaw.bible"
SD="$H/.local/share/org.tanglaw.bible"; [ -n "$ELECTRON" ] && SD="$H/.config/Tanglaw Bible/data"; mkdir -p "$SD"
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
cat > "$SD/settings.json" <<J
{"folders":$F,"ref":{"b":43,"c":3},"skin":"${SKIN:-parchment}"}
J
fi
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BIN=${TANGLAW_BIN:-$ROOT/src-tauri/target/release/tanglaw}
[ -n "$ELECTRON" ] && BIN="$ROOT/node_modules/electron/dist/electron --no-sandbox $ROOT/electron"
[ -n "$LEGACY" ] && [ -n "$ELECTRON" ] && rmdir "$SD" 2>/dev/null
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
