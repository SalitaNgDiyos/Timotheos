# Contributing to Timotheos

Timotheos is free software under the **GNU Affero General Public License, version 3 or later** (`AGPL-3.0-or-later`).
Thank you for helping.

## The licence of contributions

By sending a contribution (code, text, translation, icon, bug fix) you agree that it is licensed under the same terms
as the project: **AGPL-3.0-or-later**. You keep the copyright in your own work; the project does not take ownership of
it and does not ask you to sign a copyright assignment.

Only send work that is yours, or that you have the right to send under these terms. Do not copy code, fonts, images
or text from other projects unless their licence allows it under the AGPL, and say where it came from so it can be
added to `THIRD-PARTY-LICENSES.md`.

## Sign-off (Developer Certificate of Origin)

Every commit must carry a sign-off line, which says you accept the Developer Certificate of Origin 1.1
(https://developercertificate.org/):

    Signed-off-by: Your Name <your@email>

`git commit -s` adds it. By signing off you state that you wrote the contribution or otherwise have the right to submit
it under the project's licence, and that you understand it will be public and kept in the project's history.

## Source files

New source files start with:

    SPDX-License-Identifier: AGPL-3.0-or-later
    Copyright (C) <year> <your name>

(inside a comment). Keep the notices that are already in a file when you change it.

## Checks

- `npm ci`, then `npm run build:web` builds the screens.
- `bash test/tauri/all.sh` runs the UI checks (needs `xvfb`). Please run them before sending a change, and add a check
  for what you add.
- Keep each change to one purpose. Do not remove existing features.

## Conduct and security

Please read `CODE_OF_CONDUCT.md`. Security problems go by private email, see `SECURITY.md`.
