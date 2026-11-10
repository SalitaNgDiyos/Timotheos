#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Edmund P. Valdez
# After installing (or updating) Timotheos: refresh the desktop's list of icons and programs, so the new
# Timotheos icon shows at once instead of the one remembered from an older version.
if command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true; fi
if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database -q /usr/share/applications >/dev/null 2>&1 || true; fi
if command -v xdg-icon-resource >/dev/null 2>&1; then xdg-icon-resource forceupdate --theme hicolor >/dev/null 2>&1 || true; fi
exit 0
