/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Docking layout geometry, Detach edges empty-space preservation, smart drop zones, 4x3 grid snap, and layout SVG thumbnails:
//   node test/unit/dock.test.js
const assert = require('assert');
const dock = require('../../app/renderer/dock');

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('ok -', msg);
  passed++;
}
const clone = o => JSON.parse(JSON.stringify(o));
const EPS = dock.EPS;
const hit = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > EPS && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > EPS;
const noOverlaps = areas => !areas.some((a, i) => areas.some((b, j) => j > i && hit(a, b)));

// 1. Classic preset has zero empty spaces and zero overlaps
const classic = clone(dock.PRESETS.classic.layout);
ok(noOverlaps(classic.areas), 'classic preset has no overlapping areas');
ok(dock.findEmptySpaces(classic.areas).length === 0, 'classic preset fills entire 4x3 canvas with no empty spaces');

// 2. Shrinking a panel edge away from its neighbour (Detach edges) opens an exact empty space
const shrunk = clone(classic);
const bv = shrunk.areas.find(a => a.panels.includes('bv0'));
bv.x1 = 2.2; // detached left from cmt/lib at x=3
const spaces1 = dock.findEmptySpaces(shrunk.areas);
ok(spaces1.length === 1 && Math.abs(spaces1[0].x0 - 2.2) < EPS && Math.abs(spaces1[0].x1 - 3) < EPS && Math.abs(spaces1[0].y0 - 0) < EPS && Math.abs(spaces1[0].y1 - 2) < EPS,
  'findEmptySpaces finds exact gap created by detaching a panel edge');

// 3. Dropping a panel into that empty space fills it cleanly with zero overlaps
const dropSpace = dock.computeSmartDrop(shrunk, 'cmt', { space: spaces1[0] }, true);
ok(dropSpace && dropSpace.mode === 'space' && noOverlaps(dropSpace.layout.areas),
  'smart drop onto empty space succeeds with no overlaps');
const movedCmt = dropSpace.layout.areas.find(a => a.panels.includes('cmt'));
ok(movedCmt && Math.abs(movedCmt.x0 - 2.2) < EPS && Math.abs(movedCmt.x1 - 3) < EPS && Math.abs(movedCmt.y0 - 0) < EPS && Math.abs(movedCmt.y1 - 2) < EPS,
  'dropped panel fills the exact empty space rectangle');
// Because keepHole=true (Detach edges ON), cmt's old spot (3..4, 0..1) stays open as empty space
const spacesAfterKeep = dock.findEmptySpaces(dropSpace.layout.areas);
ok(spacesAfterKeep.some(s => Math.abs(s.x0 - 3) < EPS && Math.abs(s.x1 - 4) < EPS && Math.abs(s.y0 - 0) < EPS && Math.abs(s.y1 - 1) < EPS),
  'moving a panel with Detach edges ON keeps its old spot open as empty space');

// 4. Moving/closing a panel with Detach edges OFF auto-fills its old hole
const dropAutoFill = dock.computeSmartDrop(shrunk, 'cmt', { space: spaces1[0] }, false);
ok(dropAutoFill && noOverlaps(dropAutoFill.layout.areas) && dock.findEmptySpaces(dropAutoFill.layout.areas).length === 0,
  'moving a panel with Detach edges OFF auto-fills its old spot');

const closeKeep = clone(classic);
dock.detachPanelFromLayout(closeKeep, 'cmt', true);
ok(dock.findEmptySpaces(closeKeep.areas).length === 1, 'closing a panel with Detach edges ON leaves empty space open');

const closeFill = clone(classic);
dock.detachPanelFromLayout(closeFill, 'cmt', false);
ok(dock.findEmptySpaces(closeFill.areas).length === 0, 'closing a panel with Detach edges OFF auto-fills the hole');

// 5. Smart drop Left / Right / Top / Bottom / Center (Tab) on an existing panel
const bvIdx = classic.areas.findIndex(a => a.panels.includes('bv0'));
for (const zone of ['left', 'right', 'top', 'bottom', 'center']) {
  const res = dock.computeSmartDrop(classic, 'cmt', { areaIndex: bvIdx, zone }, false);
  ok(res && noOverlaps(res.layout.areas), `smart drop zone "${zone}" produces valid non-overlapping layout`);
  if (zone === 'center') {
    const grp = res.layout.areas.find(a => a.panels.includes('bv0'));
    ok(res.mode === 'tab' && grp.panels.includes('cmt') && grp.active === 'cmt', 'smart drop "center" tabs panel into target');
  } else {
    const grp = res.layout.areas.find(a => a.panels.includes('cmt'));
    ok(res.mode === 'split' && grp && grp.panels.length === 1, `smart drop "${zone}" splits target panel cleanly`);
  }
}

// 6. Outer workbench edge docking (left / right / top / bottom)
for (const edge of ['left', 'right', 'top', 'bottom']) {
  const res = dock.computeSmartDrop(classic, 'cmt', { outer: edge }, false);
  ok(res && res.mode === 'edge' && noOverlaps(res.layout.areas), `outer edge "${edge}" docks cleanly without overlaps`);
}

// 7. Fixed 4x3 snap grid works on empty cells, partially empty resized cells, spanning panels, and 1x1 panels
const gridEmpty = dock.computeGridDrop(closeKeep, 'study', 0, 3, true);
ok(gridEmpty && gridEmpty.mode === 'space' && noOverlaps(gridEmpty.layout.areas),
  '4x3 grid drop onto empty cell (0,3) fills exact cell');
const placedStudy = gridEmpty.layout.areas.find(a => a.panels.includes('study'));
ok(placedStudy && Math.abs(placedStudy.x0 - 3) < EPS && Math.abs(placedStudy.x1 - 4) < EPS && Math.abs(placedStudy.y0 - 0) < EPS && Math.abs(placedStudy.y1 - 1) < EPS,
  '4x3 grid placed study into exact 1x1 cell (3..4, 0..1)');

// Partially empty cell (row 0, col 2 in `shrunk`: x=2..2.2 occupied by bv0, x=2.2..3 empty!)
const gridPartial = dock.computeGridDrop(shrunk, 'cmt', 0, 2, true);
ok(gridPartial && gridPartial.mode === 'space' && noOverlaps(gridPartial.layout.areas),
  '4x3 grid drop onto partially empty resized cell places into the free sub-space');
const placedPartial = gridPartial.layout.areas.find(a => a.panels.includes('cmt'));
ok(placedPartial && Math.abs(placedPartial.x0 - 2.2) < EPS && Math.abs(placedPartial.x1 - 3) < EPS && Math.abs(placedPartial.y0 - 0) < EPS && Math.abs(placedPartial.y1 - 1) < EPS,
  '4x3 grid partial-cell placement matches exact available free space (2.2..3, 0..1)');

// Spanning panel split via 4x3 grid (drop study onto right half of bv0 at row 0, col 2 in classic)
const gridSplit = dock.computeGridDrop(classic, 'study', 0, 2, false);
ok(gridSplit && gridSplit.mode === 'split' && noOverlaps(gridSplit.layout.areas),
  '4x3 grid drop onto edge cell of a spanning panel splits it cleanly');

// 1x1 panel tab via 4x3 grid (drop study onto 1x1 cmt cell at row 0, col 3 in classic)
const gridTab = dock.computeGridDrop(classic, 'study', 0, 3, false);
ok(gridTab && gridTab.mode === 'tab' && noOverlaps(gridTab.layout.areas),
  '4x3 grid drop onto 1x1 occupied cell tabs cleanly');

// 8. Real layout SVG thumbnails differ for every preset and render custom/floating layouts
const svgs = Object.entries(dock.PRESETS).map(([k, p]) => [k, dock.thumbnailSvg(p.layout, { width: 64, height: 48 })]);
for (const [k, svg] of svgs) {
  ok(svg.startsWith('<svg ') && svg.includes('class="laythumb"') && svg.includes('</svg>'), `preset "${k}" renders valid thumbnail SVG`);
}
const uniqueSvgs = new Set(svgs.map(([, s]) => s));
ok(uniqueSvgs.size === svgs.length, 'each layout preset produces a distinct thumbnail reflecting its actual panels');

const floatLay = clone(classic);
floatLay.floats = [{ panels: ['cmt'], active: 'cmt', x: 100, y: 100, w: 300, h: 250 }];
const floatSvg = dock.thumbnailSvg(floatLay, { width: 56, height: 42 });
ok(floatSvg !== dock.thumbnailSvg(classic, { width: 56, height: 42 }), 'saved layout with floating window renders distinct thumbnail');

// 9. Minimum 1in x 1in (96px x 96px) empty-space filter and zero neighbor movement on drop
const pxSpaces = [
  { x0: 0, y0: 0, x1: 0.4, y1: 0.5 },   // on 1200x900: 120px x 150px -> qualifies
  { x0: 1, y0: 0, x1: 1.25, y1: 0.5 },  // on 1200x900: 75px x 150px  -> too narrow (< 96px)
  { x0: 2, y0: 0, x1: 2.5, y1: 0.25 }   // on 1200x900: 150px x 75px  -> too short (< 96px)
];
const validPx = dock.filterSpacesByMinPx(pxSpaces, 1200, 900);
ok(validPx.length === 1 && Math.abs(validPx[0].x0 - 0) < EPS,
  'filterSpacesByMinPx keeps only empty spaces at least 1in x 1in (96px x 96px)');

// Dropping a panel into an empty space with keepHole=true leaves every other existing panel untouched
const beforeOthers = shrunk.areas.filter(a => !a.panels.includes('cmt')).map(a => ({ x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, panels: a.panels }));
const afterDrop = dock.computeSmartDrop(shrunk, 'cmt', { space: spaces1[0] }, true);
const afterOthers = afterDrop.layout.areas.filter(a => !a.panels.includes('cmt')).map(a => ({ x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, panels: a.panels }));
ok(JSON.stringify(beforeOthers) === JSON.stringify(afterOthers),
  'dropping a panel into an empty space never moves, resizes, or splits any other existing panel');

console.log(`dock: ${passed} ok`);
