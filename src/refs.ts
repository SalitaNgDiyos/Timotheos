// Bible references inside books, commentaries and dictionaries: plain-text references ("John 3:16",
// "1 Cor. 13:4-7", e-Sword's "Php_1:17", and follow-ons like "; 5:30" or ", 8") become links, and every
// Bible link shows the verse text when the mouse rests on it.
import canon from './legacy/canon.js';

const BOOK = String.raw`((?:[1-4]|I{1,3}|IV)\s?)?([A-Z][a-z]{1,13}\.?)`;
const RE = new RegExp(String.raw`(^|[^\w>])` + BOOK + String.raw`(?:\s|_|&nbsp;)(\d{1,3}):(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?(?![\w:])`, 'g');
const MORE = /^((?:[;,]|\s(?:and|&amp;))\s*)(?:(\d{1,3}):)?(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?(?![\w:])/;
const ROMAN: Record<string, string> = { I: '1', II: '2', III: '3', IV: '4' };
// words that look like a book name followed by a number but are not ("See 3:16" is not a book)
const NOT = new Set(['see', 'at', 'ch', 'chap', 'chapter', 'ver', 'verse', 'vol', 'p', 'pp', 'page', 'part', 'no', 'cf', 'ibid', 'in', 'on', 'to', 'and', 'the', 'or', 'by', 'of', 'art', 'sec', 'line', 'note', 'app', 'fig', 'col', 'ps.', 'time']);

/** book id of a written book name, strict enough for running text */
function bookOf(num: string | undefined, name: string): number | null {
  const n = name.replace(/\.$/, '');
  if (!num && NOT.has(n.toLowerCase())) return null;
  const pre = num ? (ROMAN[num.trim()] || num.trim()) : '';
  const id = canon.findBook(pre + n) || (pre ? canon.findBook(pre + ' ' + n) : null);
  if (!id) return null;
  // a short abbreviation must be a known one, not just the start of some book's name
  const bk = canon.book(id); const k = (pre + n).toLowerCase().replace(/\s/g, '');
  const known = [bk.name, ...bk.abbrs].some((a: string) => a.toLowerCase().replace(/\s/g, '') === k);
  return known || n.length >= 4 ? id : null;
}

const link = (b: number, c: number, v: number, v2: number | undefined, text: string) =>
  `<a class="link bref" data-href="tw://bible.*?id=${b}.${c}.${v}${v2 && v2 > v ? `-${b}.${c}.${v2}` : ''}">${text}</a>`;

/** link the references in one piece of text (already HTML-escaped) */
export function linkText(t: string): string {
  let out = '', i = 0; RE.lastIndex = 0; let m: RegExpExecArray | null;
  while ((m = RE.exec(t))) {
    const [all, pre, num, name, c, v, v2] = m;
    const b = bookOf(num, name); if (!b) continue;
    out += t.slice(i, m.index) + pre + link(b, +c, +v, v2 ? +v2 : undefined, all.slice(pre.length).replace(/_/g, ' '));
    let j = m.index + all.length, cc = +c;
    for (let f: RegExpExecArray | null; (f = MORE.exec(t.slice(j)));) {
      // ", 8" after a verse is another verse of the same chapter; "; 5:30" another chapter
      if (!f[2] && f[1].trim() === ';') break;
      if (f[2]) cc = +f[2];
      out += f[1] + link(b, cc, +f[3], f[4] ? +f[4] : undefined, f[0].slice(f[1].length));
      j += f[0].length;
    }
    i = j; RE.lastIndex = j;
  }
  return out + t.slice(i);
}

/** link plain-text references in an HTML fragment, leaving existing links and tags alone */
export function linkRefs(root: ParentNode): void {
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const todo: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text; if (!/\d:\d/.test(t.data) || t.parentElement?.closest('a, h4, .src, script, style')) continue;
    todo.push(t);
  }
  for (const t of todo) {
    const esc = t.data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = linkText(esc); if (html === esc) continue;
    const span = document.createElement('span'); span.innerHTML = html; t.replaceWith(...span.childNodes);
  }
}

/** parse a Bible link: tw://bible.*?id=43.3.16 or ...id=43.3.16-43.3.18 */
export function bibleTarget(href: string): { b: number; c: number; v: number; span: number } | null {
  const m = /[?&|]id=(\d+)\.(\d+)(?:\.(\d+))?(?:-(\d+)\.(\d+)\.(\d+))?/.exec(href || '');
  if (!m) return null;
  const v = m[3] ? +m[3] : 1; const span = m[6] && +m[4] === +m[1] && +m[5] === +m[2] ? Math.max(0, +m[6] - v) : 0;
  return { b: +m[1], c: +m[2], v, span };
}

/** show the verse text when the mouse rests on a Bible link anywhere outside the Bible text itself */
export function wireRefPreview(preview: (ref: string) => Promise<string>): void {
  const tip = document.createElement('div'); tip.id = 'reftip'; tip.className = 'popup reftip hidden'; document.body.appendChild(tip);
  let timer = 0, cur: HTMLElement | null = null;
  const hide = () => { clearTimeout(timer); cur = null; tip.classList.add('hidden'); };
  document.addEventListener('mouseover', e => {
    const a = (e.target as HTMLElement).closest?.<HTMLElement>('a[data-href]');
    if (!a || a === cur) return;
    const r = bibleTarget(a.dataset.href || ''); if (!r || !/bible/i.test(a.dataset.href || '')) return;
    cur = a; clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const html = await preview(`${r.b}.${r.c}.${r.v}.${r.span}`); if (cur !== a || !html) return;
      tip.innerHTML = html; tip.classList.remove('hidden');
      const rc = a.getBoundingClientRect();
      const x = Math.min(Math.max(8, rc.left), innerWidth - tip.offsetWidth - 8); let y = rc.bottom + 6;
      if (y + tip.offsetHeight > innerHeight - 8) y = Math.max(8, rc.top - tip.offsetHeight - 6);
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }, 350);
  });
  document.addEventListener('mouseout', e => { if (cur && !cur.contains(e.relatedTarget as Node)) hide(); });
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('scroll', hide, true);
}
