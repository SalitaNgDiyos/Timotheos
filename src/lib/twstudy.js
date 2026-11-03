'use strict';
// Import and export of theWord Verse Lists (.vsls.twm), Reading Plans (.rdp.twm),
// and Bible Highlight sets (.bhls.twm).
const fs = require('fs');
const path = require('path');
const { openDb } = require('./sqlite');
const { sqljs } = require('./dict');
const canon = require('./canon');

function str(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return Buffer.from(v).toString('utf8');
}

/** Read a .vsls.twm file and return { title, lists: { [name]: [{b, c, v, v2}] } } */
function readVerseLists(file) {
  const db = openDb(file);
  try {
    const tables = (db.exec("select name from sqlite_master where type='table'")[0] || { values: [] }).values.map(r => String(r[0]));
    const T = n => tables.find(t => t.toLowerCase() === n);
    const cfg = {};
    if (T('config')) {
      for (const [k, v] of (db.exec(`select name, value from "${T('config')}"`)[0] || { values: [] }).values) cfg[String(k).toLowerCase()] = str(v);
    }
    const baseTitle = cfg.title || path.basename(file).replace(/\.vsls\.twm$/i, '');
    const lists = {};
    const vTab = T('verse_list') || T('verses') || T('vsls') || T('bible_refs');
    const lTab = T('lists') || T('topics');
    const listNames = new Map();
    if (lTab) {
      const cols = (db.exec(`pragma table_info("${lTab}")`)[0] || { values: [] }).values.map(c => String(c[1]).toLowerCase());
      const cId = cols.find(c => c === 'id' || c === 'list_id') || 'id';
      const cName = cols.find(c => c === 'name' || c === 'subject' || c === 'title') || 'subject';
      for (const [id, nm] of (db.exec(`select ${cId}, ${cName} from "${lTab}"`)[0] || { values: [] }).values) {
        listNames.set(id, str(nm).trim() || baseTitle);
      }
    }
    if (vTab) {
      const cols = (db.exec(`pragma table_info("${vTab}")`)[0] || { values: [] }).values.map(c => String(c[1]).toLowerCase());
      const cL = cols.find(c => c === 'list_id' || c === 'topic_id' || c === 'lid');
      const cB = cols.find(c => c === 'bi' || c === 'book') || 'bi';
      const cC = cols.find(c => c === 'ci' || c === 'chapter') || 'ci';
      const cV1 = cols.find(c => c === 'fvi' || c === 'vi' || c === 'verse') || 'fvi';
      const cV2 = cols.find(c => c === 'tvi' || c === 'evi') || cV1;
      const ord = cols.includes('rel_order') ? ' order by rel_order, rowid' : '';
      const rows = (db.exec(`select ${cL || '0'}, ${cB}, ${cC}, ${cV1}, ${cV2} from "${vTab}"${ord}`)[0] || { values: [] }).values;
      for (const [lid, b, c, v1, v2] of rows) {
        const nm = listNames.get(lid) || baseTitle;
        const arr = lists[nm] || (lists[nm] = []);
        arr.push({ b: +b, c: +c, v: +v1, v2: +v2 > +v1 ? +v2 : undefined });
      }
    }
    if (!Object.keys(lists).length) lists[baseTitle] = [];
    return { title: baseTitle, lists };
  } finally {
    db.close();
  }
}

/** Export one or more verse lists { [name]: [{b,c,v,v2}] } to a .vsls.twm SQLite buffer */
async function exportVerseLists(listsObj, title = 'My Verse Lists') {
  const SQL = await sqljs();
  const db = new SQL.Database();
  try {
    db.run('create table config(name text primary key, value text)');
    db.run('create table topics(id integer primary key, pid integer default 0, subject text, rel_order integer)');
    db.run('create table verse_list(id integer primary key autoincrement, topic_id integer, bi integer, ci integer, fvi integer, tvi integer, rel_order integer)');
    db.run("insert into config values ('type', '8'), ('title', ?), ('schema.version', '1')", [title]);
    let tid = 0;
    const stT = db.prepare('insert into topics(id, pid, subject, rel_order) values (?, 0, ?, ?)');
    const stV = db.prepare('insert into verse_list(topic_id, bi, ci, fvi, tvi, rel_order) values (?, ?, ?, ?, ?, ?)');
    for (const [name, verses] of Object.entries(listsObj)) {
      tid++;
      stT.run([tid, name, tid * 10]);
      let ord = 0;
      for (const r of verses || []) {
        ord += 10;
        stV.run([tid, r.b, r.c, r.v, r.v2 || r.v, ord]);
      }
    }
    stT.free();
    stV.free();
    return Buffer.from(db.export());
  } finally {
    db.close();
  }
}

/** Read a .rdp.twm reading plan module and convert it to a Tanglaw reading plan object */
function readReadingPlan(file) {
  const db = openDb(file);
  try {
    const tables = (db.exec("select name from sqlite_master where type='table'")[0] || { values: [] }).values.map(r => String(r[0]));
    const T = n => tables.find(t => t.toLowerCase() === n);
    const cfg = {};
    if (T('config')) {
      for (const [k, v] of (db.exec(`select name, value from "${T('config')}"`)[0] || { values: [] }).values) cfg[String(k).toLowerCase()] = str(v);
    }
    const name = cfg.title || cfg.abbrev || path.basename(file).replace(/\.rdp\.twm$/i, '');
    const sessions = [];
    const pTab = T('plan') || T('readings') || T('sessions') || T('bible_refs');
    if (pTab) {
      const cols = (db.exec(`pragma table_info("${pTab}")`)[0] || { values: [] }).values.map(c => String(c[1]).toLowerCase());
      const cDay = cols.find(c => c === 'day' || c === 'session' || c === 'topic_id') || 'day';
      const cB = cols.find(c => c === 'bi' || c === 'book') || 'bi';
      const cC1 = cols.find(c => c === 'fci' || c === 'ci' || c === 'chapter') || 'ci';
      const cC2 = cols.find(c => c === 'tci' || c === 'chapterend') || cC1;
      const byDay = new Map();
      for (const [day, b, c1, c2] of (db.exec(`select ${cDay}, ${cB}, ${cC1}, ${cC2} from "${pTab}" order by ${cDay}, rowid`)[0] || { values: [] }).values) {
        const list = byDay.get(day) || (byDay.set(day, []), byDay.get(day));
        list.push({ b: +b, c1: +c1 || 1, c2: +c2 || +c1 || 1 });
      }
      for (const [, readings] of byDay) sessions.push({ readings, done: false });
    } else if (cfg.groups || cfg.books || cfg.plan) {
      const spec = cfg.groups || cfg.books || cfg.plan;
      const plansLib = require('./plans');
      return plansLib.create({ name, groups: spec.split('|'), sessions: +cfg.days || 365, mode: 'days' }, b => canon.kjvChapters(b).length || 1);
    }
    if (!sessions.length) {
      const plansLib = require('./plans');
      return plansLib.create({ name, groups: ['Gen-Mal; Matt-Rev'], sessions: 365, mode: 'days' }, b => canon.kjvChapters(b).length || 1);
    }
    const d0 = new Date();
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    sessions.forEach((s, i) => { const d = new Date(d0); d.setDate(d.getDate() + i); s.date = iso(d); });
    return { id: 'plan' + Date.now() + Math.floor(Math.random() * 1000), name, created: iso(d0), options: { name, mode: 'days', sessions: sessions.length, days: [0, 1, 2, 3, 4, 5, 6] }, sessions };
  } finally {
    db.close();
  }
}

/** Export a Tanglaw reading plan object to a .rdp.twm SQLite buffer */
async function exportReadingPlan(plan) {
  const SQL = await sqljs();
  const db = new SQL.Database();
  try {
    db.run('create table config(name text primary key, value text)');
    db.run('create table plan(id integer primary key autoincrement, day integer, bi integer, fci integer, tci integer, done integer default 0)');
    db.run("insert into config values ('type', '9'), ('title', ?), ('days', ?), ('schema.version', '1')", [plan.name || 'Reading Plan', String((plan.sessions || []).length)]);
    const st = db.prepare('insert into plan(day, bi, fci, tci, done) values (?, ?, ?, ?, ?)');
    (plan.sessions || []).forEach((s, i) => {
      for (const r of s.readings || []) {
        st.run([i + 1, r.b, r.c1, r.c2 || r.c1, s.done ? 1 : 0]);
      }
    });
    st.free();
    return Buffer.from(db.export());
  } finally {
    db.close();
  }
}

module.exports = { readVerseLists, exportVerseLists, readReadingPlan, exportReadingPlan };
