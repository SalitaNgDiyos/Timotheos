/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// User module creation and authoring (0.4.9):
//   [A1] User Commentaries (.cmt.twm, user=1)
//   [A2] User Dictionaries (.dct.twm, user=1)
//   [A3] User General Books (.gbk.twm, user=1)
//   [A4] Export personal JSON verse notes to a standalone theWord .cmt.twm module
const fs = require('fs');
const path = require('path');
const { sqljs } = require('./dict');
const { htmlToRtf } = require('./modprops');
const canon = require('./canon');

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.timotheos-tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

async function withDb(file, fn) {
  const SQL = await sqljs();
  const db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  try {
    const res = await fn(db);
    atomicWrite(file, Buffer.from(db.export()));
    return res;
  } finally {
    db.close();
  }
}

const EXT_FOR = { commentary: '.cmt.twm', dictionary: '.dct.twm', book: '.gbk.twm' };
const TYPE_FOR = { dictionary: '1', commentary: '2', book: '3' };

/**
 * Create a new editable user module (.cmt.twm, .dct.twm, or .gbk.twm) in destDir.
 * @param opts { kind: 'commentary'|'dictionary'|'book', title, abbr, description, author }
 * @param destDir directory where the module file will be created
 */
async function createModule(opts, destDir) {
  const kind = opts.kind in EXT_FOR ? opts.kind : 'book';
  const title = String(opts.title || 'My ' + kind).trim();
  const abbr = String(opts.abbr || title.slice(0, 8)).trim();
  const safeName = (opts.fileName || title).replace(/[\\/:*?"<>|]+/g, ' ').trim() || ('My ' + kind);
  const ext = EXT_FOR[kind];
  const file = path.join(destDir, safeName.endsWith(ext) ? safeName : safeName + ext);
  if (fs.existsSync(file)) throw new Error(`A module file named "${path.basename(file)}" already exists.`);
  const id = 'user_' + abbr.toLowerCase().replace(/[^a-z0-9]+/g, '') + '_' + Date.now().toString(36);
  const today = new Date().toISOString().slice(0, 10);

  await withDb(file, db => {
    db.run('CREATE TABLE config (name TEXT PRIMARY KEY, value TEXT)');
    db.run('CREATE TABLE topics (id INTEGER PRIMARY KEY, pid INTEGER DEFAULT 0, subject TEXT, rel_order INTEGER, content_type TEXT, strong_orig_word TEXT)');
    db.run('CREATE INDEX idx_topics_rel_order ON topics(rel_order)');
    db.run('CREATE INDEX idx_topics_subject ON topics(subject)');
    db.run('CREATE TABLE content (topic_id INTEGER PRIMARY KEY, data BLOB, data2 BLOB)');
    if (kind === 'commentary') {
      db.run('CREATE TABLE bible_refs (topic_id INTEGER PRIMARY KEY AUTOINCREMENT, bi INTEGER, ci INTEGER, fvi INTEGER, tvi INTEGER, content_type TEXT)');
      db.run('CREATE INDEX idx_bible_refs ON bible_refs(bi, ci, fvi, tvi)');
    }
    const cfg = [
      ['id', id], ['type', TYPE_FOR[kind]], ['title', title], ['abbrev', abbr],
      ['description', opts.description || `User ${kind} created in Timotheos`],
      ['author', opts.author || ''], ['user', '1'], ['content.type', 'rtf'],
      ['schema.version', '1'], ['version.major', '1'], ['version.minor', '0'], ['version.date', today],
    ];
    const st = db.prepare('INSERT INTO config(name, value) VALUES (?, ?)');
    for (const [k, v] of cfg) st.run([k, v]);
    st.free();

    if (kind === 'book') {
      db.run('INSERT INTO topics(id, pid, subject, rel_order, content_type) VALUES (1, 0, ?, 10, ?)', ['Introduction', 'rtf']);
      db.run('INSERT INTO content(topic_id, data) VALUES (1, ?)', [htmlToRtf(`<p><b>${title}</b></p><p>Start writing here.</p>`)]);
    } else if (kind === 'dictionary') {
      db.run('INSERT INTO topics(id, pid, subject, rel_order, content_type) VALUES (1, 0, ?, 10, ?)', ['Example', 'rtf']);
      db.run('INSERT INTO content(topic_id, data) VALUES (1, ?)', [htmlToRtf('<p><b>Example</b> – edit or add dictionary entries with the toolbar buttons above.</p>')]);
    }
  });
  return { file, name: path.basename(file), kind, title, abbr };
}

function refSubject(b, c, fvi, tvi) {
  const bk = canon.book(b);
  if (!c) return bk.name;
  if (!fvi) return `${bk.name} ${c}`;
  return `${bk.name} ${c}:${fvi}${tvi && tvi > fvi ? '–' + tvi : ''}`;
}

/**
 * Add or update a commentary entry in a user .cmt.twm file.
 * @param file .cmt.twm path
 * @param ref  { b, c, fvi, tvi } (c=0 for book comment, fvi=0 for chapter comment)
 * @param html HTML content
 */
async function saveCommentaryEntry(file, ref, html) {
  const b = +ref.b, c = +(ref.c || 0), fvi = c ? +(ref.fvi || ref.v || 0) : 0, tvi = fvi ? Math.max(fvi, +(ref.tvi || ref.v2 || fvi)) : 0;
  const subj = refSubject(b, c, fvi, tvi);
  const rtf = htmlToRtf(html || '');
  return withDb(file, db => {
    const existing = db.exec('SELECT topic_id FROM bible_refs WHERE bi = ? AND ci = ? AND fvi = ? AND tvi = ? LIMIT 1', [b, c, fvi, tvi])[0];
    let tid = existing && existing.values[0] ? existing.values[0][0] : null;
    if (!html || !String(html).replace(/<[^>]*>|&nbsp;|\s/g, '')) {
      if (tid != null) {
        db.run('DELETE FROM bible_refs WHERE topic_id = ?', [tid]);
        db.run('DELETE FROM content WHERE topic_id = ?', [tid]);
        db.run('DELETE FROM topics WHERE id = ?', [tid]);
      }
      return { deleted: true, tid };
    }
    if (tid == null) {
      const mx = db.exec('SELECT COALESCE(MAX(topic_id), 0) FROM content')[0];
      const mx2 = db.exec('SELECT COALESCE(MAX(topic_id), 0) FROM bible_refs')[0];
      tid = Math.max(mx ? +mx.values[0][0] : 0, mx2 ? +mx2.values[0][0] : 0) + 1;
      db.run('INSERT INTO bible_refs(topic_id, bi, ci, fvi, tvi, content_type) VALUES (?, ?, ?, ?, ?, ?)', [tid, b, c, fvi, tvi, 'rtf']);
    }
    const hasT = db.exec('SELECT name FROM sqlite_master WHERE type="table" AND lower(name)="topics"')[0];
    if (hasT) {
      db.run('INSERT OR REPLACE INTO topics(id, pid, subject, rel_order, content_type) VALUES (?, 0, ?, ?, ?)', [tid, subj, b * 100000 + c * 1000 + fvi, 'rtf']);
    }
    db.run('INSERT OR REPLACE INTO content(topic_id, data, data2) VALUES (?, ?, NULL)', [tid, rtf]);
    return { tid, subject: subj };
  });
}

/**
 * Save (insert or update) a topic in a user dictionary (.dct.twm) or general book (.gbk.twm).
 * @param file .twm path
 * @param topic { id?, pid?, subject, html, origWord? }
 */
async function saveTopic(file, topic) {
  const subj = String(topic.subject || 'Untitled').trim();
  const pid = +(topic.pid || 0);
  const rtf = htmlToRtf(topic.html || '');
  return withDb(file, db => {
    let tid = topic.id != null ? +topic.id : null;
    if (tid == null) {
      const mx = db.exec('SELECT COALESCE(MAX(id), 0) FROM topics')[0];
      tid = (mx ? +mx.values[0][0] : 0) + 1;
      const mxOrd = db.exec('SELECT COALESCE(MAX(rel_order), 0) FROM topics WHERE pid = ?', [pid])[0];
      const ord = (mxOrd ? +mxOrd.values[0][0] : 0) + 10;
      db.run('INSERT INTO topics(id, pid, subject, rel_order, content_type, strong_orig_word) VALUES (?, ?, ?, ?, ?, ?)',
        [tid, pid, subj, ord, 'rtf', topic.origWord || null]);
    } else {
      db.run('UPDATE topics SET subject = ?, content_type = ? WHERE id = ?', [subj, 'rtf', tid]);
    }
    db.run('INSERT OR REPLACE INTO content(topic_id, data, data2) VALUES (?, ?, NULL)', [tid, rtf]);
    return { id: tid, pid, subject: subj };
  });
}

/** Rename a topic in a user module */
async function renameTopic(file, tid, newSubject) {
  const subj = String(newSubject || '').trim();
  if (!subj) throw new Error('Topic title cannot be empty.');
  return withDb(file, db => {
    db.run('UPDATE topics SET subject = ? WHERE id = ?', [subj, +tid]);
    return { id: +tid, subject: subj };
  });
}

/** Move a topic up/down among its siblings (d = -1 or +1) or reparent it */
async function moveTopic(file, tid, d) {
  return withDb(file, db => {
    const row = db.exec('SELECT id, pid, rel_order FROM topics WHERE id = ?', [+tid])[0];
    if (!row || !row.values.length) return false;
    const pid = row.values[0][1] || 0;
    const sibs = (db.exec('SELECT id, rel_order FROM topics WHERE COALESCE(pid, 0) = ? ORDER BY rel_order, id', [pid])[0] || { values: [] }).values;
     sibs.forEach((s, i) => { s[1] = (i + 1) * 10; });
    const idx = sibs.findIndex(s => s[0] === +tid);
    const tgt = idx + (d < 0 ? -1 : 1);
    if (idx < 0 || tgt < 0 || tgt >= sibs.length) return false;
    const tmp = sibs[idx][1]; sibs[idx][1] = sibs[tgt][1]; sibs[tgt][1] = tmp;
    const st = db.prepare('UPDATE topics SET rel_order = ? WHERE id = ?');
    for (const [id, ord] of sibs) st.run([ord, id]);
    st.free();
    return true;
  });
}

/** Delete a topic (and any descendant child topics) from a user module */
async function deleteTopic(file, tid) {
  return withDb(file, db => {
    const toDel = new Set([+tid]);
    const hasT = db.exec('SELECT name FROM sqlite_master WHERE type="table" AND lower(name)="topics"')[0];
    if (hasT) {
      let added = true;
      while (added) {
        added = false;
        const rows = (db.exec('SELECT id, pid FROM topics')[0] || { values: [] }).values;
        for (const [id, pid] of rows) if (toDel.has(pid) && !toDel.has(id)) { toDel.add(id); added = true; }
      }
    }
    const hasRefs = db.exec('SELECT name FROM sqlite_master WHERE type="table" AND lower(name)="bible_refs"')[0];
    for (const id of toDel) {
      if (hasT) db.run('DELETE FROM topics WHERE id = ?', [id]);
      if (hasRefs) db.run('DELETE FROM bible_refs WHERE topic_id = ?', [id]);
      db.run('DELETE FROM content WHERE topic_id = ?', [id]);
    }
    return { deleted: [...toDel] };
  });
}

/**
 * [A4] Export personal JSON verse notes ({"b.c.v": {html, t}}) into a standalone theWord .cmt.twm module.
 */
async function exportNotesToCommentary(notesObj, destFile, opts = {}) {
  const title = opts.title || 'My Timotheos Verse Notes';
  const abbr = opts.abbr || 'MyNotes';
  const today = new Date().toISOString().slice(0, 10);
  if (fs.existsSync(destFile)) fs.unlinkSync(destFile);

  let count = 0;
  await withDb(destFile, db => {
    db.run('CREATE TABLE config (name TEXT PRIMARY KEY, value TEXT)');
    db.run('CREATE TABLE topics (id INTEGER PRIMARY KEY, pid INTEGER DEFAULT 0, subject TEXT, rel_order INTEGER, content_type TEXT)');
    db.run('CREATE TABLE bible_refs (topic_id INTEGER PRIMARY KEY AUTOINCREMENT, bi INTEGER, ci INTEGER, fvi INTEGER, tvi INTEGER, content_type TEXT)');
    db.run('CREATE INDEX idx_bible_refs ON bible_refs(bi, ci, fvi, tvi)');
    db.run('CREATE TABLE content (topic_id INTEGER PRIMARY KEY, data BLOB, data2 BLOB)');
    const cfg = [
      ['id', 'timotheos_notes_' + Date.now().toString(36)], ['type', '2'], ['title', title], ['abbrev', abbr],
      ['description', 'Personal verse notes exported from Timotheos'], ['user', '1'],
      ['content.type', 'rtf'], ['schema.version', '1'], ['version.major', '1'], ['version.minor', '0'], ['version.date', today],
    ];
    const stC = db.prepare('INSERT INTO config(name, value) VALUES (?, ?)');
    for (const [k, v] of cfg) stC.run([k, v]);
    stC.free();

    const entries = Object.entries(notesObj || {}).map(([k, n]) => {
      const [b, c, v] = k.split('.').map(Number);
      return { b, c, v, html: (n && n.html) || '' };
    }).filter(x => x.b && x.c && x.v && x.html.trim()).sort((a, b) => a.b - b.b || a.c - b.c || a.v - b.v);

    const stT = db.prepare('INSERT INTO topics(id, pid, subject, rel_order, content_type) VALUES (?, 0, ?, ?, ?)');
    const stR = db.prepare('INSERT INTO bible_refs(topic_id, bi, ci, fvi, tvi, content_type) VALUES (?, ?, ?, ?, ?, ?)');
    const stD = db.prepare('INSERT INTO content(topic_id, data, data2) VALUES (?, ?, NULL)');
    entries.forEach((e, idx) => {
      const tid = idx + 1;
      const subj = refSubject(e.b, e.c, e.v, e.v);
      stT.run([tid, subj, tid * 10, 'rtf']);
      stR.run([tid, e.b, e.c, e.v, e.v, 'rtf']);
      stD.run([tid, htmlToRtf(e.html)]);
      count++;
    });
    stT.free(); stR.free(); stD.free();
  });
  return { file: destFile, count, title, abbr };
}

module.exports = { createModule, saveCommentaryEntry, saveTopic, renameTopic, moveTopic, deleteTopic, exportNotesToCommentary };
