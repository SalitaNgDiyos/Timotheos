#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# "Check for updates" against a stand-in for the GitHub release answer on this computer.
ROOT="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
W=/tmp/claude-0/upsite; rm -rf $W; mkdir -p $W; PORT=${PORT:-18766}
head -c 300000 /dev/urandom > $W/Timotheos_9.9.9_amd64.deb; head -c 5000 /dev/urandom > $W/Timotheos_9.9.9_x64-setup.exe; head -c 5000 /dev/urandom > $W/Timotheos_android.apk
SD=$(sha256sum $W/Timotheos_9.9.9_amd64.deb | cut -d' ' -f1); SE=$(sha256sum $W/Timotheos_9.9.9_x64-setup.exe | cut -d' ' -f1); SA=$(sha256sum $W/Timotheos_android.apk | cut -d' ' -f1)
cat > $W/latest.json <<J
{"tag_name":"v9.9.9","name":"Timotheos 9.9.9","html_url":"https://github.com/SalitaNgDiyos/Timotheos/releases/tag/v9.9.9","body":"Things are better.","assets":[
 {"name":"Timotheos_9.9.9_amd64.deb","browser_download_url":"http://127.0.0.1:$PORT/Timotheos_9.9.9_amd64.deb","size":300000,"digest":"sha256:$SD"},
 {"name":"Timotheos_9.9.9_x64-setup.exe","browser_download_url":"http://127.0.0.1:$PORT/Timotheos_9.9.9_x64-setup.exe","size":5000,"digest":"sha256:$SE"},
 {"name":"Timotheos_android-test-1.apk","browser_download_url":"http://127.0.0.1:$PORT/Timotheos_android.apk","size":5000,"digest":"sha256:$SA"}]}
J
# a second answer whose fingerprint is wrong, and a third with none
sed "s/sha256:$SD/sha256:$(printf '0%.0s' $(seq 64))/" $W/latest.json > $W/badsum.json
sed "s/,\"digest\":\"sha256:$SD\"//" $W/latest.json > $W/nosum.json
echo '{"tag_name":"test","name":"Timotheos 9.9.10 (test build)","html_url":"https://github.com/SalitaNgDiyos/Timotheos/releases/tag/test","body":"A test build."}' > $W/test.json
(cd $W && python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1) & S=$!
sleep 0.6
export TIMOTHEOS_REPOS="{\"updates\":\"http://127.0.0.1:$PORT/latest.json\",\"test\":\"http://127.0.0.1:$PORT/test.json\",\"port\":$PORT}"
bash "$ROOT/test/tauri/run.sh" "$ROOT/test/tauri/updates.js" "${1:-/tmp/claude-0/t-updates.png}"
kill $S 2>/dev/null
