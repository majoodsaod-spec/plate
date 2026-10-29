/* Plate: the chat message box (coach, nutrition Ask, recipe chat).
   It floats at the bottom of the screen and rides up above the on-screen keyboard while you type, grows with your text up to a limit
   (then scrolls inside itself), and is roomier when the keyboard is closed. Nothing here touches your data. */
(function () {
  'use strict';
  const FLOAT = '#gcForm, #nForm, #chatForm';
  const root = document.documentElement, vv = window.visualViewport;
  let kbOpen = false;

  function inset() {
    if (!vv) return 0;
    return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  }
  function place() {
    const kb = inset(); kbOpen = kb > 90;               // small differences are the browser's own toolbar, not a keyboard
    root.style.setProperty('--kb', (kbOpen ? kb : 0) + 'px');
    root.classList.toggle('kb-open', kbOpen);
    /* iOS slides the visible area when the keyboard opens; the top bars follow it so they stay on screen */
    root.style.setProperty('--vvtop', (kbOpen && vv ? Math.max(0, Math.round(vv.offsetTop)) : 0) + 'px');
    const top = document.querySelector('header.top'); if (top) root.style.setProperty('--topH', top.offsetHeight + 'px');
    root.style.setProperty('--vvh', (vv ? Math.round(vv.height) : window.innerHeight) + 'px');
    grow(); reserve();
  }
  /* the room the floating box takes, so the last message is never hidden behind it */
  function reserve() {
    let h = 0; document.querySelectorAll(FLOAT).forEach((f) => { if (f.getClientRects().length) h = Math.max(h, f.offsetHeight); });
    root.style.setProperty('--composerH', h ? h + 28 + 'px' : '0px');
  }
  function grow(t) {
    const list = t ? [t] : document.querySelectorAll('.composer textarea');
    const cap = Math.max(96, Math.min(kbOpen ? 150 : 220, Math.round((vv ? vv.height : window.innerHeight) * (kbOpen ? 0.28 : 0.34))));
    list.forEach((el) => {
      if (el.offsetParent === null) return;
      el.style.height = 'auto';
      const h = Math.min(cap, el.scrollHeight); el.style.height = h + 'px'; el.style.overflowY = el.scrollHeight > cap ? 'auto' : 'hidden';
    });
  }
  if (vv) { vv.addEventListener('resize', place); vv.addEventListener('scroll', place); }
  window.addEventListener('resize', place); window.addEventListener('orientationchange', () => setTimeout(place, 250));
  document.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('.composer textarea')) { grow(e.target); reserve(); } });
  /* when the keyboard comes up, keep the latest messages in view above the box */
  document.addEventListener('focusin', (e) => {
    if (!e.target.matches || !e.target.matches('.composer textarea')) return;
    [120, 380].forEach((ms) => setTimeout(() => { place(); const chat = document.querySelector('.view:not([hidden]) .chat'); const last = chat && chat.lastElementChild; if (last) last.scrollIntoView({ block: 'end' }); }, ms));
  });
  document.addEventListener('focusout', () => setTimeout(place, 150));
  /* the boxes are redrawn and shown/hidden by other code: keep measurements fresh */
  if (window.MutationObserver) new MutationObserver(() => { grow(); reserve(); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  if (window.ResizeObserver) { const ro = new ResizeObserver(reserve); const watch = () => document.querySelectorAll(FLOAT).forEach((f) => ro.observe(f)); watch(); setTimeout(watch, 1500); }
  place();
})();
