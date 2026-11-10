# Timotheos

Offline Bible study with theWord and e-Sword modules. This branch is the Tauri 2 edition (Windows, Linux, Android).

- `app/renderer/` – the screens (plain JavaScript, no framework)
- `app/main.js`, `app/lib/` – module readers, search, settings (the former Electron main process; unchanged)
- `tauri-shim/` – lets that code run inside Tauri: it runs in a Web Worker and reaches files and SQLite databases
  through the Rust side (`src-tauri/src/lib.rs`, custom protocol `tfs://`)
- `scripts/build-web.mjs` – builds `dist/`
- `test/tauri/` – the UI checks (`bash test/tauri/all.sh`, needs `xvfb`)

Build: `npm ci`, then `npx tauri build` (desktop) or `npx tauri android build --apk` (needs the Android SDK and NDK).
GitHub Actions builds all three (see `.github/workflows/build.yml`).

The Electron edition lives on the branch `electron-0.6`. That edition was published earlier under the MIT licence; versions
released from this branch are under the AGPL, as below.

## Licence

Copyright (C) 2026 Edmund P. Valdez

Timotheos is free software, licensed under the **GNU Affero General Public License, version 3 or (at your option) any
later version** (`AGPL-3.0-or-later`). The full text is in [`LICENSE`](LICENSE).

You may, for any purpose, commercial or not:

- **use** it, free of charge;
- **study and change** it (the complete source code is in this repository);
- **share** it, changed or not, as long as you give the people who receive it the same freedoms: the licence, the
  copyright notices and the complete source code of your version, under the same licence.

There is no warranty. If you offer a changed Timotheos to users over a network, section 13 of the AGPL also applies:
those users must be able to get the source code of the version they are using.

### Getting the source code of a version

Every build is made from a commit of this repository, and the release it is published in is named with its build number
and that commit (`build-<number>-<commit>`). Check out that commit to get exactly the source of that program:
`git clone https://github.com/SalitaNgDiyos/Timotheos` and `git checkout <commit>`. Each build's release also carries a `.zip` of the exact source it was built from,
so the source is handed out with every installer and APK. The program's **About** screen links
to the repository and shows the licence texts (**Legal**), so they travel with the program.

### Other notices

- [`THIRD-PARTY-LICENSES.md`](THIRD-PARTY-LICENSES.md): every third-party component built into the program, with its
  licence (all compatible with the AGPL). The bundled fonts keep the SIL Open Font License ([`app/renderer/fonts/LICENSES.txt`](app/renderer/fonts/LICENSES.txt)).
- [`NOTICE`](NOTICE): the name and logo are not covered by the software licence; user data and privacy; hosting and support.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) (contributions come in under the same licence, with a DCO sign-off),
  [`SECURITY.md`](SECURITY.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- Bible and other modules you open (theWord, e-Sword) are your own files and keep their publishers' licences; none is
  included.
