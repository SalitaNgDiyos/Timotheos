#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# "Check for updates" against a stand-in for the GitHub release answer on this computer.
ROOT="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
W=/tmp/claude-0/upsite; rm -rf $W; mkdir -p $W; PORT=${PORT:-18766}
echo '{"tag_name":"v9.9.9","name":"Timotheos 9.9.9","html_url":"https://github.com/SalitaNgDiyos/Timotheos/releases/tag/v9.9.9","body":"Things are better."}' > $W/latest.json
(cd $W && python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1) & S=$!
sleep 0.6
export TIMOTHEOS_REPOS="{\"updates\":\"http://127.0.0.1:$PORT/latest.json\",\"port\":$PORT}"
bash "$ROOT/test/tauri/run.sh" "$ROOT/test/tauri/updates.js" "${1:-/tmp/claude-0/t-updates.png}"
kill $S 2>/dev/null
