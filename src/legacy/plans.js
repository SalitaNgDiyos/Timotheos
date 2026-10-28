'use strict';
// Bible reading plans: split chosen books into reading sessions and spread them over calendar days.
// Modelled on the options theWord's manual describes (read every n days of the week, finish by a date /
// in a period / so many chapters each time, several book-groups read in parallel, catch up, restart).
const canon = require('./canon');

const PRESETS = {
  bible: { label: 'Whole Bible (Genesis–Revelation)', groups: ['Gen-Mal; Matt-Rev'] },
  bibleAp: { label: 'Whole Bible with the Apocrypha (1611 order)', groups: ['Gen-Mal; 1Esd; 2Esd; Tob; Jdt; AddEsth; Wis; Sir; Bar; EpJer; PrAzar; Sus; Bel; PrMan; 1Macc; 2Macc; Matt-Rev'] },
  otnt: { label: 'Old and New Testament each day', groups: ['Gen-Mal', 'Matt-Rev'] },
  otntps: { label: 'Old Testament, New Testament and Psalms/Proverbs each day', groups: ['Gen-Job; Eccl-Mal', 'Matt-Rev', 'Ps-Prov'] },
  nt: { label: 'New Testament', groups: ['Matt-Rev'] },
  ot: { label: 'Old Testament', groups: ['Gen-Mal'] },
  gospels: { label: 'The four Gospels', groups: ['Matt-John'] },
  psprov: { label: 'Psalms and Proverbs', groups: ['Ps-Prov'] },
  apocrypha: { label: 'The Apocrypha (1611 KJV)', groups: ['1Esd; 2Esd; Tob; Jdt; AddEsth; Wis; Sir; Bar; EpJer; PrAzar; Sus; Bel; PrMan; 1Macc; 2Macc'] },
};

/** "Gen-Deut; Ps" -> list of {b, c} chapters, using chapter counts from `chapters(b)` */
function chaptersOf(spec, chapters) {
  const out = [];
  for (let part of spec.split(/[;\n]+/)) {
    part = part.trim(); if (!part) continue;
    const [a, z] = part.split(/\s*[-–]\s*/);
    const b1 = canon.findBook(a.replace(/\s+\d+$/, '')); const b2 = z ? canon.findBook(z.replace(/\s+\d+$/, '')) : b1;
    if (!b1 || !b2) throw new Error('Unknown book in "' + part + '"');
    const all = canon.BOOKS.map(x => x[0]).sort((x, y) => canon.orderKey(x) - canon.orderKey(y));
    const i1 = all.indexOf(b1), i2 = all.indexOf(b2);
    for (let i = Math.min(i1, i2); i <= Math.max(i1, i2); i++) { const b = all[i]; const n = chapters(b); for (let c = 1; c <= n; c++) out.push({ b, c }); }
  }
  return out;
}

/** join consecutive chapters of one book into passages: [{b, c1, c2}] */
function passages(chs) {
  const out = [];
  for (const x of chs) { const l = out[out.length - 1]; if (l && l.b === x.b && l.c2 === x.c - 1) l.c2 = x.c; else out.push({ b: x.b, c1: x.c, c2: x.c }); }
  return out;
}

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * @param o {name, groups:[spec], start:'YYYY-MM-DD', days:[0..6] (0=Sunday), mode:'days'|'perSession'|'until',
 *           sessions (for 'days'), perSession (chapters, for 'perSession'), until (date), noCalendar, cycle}
 * @param chapters (b) -> chapter count (from the Bibles the user has)
 */
function create(o, chapters) {
  const groups = o.groups.map(g => chaptersOf(g, chapters)).filter(g => g.length);
  if (!groups.length) throw new Error('The plan has no chapters – check the books');
  const days = (o.days && o.days.length) ? o.days : [0, 1, 2, 3, 4, 5, 6];
  const start = o.start ? new Date(o.start + 'T00:00:00') : new Date();
  // count reading days available until a date
  const readingDaysUntil = until => { let n = 0; for (let d = new Date(start); d <= until; d = addDays(d, 1)) if (days.includes(d.getDay())) n++; return n; };
  let nSessions;
  if (o.mode === 'perSession') nSessions = Math.max(...groups.map(g => Math.ceil(g.length / Math.max(1, +o.perSession || 1))));
  else if (o.mode === 'until') nSessions = Math.max(1, readingDaysUntil(new Date(o.until + 'T00:00:00')));
  else nSessions = Math.max(1, +o.sessions || 365);
  const sessions = [];
  for (let i = 0; i < nSessions; i++) sessions.push({ readings: [], done: false });
  groups.forEach(g => {
    // spread this group's chapters evenly over the sessions (cycle short groups if asked)
    const total = o.cycle ? Math.max(g.length, nSessions) : g.length;
    for (let i = 0; i < nSessions; i++) {
      const from = Math.floor(i * total / nSessions), to = Math.floor((i + 1) * total / nSessions);
      const chs = []; for (let k = from; k < to; k++) chs.push(g[k % g.length]);
      for (const p of passages(chs)) sessions[i].readings.push(p);
    }
  });
  // calendar dates
  if (!o.noCalendar) { let d = new Date(start); for (const s of sessions) { while (!days.includes(d.getDay())) d = addDays(d, 1); s.date = iso(d); d = addDays(d, 1); } }
  return { id: 'plan' + Date.now(), name: o.name || 'Reading plan', created: iso(new Date()), options: o, sessions: sessions.filter(s => s.readings.length) };
}

/** move all unread sessions forward so the first unread one is today */
function catchUp(plan, today = new Date()) {
  const days = (plan.options.days && plan.options.days.length) ? plan.options.days : [0, 1, 2, 3, 4, 5, 6];
  let d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (const s of plan.sessions) { if (s.done || !s.date) continue; while (!days.includes(d.getDay())) d = addDays(d, 1); s.date = iso(d); d = addDays(d, 1); }
  return plan;
}
function restart(plan, today = new Date()) { for (const s of plan.sessions) s.done = false; return catchUp(plan, today); }

function label(p, mode) { const bk = canon.book(p.b, mode); return `${bk.name} ${p.c1}${p.c2 > p.c1 ? '–' + p.c2 : ''}`; }

module.exports = { PRESETS, create, catchUp, restart, chaptersOf, label, iso };
