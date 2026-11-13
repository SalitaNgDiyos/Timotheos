#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# The quiet look at start-up, against a stand-in for the GitHub release answer on this computer.
ROOT="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
W=/tmp/claude-0/upsite2; rm -rf $W; mkdir -p $W; PORT=${PORT:-18767}
head -c 5000 /dev/urandom > $W/Timotheos_9.9.9_x64-setup.exe
cat > $W/latest.json <<J
{"tag_name":"v9.9.9","name":"Timotheos_9.9.9","html_url":"https://github.com/SalitaNgDiyos/Timotheos/releases/tag/v9.9.9","body":"Timotheos 9.9.9\n- Next chapter cards\n- Tagalog book names\n\nBuild 5 of abcdef1","assets":[]}
J
(cd $W && python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1) & S=$!
sleep 0.6
export TIMOTHEOS_REPOS="{\"updates\":\"http://127.0.0.1:$PORT/latest.json\",\"test\":\"http://127.0.0.1:$PORT/none.json\",\"port\":$PORT,\"startup\":true}"
run() { sed "s/__MODE__/$1/" "$ROOT/test/tauri/updstart.js" > /tmp/claude-0/updstart_$1.js; shift_=$1; shift; "$@" ; }
sed "s/__MODE__/show/" "$ROOT/test/tauri/updstart.js" > /tmp/claude-0/updstart_show.js; sed "s/__MODE__/none/" "$ROOT/test/tauri/updstart.js" > /tmp/claude-0/updstart_none.js
R1=$(bash "$ROOT/test/tauri/run.sh" /tmp/claude-0/updstart_show.js /tmp/claude-0/t-us1.png 800)
R2=$(KEEP=1 bash "$ROOT/test/tauri/run.sh" /tmp/claude-0/updstart_none.js /tmp/claude-0/t-us2.png 800)
R3=$(EXTRA=',"updAuto":false' bash "$ROOT/test/tauri/run.sh" /tmp/claude-0/updstart_none.js /tmp/claude-0/t-us3.png 800)
kill $S 2>/dev/null
echo "$R1 | second start (ignored): ${R2#RESULT } | switched off: ${R3#RESULT }"
