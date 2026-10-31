/* Plate: chat polish for the three chats (Recipes, Nutrition Ask, Gym Coach).
   The chats redraw their whole list on every change, so this watches each list and animates only what is new:
   your message flies up from the box, a typing indicator while waiting, and the reply fades in word by word.
   The send buttons become a round arrow that lights up when there is something to send. */
(function () {
  'use strict';
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seen = {};                          // chat id -> signatures of the messages already shown
  const sigOf = (el) => el.className.replace(/\s*\bfx\w+/g, '').trim() + '|' + (el.textContent || '').length + '|' + (el.textContent || '').slice(0, 24);

  function dots(el) {
    if (el.querySelector('.tdots')) return;
    const label = el.textContent.trim();
    el.innerHTML = `<span class="tdots" aria-hidden="true"><i></i><i></i><i></i></span><span class="tlabel">${label.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</span>`;
  }
  /* wrap the words of the reply's text so they appear one after another, like it is being written */
  function words(el) {
    const host = el.classList.contains('ans') ? el.firstElementChild : el;
    if (!host) return;
    const nodes = []; const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode; if (n.nodeValue.trim() && !n.parentElement.closest('button, .chip, .srcs, .actions, .tdots')) nodes.push(n); }
    const total = nodes.reduce((a, n) => a + n.nodeValue.split(/\s+/).filter(Boolean).length, 0); if (!total) return;
    const step = Math.max(6, Math.min(26, 900 / total)); let k = 0;
    nodes.forEach((n) => {
      const frag = document.createDocumentFragment();
      n.nodeValue.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const s = document.createElement('span'); s.className = 'fxw'; s.style.animationDelay = Math.round(k++ * step) + 'ms'; s.textContent = part; frag.appendChild(s);
      });
      n.parentNode.replaceChild(frag, n);
    });
  }
  function scan(list) {
    if (!list || !list.id) return;
    const items = [...list.children].filter((c) => c.classList.contains('msg') || c.classList.contains('recipe'));
    items.forEach((el) => { if (el.classList.contains('wait')) dots(el); });
    const sigs = items.map(sigOf), prev = seen[list.id];
    seen[list.id] = sigs;
    if (!prev || reduce()) return;                       // first time this chat is drawn: show it as it is
    items.forEach((el, i) => {
      if (i < prev.length && prev[i] === sigs[i]) return;
      if (!items.slice(0, i).some((x) => x.classList.contains('me')) && !el.classList.contains('me')) return;   // the opening greeting just appears, no animation
      if (el.classList.contains('me')) el.classList.add('fxSend');
      else if (el.classList.contains('wait')) el.classList.add('fxIn');
      else { el.classList.add('fxIn'); if (el.classList.contains('msg') && !el.classList.contains('err')) words(el); }
    });
  }

  /* the send buttons: a round arrow, dim until there is text */
  const ARROW = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
  const SENDS = [['chatSend', 'chatInput'], ['nSend', 'nInput'], ['gcGo', 'gcIn']];
  function buttons() {
    SENDS.forEach(([b, t]) => {
      const btn = document.getElementById(b), ta = document.getElementById(t); if (!btn || !ta) return;
      if (!btn.classList.contains('sendBtn')) { btn.setAttribute('aria-label', btn.textContent.trim() || 'Send'); btn.innerHTML = ARROW; btn.classList.add('sendBtn'); }
      const upd = () => btn.classList.toggle('empty', !ta.value.trim());
      if (!ta.__fx) { ta.__fx = true; ta.addEventListener('input', upd); ta.form && ta.form.addEventListener('submit', () => setTimeout(upd, 0)); }
      upd();
    });
  }

  const roots = ['chat', 'nChat', 'gCoach'];
  let queued = false;
  const run = () => { queued = false; scan(document.getElementById('chat')); scan(document.getElementById('nChat')); scan(document.getElementById('gcChat')); buttons(); };
  const mo = new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(run); } });
  function watch() { roots.forEach((id) => { const el = document.getElementById(id); if (el && !el.__fxw) { el.__fxw = true; mo.observe(el, { childList: true, subtree: id === 'gCoach' }); } }); run(); }
  watch(); document.addEventListener('click', () => setTimeout(watch, 50), true);
  /* a fresh value typed by the app (a chip tapped, a draft restored) also updates the arrow */
  setInterval(buttons, 800);
})();
