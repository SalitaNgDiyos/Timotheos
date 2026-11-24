/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// SalitaNgDiyos Official repository parsing and module update detection: node test/unit/download.test.js
const assert = require('assert');
const dl = require('../../app/renderer/download');

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('ok -', msg);
  passed++;
}

// 1. normalizeModuleKey matches versioned archive names to installed module filenames
ok(dl.normalizeModuleKey('GBL-EPV_2026-11-23_0805.dct.zip') === 'gbl_epv', 'GBL-EPV zip normalizes to gbl_epv');
ok(dl.normalizeModuleKey('GBL-EPV_2026-11-22_0815.dct.twm') === 'gbl_epv', 'GBL-EPV installed twm normalizes to gbl_epv');
ok(dl.normalizeModuleKey('amb+.nt') === 'amb+', 'amb+.nt keeps plus sign');
ok(dl.normalizeModuleKey('LXX_Brenton_2026-11-21_2015.ot') === 'lxx_brenton', 'LXX_Brenton strips date stamp');

// 2. parseOfficialRelease extracts downloadable assets from a GitHub release
const parsed = dl.parseOfficialRelease(
  { name: 'The-Greek-Bible-English-Lexicons', description: 'Greek Bible English Lexicon' },
  {
    tag_name: '2026-11-23_0805',
    published_at: '2026-11-23T00:08:24Z',
    assets: [
      { name: 'GBL-EPV_2026-11-23_0805.dct.zip', size: 34562754, updated_at: '2026-11-23T00:08:23Z', browser_download_url: 'https://github.com/SalitaNgDiyos/The-Greek-Bible-English-Lexicons/releases/download/2026-11-23_0805/GBL-EPV_2026-11-23_0805.dct.zip' },
      { name: 'README.md', size: 1024, updated_at: '2026-11-23T00:08:23Z', browser_download_url: 'https://example.com/README.md' }
    ]
  }
);
ok(parsed.length === 1 && parsed[0].modKey === 'gbl_epv' && parsed[0].tag === '2026-11-23_0805', 'parseOfficialRelease keeps module assets and ignores non-module files');

// 3. findModuleUpdates detects newer release for already-installed older module
const u1 = dl.findModuleUpdates(parsed, ['GBL-EPV_2026-11-22_0815.dct.twm'], {}, {});
ok(u1.length === 1 && u1[0].key === 'gbl_epv', 'detects update for older manually installed GBL-EPV');

// 4. findModuleUpdates skips when already up to date
const u2 = dl.findModuleUpdates(parsed, ['GBL-EPV_2026-11-23_0805.dct.twm'], {}, {});
ok(u2.length === 0, 'no update reported when installed date stamp matches latest release');

// 5. findModuleUpdates respects ignored version tag until a newer release appears
const u3 = dl.findModuleUpdates(parsed, ['GBL-EPV_2026-11-22_0815.dct.twm'], {}, { gbl_epv: '2026-11-23_0805' });
ok(u3.length === 0, 'ignored release tag is not re-prompted');

// 6. findModuleUpdates detects update against savedVersions record
const u4 = dl.findModuleUpdates(parsed, [], { gbl_epv: { tag: '2026-11-20_0900', updatedAt: '2026-11-20T09:00:00Z' } }, {});
ok(u4.length === 1 && u4[0].remoteLabel === '2026-11-23_0805', 'detects update when saved version tag is older');

// 7. readTheWordXml parses theWord XML repositories, filters paid/.exe items, and upgrades http://www.theword.net
const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<modules source="www.theword.net" baseurl="http://www.theword.net/">
  <module identifier="rmac" type="Dictionaries" abbr="RMAC" title="Robinson's Morphological Analysis" author="Maurice Robinson" lang="eng" url="bin/get.php/rmac.morphx.twzip" vermajor="1" verminor="0" verdate="2020-01-01" dlsizekb="200"/>
  <module identifier="paid" type="Bibles" title="Paid Bible" url="bin/get.php/paid.ontx.exe" price="19.95" dlsizekb="1000"/>
  <module identifier="exe" type="Bibles" title="Free Exe Bible" url="bin/get.php/akjv.ont.exe" dlsizekb="1000"/>
  <module identifier="lng" type="Misc" title="Hebrew Lang" url="bin/get.php/hebrew.lng.twzip" dlsizekb="50"/>
</modules>`;
const xmlCat = dl.readCatalog(sampleXml, 'https://www.theword.net/app/downloadmodules/module.list.php');
ok(xmlCat.name === 'www.theword.net' && xmlCat.modules.length === 1 && xmlCat.modules[0].url === 'https://www.theword.net/bin/get.php/rmac.morphx.twzip' && xmlCat.modules[0].size === 200 * 1024,
  'readTheWordXml keeps free importable modules, filters paid/.exe/.lng items, and uses https');

console.log(`download: ${passed} ok`);
