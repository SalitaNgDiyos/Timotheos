'use strict';
/* User Guide window: takes the colours of the skin chosen in Timotheos, builds the contents list, finds text. */
/* global TimotheosOptions */
(function () {
  const skin = new URLSearchParams(location.search).get('skin') || 'parchment';
  const sk = TimotheosOptions.SKINS[skin] || TimotheosOptions.SKINS.parchment;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(sk.v)) root.style.setProperty('--' + k, v);
  root.dataset.theme = sk.dark ? 'dark' : 'light';

  const main = document.getElementById('main');
  const secs = [...document.querySelectorAll('#guide section')];
  const toc = document.getElementById('toc');
  toc.innerHTML = secs.map(s => `<a href="#${s.id}" data-id="${s.id}">${s.querySelector('h2').textContent}</a>`).join('');
  toc.addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); document.getElementById(a.dataset.id).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const spy = () => {
    let cur = secs[0];
    for (const s of secs) if (s.offsetTop - main.scrollTop < 120) cur = s;
    toc.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.id === cur.id));
  };
  main.addEventListener('scroll', spy); spy();

  // find: show only the sections that contain the words, and mark them
  const orig = new Map(secs.map(s => [s, s.innerHTML]));
  const find = document.getElementById('find');
  let t = null;
  find.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 150); });
  find.addEventListener('keydown', e => { if (e.key === 'Escape') { find.value = ''; run(); } });
  function run() {
    const q = find.value.trim().toLowerCase();
    let any = false;
    for (const s of secs) {
      s.innerHTML = orig.get(s);
      if (!q) { s.classList.remove('hidden'); continue; }
      const hit = s.textContent.toLowerCase().includes(q);
      s.classList.toggle('hidden', !hit);
      if (hit) { any = true; mark(s, q); }
    }
    document.getElementById('nores').classList.toggle('hidden', !q || any);
    toc.querySelectorAll('a').forEach(a => a.classList.toggle('hidden', !!q && document.getElementById(a.dataset.id).classList.contains('hidden')));
    document.querySelector('h1').classList.toggle('hidden', !!q); document.querySelector('.lead').classList.toggle('hidden', !!q);
    main.scrollTop = 0;
  }
  function mark(el, q) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const nodes = []; let n;
    while ((n = w.nextNode())) if (n.textContent.toLowerCase().includes(q)) nodes.push(n);
    for (const node of nodes) {
      const txt = node.textContent; const low = txt.toLowerCase(); const frag = document.createDocumentFragment(); let i = 0, j;
      while ((j = low.indexOf(q, i)) >= 0) { frag.append(txt.slice(i, j)); const m = document.createElement('mark'); m.textContent = txt.slice(j, j + q.length); frag.append(m); i = j + q.length; }
      frag.append(txt.slice(i)); node.replaceWith(frag);
    }
  }
  document.addEventListener('keydown', e => { if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); find.focus(); find.select(); } });
  // a section to open at (guide.html#search)
  if (location.hash && document.getElementById(location.hash.slice(1))) document.getElementById(location.hash.slice(1)).scrollIntoView();
})();
