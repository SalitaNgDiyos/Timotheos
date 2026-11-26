// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Translation Accuracy Rating: node test/unit/tar.test.js
const fs = require('fs'), os = require('os'), path = require('path');
const T = require('../../app/lib/tar');
let ok = 0, bad = 0; const t = (c, m) => { if (c) ok++; else { bad++; console.log('✗', m); } };

// grades and the total
t(T.grade(100).name === 'Faithful' && T.grade(92).name === 'Faithful' && T.grade(91).name === 'Good' && T.grade(80).name === 'Good', 'Faithful / Good');
t(T.grade(79).name === 'Not Bad' && T.grade(60).name === 'Not Bad' && T.grade(59).name === 'Poor' && T.grade(0).name === 'Poor', 'Not Bad / Poor');
t(Math.abs(T.MEASURES.reduce((s, m) => s + m[2], 0) - 1) < 1e-9, 'weights add up to 100%');
t(T.total({ lexical: 100, grammar: 100, completeness: 100, sense: 100, consistency: 100 }) === 100, 'all 100 = 100');
t(T.total({ lexical: 90, grammar: 80, completeness: 100, sense: 70, consistency: 60 }) === 84, 'weighted total: ' + T.total({ lexical: 90, grammar: 80, completeness: 100, sense: 70, consistency: 60 }));

// requests for each kind of service
const sys = T.systemPrompt({ approach: 'dynamic', noteLang: 'tl' });
t(/thought-for-thought/.test(sys) && /Tagalog/.test(sys) && /"verses"/.test(sys), 'system prompt: approach, note language, JSON form');
const a = T.buildRequest({ provider: 'anthropic', model: 'm1', key: 'k' }, 'S', 'U');
t(a.url === 'https://api.anthropic.com/v1/messages' && a.headers['x-api-key'] === 'k' && a.body.system === 'S' && a.body.messages[0].content === 'U', 'Anthropic request');
const o = T.buildRequest({ provider: 'openai', model: 'm2', key: 'k2' }, 'S', 'U');
t(o.url === 'https://api.openai.com/v1/chat/completions' && o.headers.Authorization === 'Bearer k2' && o.body.messages.length === 2 && o.body.temperature === 0, 'OpenAI request');
const g = T.buildRequest({ provider: 'gemini', model: 'gm', key: 'k3' }, 'S', 'U');
t(/\/v1beta\/models\/gm:generateContent$/.test(g.url) && g.headers['x-goog-api-key'] === 'k3' && g.body.systemInstruction.parts[0].text === 'S', 'Gemini request');
const l = T.buildRequest({ provider: 'ollama', model: 'llama' }, 'S', 'U');
t(l.url === 'http://localhost:11434/v1/chat/completions' && !l.headers.Authorization, 'Ollama: no key needed');
const c = T.buildRequest({ provider: 'custom', base: 'https://x.example/v1/', model: 'z', noTemperature: true }, 'S', 'U');
t(c.url === 'https://x.example/v1/chat/completions' && c.body.temperature === undefined, 'custom address, no temperature');
let e1 = null; try { T.buildRequest({ provider: 'openai', model: 'm' }, 'S', 'U'); } catch (e) { e1 = e; } t(e1 && /key/.test(e1.message), 'a key is asked for');
let e2 = null; try { T.buildRequest({ provider: 'openai', key: 'k' }, 'S', 'U'); } catch (e) { e2 = e; } t(e2 && /model/.test(e2.message), 'a model is asked for');

// answers
t(T.answerText({ provider: 'anthropic' }, { content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] }) === 'AB', 'Anthropic answer');
t(T.answerText({ provider: 'openai' }, { choices: [{ message: { content: 'X' } }] }) === 'X', 'OpenAI answer');
t(T.answerText({ provider: 'gemini' }, { candidates: [{ content: { parts: [{ text: 'Y' }] } }] }) === 'Y', 'Gemini answer');
t(T.parseModels({ provider: 'gemini' }, { models: [{ name: 'models/g1', supportedGenerationMethods: ['generateContent'] }, { name: 'models/e', supportedGenerationMethods: ['embedContent'] }] }).join() === 'g1', 'Gemini models');
t(T.parseModels({ provider: 'openai' }, { data: [{ id: 'a' }, { id: 'b' }] }).join() === 'a,b', 'OpenAI-compatible models');
t(/^401: bad key/.test(T.errorText('{"error":{"message":"bad key"}}', 401)), 'service error message');
const ans = 'Here you are:\n```json\n{"verses":[{"v":16,"lexical":95,"grammar":90,"completeness":100,"sense":92,"consistency":100,"srcdiff":false,"note":"Close.","issues":[{"word":"so","source":"οὕτως","kind":"lexical","note":"manner"}]},{"v":99,"lexical":1}]}\n```';
const gr = T.readGrades(ans, [16, 17]);
t(gr[16] && gr[16].score === 95 && gr[16].issues.length === 1 && !gr[99] && !gr[17], 'grades read from a fenced answer, only verses asked: ' + JSON.stringify(gr));
let e3 = null; try { T.readGrades('no json here', [1]); } catch (e) { e3 = e; } t(e3, 'an answer without JSON is an error');
t(T.chunks(Array.from({ length: 70 }, (_, i) => ({ v: i + 1, src: 'a', tr: 'b' }))).map(x => x.length).join() === '30,30,10', 'chapters cut in pieces of 30');

// saved results, one file per translation
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-'));
T.store(dir, 'tw:amb.nt', { source: 'tw:tr.nt', approach: 'formal', b: 43, c: 3, model: 'X · m', sourceTitle: 'TR' }, gr);
T.store(dir, 'tw:amb.nt', { source: 'tw:tr.nt', approach: 'formal', b: 43, c: 4, model: 'X · m' }, { 1: Object.assign({}, gr[16], { score: 61 }) });
const all = T.load(dir, 'tw:amb.nt');
t(all.pairs['tw:tr.nt|formal'] && Object.keys(all.pairs['tw:tr.nt|formal'].verses).join() === '43.3.16,43.4.1', 'saved per translation and source');
const sm = T.summary(all.pairs['tw:tr.nt|formal']);
t(sm.all.verses === 2 && sm.all.score === 78 && sm.all.grade.name === 'Not Bad' && sm.books[43].verses === 2, 'summary: ' + JSON.stringify(sm.all));
t(fs.readdirSync(dir).join() === 'tw_amb.nt.json', 'file name of the translation');
T.remove(dir, 'tw:amb.nt', 'tw:tr.nt', 'formal');
t(!Object.keys(T.load(dir, 'tw:amb.nt').pairs).length, 'results deleted');

console.log(bad ? `tar: ${ok} ok, ${bad} FAILED` : `tar: ${ok} ok`);
process.exit(bad ? 1 : 0);
