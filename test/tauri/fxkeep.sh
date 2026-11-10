#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# fxkeep.sh — choose an imported Firefox theme, restart Timotheos, and check that it is still the skin
cd "$(dirname "$(readlink -f "$0")")/../.."
bash test/tauri/fx-profile.sh make
bash test/tauri/run.sh test/tauri/fxkeep1.js /tmp/claude-0/t-fxkeep1.png
KEEP=1 bash test/tauri/run.sh test/tauri/fxkeep2.js /tmp/claude-0/t-fxkeep2.png
bash test/tauri/fx-profile.sh clean
