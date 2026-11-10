#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# run.sh <script.js> <out.png> [wait_ms]  — runs the built Timotheos (Tauri) under a virtual screen, runs the page script of
# test/ui (same scripts as the Electron tests), takes a picture and prints the RESULT line.
ROOT="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
H=/tmp/claude-0/tui/home; rm -rf $H; mkdir -p "$H"
DEF='["/home/claude/testmods","/home/claude/esreal"]'; F=${FOLDERS:-$DEF}
cat > "$H/settings.json" <<J
{"moduleFolders":$F,"openBibles":["tw:kjv.ont","es:a_001_b_wycliffe_1394_-_purvey_revision.bbli"],"ref":{"b":43,"c":3,"v":16}$EXTRA}
J
BIN=${BIN:-$ROOT/src-tauri/target/debug/timotheos}
READY=/tmp/claude-0/tui/ready; rm -f $READY
export TIMOTHEOS_SCRIPT="$(readlink -f "$1")" TIMOTHEOS_WAIT=${3:-800} TIMOTHEOS_READY=$READY TIMOTHEOS_PORTABLE_DIR=$H
timeout ${LIMIT:-170} xvfb-run -a -s "-screen 0 1440x900x24" bash -c '
  '"$BIN"' > /tmp/claude-0/tui/log.txt 2>&1 &
  P=$!
  for i in $(seq 1 600); do [ -f '"$READY"' ] && break; kill -0 $P 2>/dev/null || break; sleep 0.3; done
  sleep 0.7; import -window root "'"$2"'" 2>/dev/null
  kill $P 2>/dev/null; wait $P 2>/dev/null'
cat $READY 2>/dev/null || { echo "NO RESULT"; tail -20 /tmp/claude-0/tui/log.txt; }
