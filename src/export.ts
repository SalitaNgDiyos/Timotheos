// Export topics of book modules (theWord: Export topics…) as a Word document (.docx), Rich Text (.rtf),
// a web page (.html) or plain text (.txt). Encrypted modules are never read, so they cannot be exported.
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { strToU8, zipSync } from 'fflate';
import type { BookMod, Topic } from './books';
import { dialog, esc, flash } from './ui';

export interface ExportItem { mod: BookMod; id: Topic['id'] }
type Fmt = 'docx' | 'rtf' | 'html' | 'txt';
interface Block { kind: 'h1' | 'h2' | 'p'; runs: { t: string; b?: boolean; i?: boolean; u?: boolean; sup?: boolean }[] }

/** the document as blocks of formatted text (shared by .docx and .rtf) */
function blocks(html: string): Block[] {
  const t = document.createElement('template'); t.innerHTML = html; const out: Block[] = []; let cur: Block = { kind: 'p', runs: [] };
  const flush = () => { if (cur.runs.some(r => r.t.trim())) out.push(cur); cur = { kind: 'p', runs: [] }; };
  const walk = (n: Node, f: { b?: boolean; i?: boolean; u?: boolean; sup?: boolean }) => {
    if (n.nodeType === 3) { const s = (n.textContent || '').replace(/\s+/g, ' '); if (s) cur.runs.push({ t: s, ...f }); return; }
    if (n.nodeType !== 1) return;
    const el = n as HTMLElement; const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') return;
    const block = /^(p|div|li|h[1-6]|tr|blockquote|section)$/.test(tag);
    if (tag === 'br') { flush(); return; }
    if (block) flush();
    if (/^h[1-6]$/.test(tag)) cur.kind = tag === 'h1' || tag === 'h2' ? 'h1' : 'h2';
    const st = el.getAttribute('style') || '';
    const g = { b: f.b || /^(b|strong|h\d)$/.test(tag) || /font-weight:\s*(bold|[6-9]00)/.test(st), i: f.i || /^(i|em)$/.test(tag) || /font-style:\s*italic/.test(st), u: f.u || tag === 'u' || /underline/.test(st), sup: f.sup || tag === 'sup' };
    for (const c of [...el.childNodes]) walk(c, g);
    if (block) flush();
  };
  for (const c of [...t.content.childNodes]) walk(c, {});
  flush();
  return out;
}
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function docx(blks: Block[]): Uint8Array {
  const run = (r: Block['runs'][number], size?: number) => `<w:r><w:rPr>${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.u ? '<w:u w:val="single"/>' : ''}${r.sup ? '<w:vertAlign w:val="superscript"/>' : ''}${size ? `<w:sz w:val="${size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xml(r.t)}</w:t></w:r>`;
  const body = blks.map(b => `<w:p>${b.kind === 'p' ? '' : '<w:pPr><w:spacing w:before="240" w:after="120"/><w:keepNext/></w:pPr>'}${b.runs.map(r => run(b.kind === 'p' ? r : { ...r, b: true }, b.kind === 'h1' ? 32 : b.kind === 'h2' ? 26 : undefined)).join('')}</w:p>`).join('');
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`),
  });
}
function rtfText(s: string): string {
  let o = ''; for (const ch of s) { const c = ch.codePointAt(0)!; if (ch === '\\' || ch === '{' || ch === '}') o += '\\' + ch; else if (c < 128) o += ch; else if (c < 0x10000) o += `\\u${c > 32767 ? c - 65536 : c}?`; else { const h = Math.floor((c - 0x10000) / 0x400) + 0xd800, l = ((c - 0x10000) % 0x400) + 0xdc00; o += `\\u${h - 65536}?\\u${l - 65536}?`; } }
  return o;
}
function rtf(blks: Block[]): string {
  return '{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\froman Gentium Plus;}}\\f0\\fs24\n' + blks.map(b => (b.kind === 'p' ? '' : `\\sb240\\sa120\\b\\fs${b.kind === 'h1' ? 32 : 26} `) + b.runs.map(r => `{${r.b ? '\\b' : ''}${r.i ? '\\i' : ''}${r.u ? '\\ul' : ''}${r.sup ? '\\super' : ''} ${rtfText(r.t)}}`).join('') + (b.kind === 'p' ? '' : '\\b0\\fs24\\sb0\\sa0') + '\\par\n').join('') + '}';
}

/** ask how, then save the topics */
export async function exportTopics(items: ExportItem[], clean: (html: string) => string): Promise<void> {
  if (!items.length) return;
  const many = items.length > 1; let fmt: Fmt = 'docx'; let titles = true; let mods = new Set(items.map(i => i.mod.id)).size > 1;
  const r = await dialog('Export topics', `<p>${items.length} topic${many ? 's' : ''} from ${esc([...new Set(items.map(i => i.mod.title))].slice(0, 3).join(', '))}${new Set(items.map(i => i.mod.id)).size > 3 ? '…' : ''}</p>
    <label class="fl">Format <select id="exF"><option value="docx">Word document (.docx)</option><option value="rtf">Rich Text (.rtf)</option><option value="html">Web page (.html)</option><option value="txt">Plain text (.txt)</option></select></label>
    <label class="ck"><input type="checkbox" id="exT" checked> Topic titles as headings</label><label class="ck"><input type="checkbox" id="exM" ${mods ? 'checked' : ''}> Name of the module before its topics</label>
    <p class="small">Only modules Tanglaw can read are exported; locked (encrypted) modules are never read.</p>`,
    [{ label: 'Cancel', value: null }, { label: 'Export…', value: 'ok', primary: true }], b => {
      b.querySelector<HTMLSelectElement>('#exF')!.onchange = e => { fmt = (e.target as HTMLSelectElement).value as Fmt; };
      b.querySelector<HTMLInputElement>('#exT')!.onchange = e => { titles = (e.target as HTMLInputElement).checked; };
      b.querySelector<HTMLInputElement>('#exM')!.onchange = e => { mods = (e.target as HTMLInputElement).checked; };
    });
  if (r !== 'ok') return;
  // gather
  let html = ''; let lastMod = ''; let n = 0;
  for (const it of items) {
    const e = await it.mod.topic(it.id); if (!e) continue; n++;
    if (mods && it.mod.id !== lastMod) { html += `<h1>${esc(it.mod.title)}</h1>`; lastMod = it.mod.id; }
    html += (titles ? `<h2>${esc(e.subject)}</h2>` : '') + `<div>${clean(e.html)}</div>`;
  }
  const first = items[0]; const base = (many ? first.mod.title : `${first.mod.abbr || first.mod.title} - ${(await first.mod.topic(first.id))?.subject || 'topic'}`).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80);
  const path = await saveDialog({ defaultPath: `${base}.${fmt}`, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] }).catch(() => null);
  if (!path) return;
  let data: Uint8Array;
  if (fmt === 'docx') data = docx(blocks(html));
  else if (fmt === 'rtf') data = strToU8(rtf(blocks(html)));
  else if (fmt === 'html') data = strToU8(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(base)}</title><style>body{font:16px/1.6 'Gentium Plus',Georgia,serif;max-width:46em;margin:2em auto;padding:0 1em}h1{font-size:1.5em}h2{font-size:1.2em;margin-top:1.6em}</style></head><body>${html.replace(/ data-[\w-]+="[^"]*"/g, '')}</body></html>`);
  else data = strToU8(blocks(html).map(b => (b.kind === 'p' ? '' : '\n') + b.runs.map(r => r.t).join('').trim()).join('\n') + '\n');
  try { await writeFile(path, data); flash(`Exported ${n} topic${n === 1 ? '' : 's'} to ${path.split(/[\\/]/).pop()}`); }
  catch (e) { flash('Could not save: ' + String((e as Error).message || e)); }
  return;
}
/** for the tests: the same conversions without dialogs */
export const exportForTest = { docx: (html: string) => docx(blocks(html)), rtf: (html: string) => rtf(blocks(html)), blocks };
