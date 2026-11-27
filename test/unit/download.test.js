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

// 7. Default repos exclude theWord Official and keep SalitaNgDiyos Official, WordModules.com, and eBible.org
const repoIds = dl.repos().map(r => r.id);
ok(!repoIds.includes('theword') && repoIds.includes('official') && repoIds.includes('wordmodules') && repoIds.includes('ebible'),
  'default repos exclude theWord Official and keep SalitaNgDiyos Official, WordModules.com, and eBible.org');

// 8. readTheWordXml parses theWord XML repositories, filters encrypted/locked/paid/.exe/non-module items, and uses https
const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<modules source="wordmodules.com" baseurl="http://www.theword.net/">
  <module identifier="comm1" type="Commentaries" abbr="MHC" title="Matthew Henry Commentary" author="Matthew Henry" lang="eng" url="bin/get.php/mhc.cmt.twm.7z" vermajor="1" verminor="0" verdate="2020-01-01" dlsizekb="200"/>
  <module identifier="enc1" type="Bibles" title="Encrypted Bible" url="bin/get.php/esv.ontx.twzip" dlsizekb="1000"/>
  <module identifier="enc2" type="Bibles" title="Raw Encrypted OT" url="bin/get.php/sample.otx" dlsizekb="800"/>
  <module identifier="enc3" type="Bibles" title="Raw Encrypted NT" url="bin/get.php/sample.ntx.zip" dlsizekb="500"/>
  <module identifier="enc4" type="Books" title="Locked Book" url="bin/get.php/book.gbk.twm.7z" encrypted="1" dlsizekb="400"/>
  <module identifier="enc5" type="Books" title="Secure Book" url="bin/get.php/book2.gbk.twm.7z" secure="1" dlsizekb="400"/>
  <module identifier="enc6" type="Books" title="Some Encrypted Commentary" url="bin/get.php/book3.cmt.twm.7z" dlsizekb="400"/>
  <module identifier="paid" type="Bibles" title="Paid Bible" url="bin/get.php/paid.ontx.exe" price="19.95" dlsizekb="1000"/>
  <module identifier="sku1" type="Bibles" title="Store Bible" url="bin/get.php/store.ont.zip" sku="ABC123" dlsizekb="1000"/>
  <module identifier="exe" type="Bibles" title="Free Exe Bible" url="bin/get.php/akjv.ont.exe" dlsizekb="1000"/>
  <module identifier="lng" type="Language Files" title="Hebrew Lang" url="bin/get.php/hebrew.lng.twzip" dlsizekb="50"/>
  <module identifier="skn" type="Skins" title="Dark Skin" url="bin/get.php/dark.skn.twzip" dlsizekb="50"/>
</modules>`;
const xmlCat = dl.readCatalog(sampleXml, 'https://www.theword.net/app/downloadmodules/wordmodulescom.list.php');
ok(xmlCat.name === 'wordmodules.com' && xmlCat.modules.length === 1 && xmlCat.modules[0].url === 'https://www.theword.net/bin/get.php/mhc.cmt.twm.7z' && xmlCat.modules[0].size === 200 * 1024,
  'readTheWordXml keeps free unencrypted modules, filters encrypted/locked/paid/.exe/non-module items, and uses https');

// 9. JSON catalogs and official releases also filter out encrypted files
const jsonCat = dl.readCatalog(JSON.stringify({
  name: 'Custom',
  modules: [
    { title: 'Open Bible', url: 'https://example.org/kjv.ont.zip' },
    { title: 'Locked Bible', url: 'https://example.org/esv.ontx.zip' },
    { title: 'Flagged Book', url: 'https://example.org/book.gbk.twm', encrypted: true }
  ]
}), 'https://example.org/catalog.json');
ok(jsonCat.modules.length === 1 && jsonCat.modules[0].title === 'Open Bible',
  'JSON catalog filters out encrypted modules by extension and flag');

const offWithEnc = dl.parseOfficialRelease(
  { name: 'TestRepo', description: 'Test' },
  {
    tag_name: '1.0',
    assets: [
      { name: 'open.ont.zip', size: 100, browser_download_url: 'https://example.org/open.ont.zip' },
      { name: 'secret.ontx.zip', size: 100, browser_download_url: 'https://example.org/secret.ontx.zip' }
    ]
  }
);
ok(offWithEnc.length === 1 && offWithEnc[0].file === 'open.ont.zip',
  'parseOfficialRelease skips encrypted .ontx archives');

// 10. parseOfficialRelease uses distinct IDs per asset filename and dedupeModules removes duplicate entries
const lxxRel = dl.parseOfficialRelease(
  { name: 'Septuagint-English-Interlinear', description: 'Septuagint English Interlinear' },
  {
    tag_name: 'Interlinear',
    published_at: '2019-03-05T06:25:11Z',
    assets: [
      { name: 'lxx+i.bbl.mybible', size: 14123008, updated_at: '2019-03-28T06:52:45Z', browser_download_url: 'https://github.com/SalitaNgDiyos/Septuagint-English-Interlinear/releases/download/Interlinear/lxx+i.bbl.mybible' },
      { name: 'LXX+i.ot', size: 13161902, updated_at: '2019-03-28T06:52:50Z', browser_download_url: 'https://github.com/SalitaNgDiyos/Septuagint-English-Interlinear/releases/download/Interlinear/LXX+i.ot' },
      { name: 'LXXiBrenton.ot', size: 7259044, updated_at: '2019-05-21T03:27:34Z', browser_download_url: 'https://github.com/SalitaNgDiyos/Septuagint-English-Interlinear/releases/download/Interlinear/LXXiBrenton.ot' }
    ]
  }
);
ok(lxxRel.length === 3 && new Set(lxxRel.map(m => m.id)).size === 3,
  'parseOfficialRelease gives unique IDs to different module formats of the same translation');

const duped = dl.dedupeModules([
  ...lxxRel,
  { ...lxxRel[1], repo: 'OT-Deuterocanon-Apocrypha', id: 'official:OT-Deuterocanon-Apocrypha:lxx+i.ot' },
  { ...lxxRel[2], repo: 'OT-Deuterocanon-Apocrypha', id: 'official:OT-Deuterocanon-Apocrypha:lxxibrenton.ot' }
]);
ok(duped.length === 3 && duped.filter(m => m.file === 'LXX+i.ot').length === 1 && duped.filter(m => m.file === 'LXXiBrenton.ot').length === 1,
  'dedupeModules removes duplicate LXX+i.ot and LXXiBrenton.ot entries while keeping distinct formats');

// 11. parseGitHubRepoUrl handles GitHub repository URLs cleanly
const gh1 = dl.parseGitHubRepoUrl('https://github.com/SalitaNgDiyos/LXX-Strongs-and-Morph-Codes');
const gh2 = dl.parseGitHubRepoUrl('https://github.com/SalitaNgDiyos/LXX-Strongs-and-Morph-Codes/releases/');
const gh3 = dl.parseGitHubRepoUrl('https://github.com/SalitaNgDiyos/LXX-Strongs-and-Morph-Codes.git');
const ghBlob = dl.parseGitHubRepoUrl('https://github.com/SalitaNgDiyos/Timotheos/blob/Neon/catalog/catalog.json');
ok(gh1 && gh1.owner === 'SalitaNgDiyos' && gh1.repo === 'LXX-Strongs-and-Morph-Codes' && gh1.url === 'https://github.com/SalitaNgDiyos/LXX-Strongs-and-Morph-Codes',
  'parseGitHubRepoUrl parses standard GitHub repo URL');
ok(gh2 && gh2.url === gh1.url && gh3 && gh3.url === gh1.url && ghBlob === null,
  'parseGitHubRepoUrl normalizes /releases and .git URLs and leaves /blob/ files to raw rewriting');
ok(dl.rewriteGitHubBlobUrl('https://github.com/SalitaNgDiyos/Timotheos/blob/Neon/catalog/catalog.json') === 'https://raw.githubusercontent.com/SalitaNgDiyos/Timotheos/Neon/catalog/catalog.json',
  'rewriteGitHubBlobUrl converts /blob/ URLs to raw.githubusercontent.com');

// 12. GitHub HTML fallback parsers extract repos and release assets when API is rate-limited
const htmlRepos = dl.parseGitHubReposHtml(
  '<a href="/SalitaNgDiyos/Timotheos">Timotheos</a><a href="/SalitaNgDiyos/LXX-Strongs-and-Morph-Codes">LXX</a><a href="/SalitaNgDiyos/LXX-Strongs-and-Morph-Codes">LXX</a><a href="/SalitaNgDiyos/Ang-Malayang-Biblia-Translation">AMB</a>',
  'SalitaNgDiyos'
);
ok(htmlRepos.length === 2 && htmlRepos.some(r => r.name === 'LXX-Strongs-and-Morph-Codes') && !htmlRepos.some(r => r.name === 'Timotheos'),
  'parseGitHubReposHtml extracts unique module repositories and skips app repos');

const htmlAssets = dl.parseGitHubExpandedAssets(
  `<ul><li><a href="/SalitaNgDiyos/LXX-Strongs-and-Morph-Codes/releases/download/2026-11-21_2015/LXX_Brenton_2026-11-21_2015.ot">LXX_Brenton_2026-11-21_2015.ot</a><span>20 MB</span><relative-time datetime="2026-11-21T13:01:20Z"></relative-time></li>
   <li><a href="/SalitaNgDiyos/LXX-Strongs-and-Morph-Codes/releases/download/2026-11-21_2015/Packard_s_and_Robinson_s_Morphological_Analysis_Codes_dct_2026-11-21_2015.dct.twm">morph</a><span>5.07 MB</span><relative-time datetime="2026-11-21T13:01:20Z"></relative-time></li></ul>`,
  'SalitaNgDiyos', 'LXX-Strongs-and-Morph-Codes', '2026-11-21_2015', 'OT LXX'
);
ok(htmlAssets.length === 2 && htmlAssets[0].file === 'LXX_Brenton_2026-11-21_2015.ot' && htmlAssets[0].size === 20 * 1048576 && htmlAssets[1].stamp === '2026-11-21_2015',
  'parseGitHubExpandedAssets parses release assets, sizes, and timestamps from GitHub HTML');

// 13. Real-time bundled AMB auto-update detection (supports both amb.nt and amb+.nt and same-tag re-uploads)
ok(dl.isAmbModuleName('amb.nt') && dl.isAmbModuleName('amb+.nt') && !dl.isAmbModuleName('kjv.ont'),
  'isAmbModuleName matches amb.nt and amb+.nt only');

const ambMods = dl.parseOfficialRelease(
  { name: 'Ang-Malayang-Biblia-Translation', description: 'Tagalog NT' },
  {
    tag_name: '2026.1',
    published_at: '2026-11-27T04:00:00Z',
    assets: [
      { name: 'amb+.nt', size: 6564900, updated_at: '2026-11-27T04:00:00Z', browser_download_url: 'https://example.com/amb+.nt' },
      { name: 'amb+.usfm.zip', size: 1495979, updated_at: '2026-11-27T04:00:00Z', browser_download_url: 'https://example.com/amb+.usfm.zip' }
    ]
  }
);
const liveAmb1 = dl.findLiveAmbUpdate(ambMods, ['amb.nt', 'kjv.ont'], null);
ok(liveAmb1 && liveAmb1.mod.file === 'amb+.nt' && liveAmb1.targetFiles.length === 1 && liveAmb1.targetFiles[0] === 'amb.nt',
  'findLiveAmbUpdate offers live update for bundled amb.nt when amb+.nt is released');

const liveAmb2 = dl.findLiveAmbUpdate(ambMods, ['amb.nt'], { sig: liveAmb1.remoteSig, tag: '2026.1', updatedAt: '2026-11-27T04:00:00Z', size: 6564900 });
ok(liveAmb2 === null, 'findLiveAmbUpdate skips when ambLiveVersion matches current signature');

const ambModsReupload = dl.parseOfficialRelease(
  { name: 'Ang-Malayang-Biblia-Translation', description: 'Tagalog NT' },
  {
    tag_name: '2026.1',
    published_at: '2026-11-27T06:30:00Z',
    assets: [
      { name: 'amb+.nt', size: 6565123, updated_at: '2026-11-27T06:30:00Z', browser_download_url: 'https://example.com/amb+.nt' }
    ]
  }
);
const liveAmb3 = dl.findLiveAmbUpdate(ambModsReupload, ['amb.nt'], { sig: liveAmb1.remoteSig, tag: '2026.1', updatedAt: '2026-11-27T04:00:00Z', size: 6564900 });
ok(liveAmb3 !== null && liveAmb3.remoteSig !== liveAmb1.remoteSig,
  'findLiveAmbUpdate detects re-upload on the same 2026.1 release tag when timestamp or size changes');

ok(dl.findLiveAmbUpdate(ambMods, ['kjv.ont'], null) === null,
  'findLiveAmbUpdate skips when user has removed AMB');

console.log(`download: ${passed} ok`);
