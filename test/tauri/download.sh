#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# "Download modules" against a small web server on this computer (a test build may read http://127.0.0.1): a catalog
# with one module, and a stand-in for eBible.org (translations.csv and one <id>_usfm.zip).
ROOT="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
W=/tmp/claude-0/dlsite; rm -rf $W; mkdir -p $W/eb $W/u; PORT=${PORT:-18765}
printf '\\id JHN Test\n\\h John\n\\c 3\n\\p\n\\v 16 For God so loved the world.\n\\v 17 Second verse.\n' > $W/u/43-JHN.usfm
printf '\\id MRK Test\n\\h Mark\n\\c 1\n\\p\n\\v 1 The beginning of the Good News.\n' > $W/u/42-MRK.usfm
(cd $W/u && zip -q ../eb/tst-one_usfm.zip *.usfm)
printf '\\id GEN Catalog\n\\h Genesis\n\\c 1\n\\p\n\\v 1 In the beginning.\n' > "$W/Catalog Bible.usfm"
printf '\xef\xbb\xbf"languageCode","translationId","languageName","languageNameInEnglish","title","description","Redistributable","Copyright","UpdateDate","OTbooks","NTbooks","DCbooks","downloadable","shortTitle"\n"tst","tst-one","Testisch","Testish","The ""Test"" Bible, one","A, test","True","Public Domain","2026-01-01","0","2","0","True","Test"\n"tst","tst-closed","Testisch","Testish","Closed Bible","no","False","Copyright","2026-01-01","39","27","0","True","Closed"\n"abc","abc-two","Abc","Alphabetic","Second Bible","x","True","PD","2026-01-01","39","27","0","True","Two"\n' > $W/eb/translations.csv
cat > $W/catalog.json <<J
{"name":"Test repository","about":"A catalog for the test.","modules":[
 {"title":"Catalog Bible","url":"Catalog%20Bible.usfm","language":"English","kind":"Bible","description":"One verse.","size":50,"licence":"Test"},
 {"title":"Not https","url":"http://example.org/x.ont"},{"title":"Missing address"}]}
J
echo 'this is not a catalog' > $W/bad.json
(cd $W && python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1) & S=$!
sleep 0.6
export TIMOTHEOS_REPOS="{\"catalog\":\"http://127.0.0.1:$PORT/catalog.json\",\"ebible\":\"http://127.0.0.1:$PORT/eb/\",\"port\":$PORT}"
bash "$ROOT/test/tauri/run.sh" "$ROOT/test/tauri/download.js" "${1:-/tmp/claude-0/t-download.png}"
kill $S 2>/dev/null
