/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Translation Accuracy Rating (TAR, 0.6.121): an AI model of the user's choice grades how faithfully a translation renders
// its source text (Textus Receptus, LXX …), verse by verse, on five measures. This file: the AI services, the request and
// the answer, the score and its grade, and the saved results (one file per translation).
const fs = require('fs');
const path = require('path');

/** AI services. kind: how to talk to it. Every "openai" kind service speaks the same (OpenAI-compatible) language. */
const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic (Claude)', kind: 'anthropic', base: 'https://api.anthropic.com/v1', key: true },
  { id: 'openai', name: 'OpenAI (GPT)', kind: 'openai', base: 'https://api.openai.com/v1', key: true },
  { id: 'gemini', name: 'Google Gemini', kind: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta', key: true },
  { id: 'openrouter', name: 'OpenRouter (many models with one key)', kind: 'openai', base: 'https://openrouter.ai/api/v1', key: true },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', base: 'https://api.deepseek.com/v1', key: true },
  { id: 'groq', name: 'Groq', kind: 'openai', base: 'https://api.groq.com/openai/v1', key: true },
  { id: 'mistral', name: 'Mistral', kind: 'openai', base: 'https://api.mistral.ai/v1', key: true },
  { id: 'xai', name: 'xAI (Grok)', kind: 'openai', base: 'https://api.x.ai/v1', key: true },
  { id: 'ollama', name: 'Ollama (a model on this computer, free)', kind: 'openai', base: 'http://localhost:11434/v1', key: false },
  { id: 'lmstudio', name: 'LM Studio (a model on this computer, free)', kind: 'openai', base: 'http://localhost:1234/v1', key: false },
  { id: 'custom', name: 'Other (any OpenAI-compatible address)', kind: 'openai', base: '', key: 'optional' },
];
const provider = id => PROVIDERS.find(p => p.id === id) || PROVIDERS[0];

/** the five measures and their weight in the total (they add up to 1) */
const MEASURES = [
  ['lexical', 'Word meaning', 0.30], ['grammar', 'Grammar', 0.25], ['completeness', 'Completeness', 0.20],
  ['sense', 'Meaning & emphasis', 0.15], ['consistency', 'Consistency', 0.10],
];
/** the grade of a score */
const GRADES = [[92, 'Faithful', 'faithful'], [80, 'Good', 'good'], [60, 'Not Bad', 'notbad'], [0, 'Poor', 'poor']];
function grade(score) { const g = GRADES.find(([min]) => score >= min) || GRADES[GRADES.length - 1]; return { name: g[1], cls: g[2] }; }
const clamp = n => Math.max(0, Math.min(100, Math.round(+n || 0)));
function total(m) { return Math.round(MEASURES.reduce((s, [k, , w]) => s + clamp(m[k]) * w, 0)); }

const APPROACH = {
  formal: 'Judge it as a word-for-word (formal equivalence) translation: it should keep the source\'s words, grammar and order as far as the target language allows.',
  dynamic: 'Judge it as a thought-for-thought (dynamic equivalence) translation: freer wording and grammar are allowed when the meaning, emphasis and completeness are kept.',
};
function systemPrompt(o = {}) {
  const lang = o.noteLang === 'tl' ? 'Tagalog' : 'English';
  return `You are an expert in Koine Greek, Septuagint Greek and Biblical Hebrew, and in Bible translation. You grade how accurately a translation renders its source text, verse by verse.
Grade each verse on five measures, each from 0 to 100:
- lexical: word meaning. Does each word carry the sense of its source word in this context?
- grammar: are tense, aspect, voice, mood, case, number and person carried over?
- completeness: nothing left out and nothing added. Words the translation marks as added (shown in [brackets]) are allowed.
- sense: does the whole verse say what the source says, with its emphasis, idiom, and who does what to whom?
- consistency: are key words rendered the same way as elsewhere in this passage, where the context is the same?
${APPROACH[o.approach] || APPROACH.formal}
The translation may be in any language. A difference that only the target language forces is not an error.
If a difference comes from the translation following a different source text (for example the Critical Text instead of the Textus Receptus, or the Hebrew text instead of the Septuagint), do not count it against the translation: set "srcdiff" to true and say so in the note.
In the source, a word may be followed by [Strong's number, morphology, lemma]; use them.
Write the notes in ${lang}. Be strict and fair; 100 means nothing at all is lost.
Answer with JSON only, no other text, in exactly this form:
{"verses":[{"v":<verse number>,"lexical":0-100,"grammar":0-100,"completeness":0-100,"sense":0-100,"consistency":0-100,"srcdiff":false,"note":"one or two sentences","issues":[{"word":"word(s) of the translation","source":"source word(s)","kind":"lexical|grammar|omission|addition|sense|consistency|source-text","note":"short"}]}]}
Give one entry for every verse you are given, and no others.`;
}
function userPrompt(job) {
  const lines = [`Source text: ${job.sourceTitle || job.source}${job.sourceLang ? ` (${job.sourceLang})` : ''}`, `Translation: ${job.translationTitle || job.translation}${job.translationLang ? ` (${job.translationLang})` : ''}`, `Passage: ${job.bookName || ''} ${job.c}`, ''];
  for (const x of job.verses) { lines.push(`v${x.v} SOURCE: ${x.src}`); lines.push(`v${x.v} TRANSLATION: ${x.tr}`); lines.push(''); }
  return lines.join('\n');
}

/** the HTTP request for one prompt */
function buildRequest(cfg, system, user) {
  const p = provider(cfg.provider); const base = String(cfg.base || p.base || '').replace(/\/+$/, '');
  if (!base) throw new Error('Give the address of the AI service in AI settings.');
  if (!cfg.model) throw new Error('Choose a model in AI settings.');
  if (p.key === true && !cfg.key) throw new Error(`Put your ${p.name} key in AI settings.`);
  const json = { 'content-type': 'application/json' };
  if (p.kind === 'anthropic') {
    return { method: 'POST', url: base + '/messages', headers: Object.assign({ 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }, json),
      body: { model: cfg.model, max_tokens: cfg.maxTokens || 8000, temperature: 0, system, messages: [{ role: 'user', content: user }] } };
  }
  if (p.kind === 'gemini') {
    return { method: 'POST', url: `${base}/models/${encodeURIComponent(cfg.model)}:generateContent`, headers: Object.assign({ 'x-goog-api-key': cfg.key }, json),
      body: { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } } };
  }
  const h = Object.assign({}, json); if (cfg.key) h.Authorization = 'Bearer ' + cfg.key;
  if (cfg.provider === 'openrouter') { h['HTTP-Referer'] = 'https://github.com/SalitaNgDiyos/Timotheos'; h['X-Title'] = 'Timotheos'; }
  const body = { model: cfg.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (!cfg.noTemperature) body.temperature = 0;
  return { method: 'POST', url: base + '/chat/completions', headers: h, body };
}
/** the request that lists the models a service offers */
function modelsRequest(cfg) {
  const p = provider(cfg.provider); const base = String(cfg.base || p.base || '').replace(/\/+$/, '');
  if (!base) throw new Error('Give the address of the AI service first.');
  if (p.kind === 'anthropic') return { method: 'GET', url: base + '/models?limit=100', headers: { 'x-api-key': cfg.key || '', 'anthropic-version': '2023-06-01' } };
  if (p.kind === 'gemini') return { method: 'GET', url: base + '/models?pageSize=200', headers: { 'x-goog-api-key': cfg.key || '' } };
  return { method: 'GET', url: base + '/models', headers: cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {} };
}
function parseModels(cfg, body) {
  const j = typeof body === 'string' ? JSON.parse(body) : body; const p = provider(cfg.provider);
  if (p.kind === 'gemini') return (j.models || []).filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')).map(m => String(m.name || '').replace(/^models\//, '')).filter(Boolean);
  return (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean);
}
/** the text of the AI's answer */
function answerText(cfg, body) {
  const j = typeof body === 'string' ? JSON.parse(body) : body; const p = provider(cfg.provider);
  if (p.kind === 'anthropic') return (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
  if (p.kind === 'gemini') { const c = (j.candidates || [])[0]; return c && c.content ? (c.content.parts || []).map(x => x.text || '').join('') : ''; }
  const ch = (j.choices || [])[0]; return ch && ch.message ? String(ch.message.content || '') : '';
}
/** the service's own error message */
function errorText(body, status) {
  try { const j = JSON.parse(body); const e = j.error || (Array.isArray(j) && j[0] && j[0].error) || j; return `${status}: ${e.message || e.msg || JSON.stringify(e).slice(0, 300)}`; }
  catch (e) { return `${status}: ${String(body || '').slice(0, 300)}`; }
}
/** the JSON in an answer (models sometimes wrap it in ``` fences or add words) */
function extractJson(text) {
  let t = String(text || '').trim();
  const f = /```(?:json)?\s*([\s\S]*?)```/i.exec(t); if (f) t = f[1].trim();
  try { return JSON.parse(t); } catch (e) { /* look for the outermost object */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* */ } }
  throw new Error('The AI did not answer in the form asked for. Try again, or choose a stronger model.');
}
/** the verse grades of an answer, only for the verses asked */
function readGrades(text, asked) {
  const j = extractJson(text); const list = Array.isArray(j) ? j : (j.verses || []);
  const want = new Set(asked.map(Number)); const out = {};
  for (const x of list) {
    const v = +x.v || +x.verse; if (!want.has(v)) continue;
    const m = {}; for (const [k] of MEASURES) m[k] = clamp(x[k]);
    const issues = (Array.isArray(x.issues) ? x.issues : []).slice(0, 12).map(i => ({ word: String(i.word || '').slice(0, 120), source: String(i.source || '').slice(0, 120), kind: String(i.kind || '').slice(0, 20), note: String(i.note || '').slice(0, 300) }));
    out[v] = Object.assign(m, { score: total(m), srcdiff: !!x.srcdiff, note: String(x.note || '').slice(0, 600), issues });
  }
  return out;
}

/** verses of one chapter in pieces small enough for one request */
function chunks(verses, maxVerses = 30, maxChars = 9000) {
  const out = []; let cur = [], n = 0;
  for (const x of verses) {
    const len = (x.src || '').length + (x.tr || '').length;
    if (cur.length && (cur.length >= maxVerses || n + len > maxChars)) { out.push(cur); cur = []; n = 0; }
    cur.push(x); n += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

/* ---------------------------------------------------------------- saved results, one file per translation */
const safe = id => String(id).replace(/[^\w.-]+/g, '_').slice(0, 120);
const pairKey = (source, approach) => `${source}|${approach || 'formal'}`;
function fileOf(dir, translation) { return path.join(dir, safe(translation) + '.json'); }
function load(dir, translation) {
  try { const j = JSON.parse(fs.readFileSync(fileOf(dir, translation), 'utf8')); if (j && j.pairs) return j; } catch (e) { /* none yet */ }
  return { translation, pairs: {} };
}
function store(dir, translation, info, grades) {
  fs.mkdirSync(dir, { recursive: true });
  const all = load(dir, translation);
  if (info.translationTitle) all.title = info.translationTitle;
  const k = pairKey(info.source, info.approach);
  const p = all.pairs[k] || (all.pairs[k] = { source: info.source, sourceTitle: info.sourceTitle || '', approach: info.approach || 'formal', verses: {} });
  if (info.sourceTitle) p.sourceTitle = info.sourceTitle;
  const at = new Date().toISOString();
  for (const [v, g] of Object.entries(grades)) p.verses[`${info.b}.${info.c}.${v}`] = Object.assign({}, g, { model: info.model || '', at });
  const f = fileOf(dir, translation), tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(all), 'utf8'); fs.renameSync(tmp, f);
  return all;
}
function remove(dir, translation, source, approach) {
  const all = load(dir, translation); delete all.pairs[pairKey(source, approach)];
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(fileOf(dir, translation), JSON.stringify(all), 'utf8');
  return all;
}
/** averages of saved verse grades: over everything, and per book */
function summary(pair, filter) {
  const acc = () => ({ n: 0, sum: 0, m: Object.fromEntries(MEASURES.map(([k]) => [k, 0])), srcdiff: 0 });
  const all = acc(), books = {};
  for (const [ref, g] of Object.entries((pair && pair.verses) || {})) {
    const [b, c] = ref.split('.').map(Number); if (filter && !filter(b, c)) continue;
    for (const a of [all, books[b] || (books[b] = acc())]) { a.n++; a.sum += g.score; for (const [k] of MEASURES) a.m[k] += g[k] || 0; if (g.srcdiff) a.srcdiff++; }
  }
  const fin = a => a.n ? { verses: a.n, score: Math.round(a.sum / a.n), measures: Object.fromEntries(MEASURES.map(([k]) => [k, Math.round(a.m[k] / a.n)])), srcdiff: a.srcdiff, grade: grade(Math.round(a.sum / a.n)) } : { verses: 0 };
  return { all: fin(all), books: Object.fromEntries(Object.entries(books).map(([b, a]) => [b, fin(a)])) };
}

module.exports = { PROVIDERS, provider, MEASURES, GRADES, grade, total, systemPrompt, userPrompt, buildRequest, modelsRequest, parseModels, answerText, errorText, extractJson, readGrades, chunks, load, store, remove, summary, pairKey };
