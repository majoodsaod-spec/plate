/* Plate: the chat message box (coach, nutrition Ask, recipe chat).
   It floats at the bottom of the screen and rides up above the on-screen keyboard while you type, grows with your text up to a limit
   (then scrolls inside itself), and is roomier when the keyboard is closed. Nothing here touches your data. */
(function () {
  'use strict';
  const FLOAT = '#gcForm, #nForm, #chatForm';
  const root = document.documentElement, vv = window.visualViewport;
  let kbOpen = false;

  /* while you type in a chat box the page itself stops scrolling: the screen is the visible area above the keyboard, the messages scroll inside it, and the box sits at its bottom */
  let locked = false, savedY = 0;
  const isChatField = (el) => !!(el && el.matches && el.matches('#gcIn, #nInput, #chatInput'));
  function lock() {
    if (locked) return; locked = true; savedY = window.scrollY;
    root.classList.add('chatlock'); const m = document.querySelector('main'); if (m) m.scrollTop = savedY;
  }
  function unlock() {
    if (!locked) return; locked = false;
    const m = document.querySelector('main'), y = m ? m.scrollTop : 0;
    root.classList.remove('chatlock'); if (m) m.scrollTop = 0; window.scrollTo(0, y);
  }
  let typing = false;                                   // a text field has focus (so the keyboard is up or coming up)
  const isField = (el) => !!(el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), textarea, select, [contenteditable]'));
  const layoutH = () => Math.max(window.innerHeight, root.clientHeight || 0);
  function inset() {
    if (!vv) return 0;
    return Math.max(0, Math.round(layoutH() - vv.height - vv.offsetTop));
  }
  function place() {
    const kb = inset(); kbOpen = typing && kb > 90;      // small differences are the browser's own toolbar, not a keyboard
    root.style.setProperty('--kb', (kbOpen ? kb : 0) + 'px');
    root.classList.toggle('kb-open', kbOpen);
    /* iOS slides the visible area when the keyboard opens; the top bars follow it so they stay on screen */
    root.style.setProperty('--vvtop', (typing && !locked && vv ? Math.max(0, Math.round(vv.offsetTop)) : 0) + 'px');
    const top = document.querySelector('header.top'); if (top) root.style.setProperty('--topH', top.offsetHeight + 'px');
    root.style.setProperty('--vvh', (vv ? Math.round(vv.height) : window.innerHeight) + 'px');
    grow(); reserve(); dbg();
  }
  /* tap the version number next to the title to show live screen numbers (for fixing keyboard problems) */
  let dbgOn = false, dbgEl = null;
  function dbg() {
    if (!dbgOn) return; if (!dbgEl) { dbgEl = document.createElement('pre'); dbgEl.style.cssText = 'position:fixed;left:6px;bottom:90px;z-index:99;margin:0;padding:6px 8px;background:rgba(0,0,0,.8);color:#7CFC00;font:11px/1.3 monospace;border-radius:8px;pointer-events:none;white-space:pre'; document.body.appendChild(dbgEl); }
    dbgEl.textContent = 'inner ' + window.innerWidth + 'x' + window.innerHeight + '  client ' + root.clientHeight + '\nvv h ' + (vv ? Math.round(vv.height) : '-') + ' top ' + (vv ? Math.round(vv.offsetTop) : '-') + ' scale ' + (vv ? vv.scale.toFixed(2) : '-') + '\nscrollY ' + Math.round(window.scrollY) + '  typing ' + typing + '  kb ' + inset();
  }
  document.addEventListener('click', (e) => { if (e.target.id === 'ver') { dbgOn = !dbgOn; if (!dbgOn && dbgEl) { dbgEl.remove(); dbgEl = null; } place(); } });
  /* while typing, re-measure on every frame for a moment: iOS moves the screen in animated steps and fires few events */
  let raf = 0; function burst(ms) { const t0 = Date.now(); cancelAnimationFrame(raf); const step = () => { place(); if (Date.now() - t0 < ms) raf = requestAnimationFrame(step); }; step(); }
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
  if (vv) { vv.addEventListener('resize', () => { place(); if (typing) burst(600); }); vv.addEventListener('scroll', place); }
  window.addEventListener('resize', place); window.addEventListener('orientationchange', () => setTimeout(place, 250));
  document.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('.composer textarea')) { grow(e.target); reserve(); } });
  /* when the keyboard comes up, keep the latest messages in view above the box */
  document.addEventListener('focusin', (e) => {
    if (isField(e.target)) { typing = true; if (isChatField(e.target)) lock(); burst(1200); }
    if (!e.target.matches || !e.target.matches('.composer textarea')) return;
    [120, 380].forEach((ms) => setTimeout(() => { place(); const chat = document.querySelector('.view:not([hidden]) .chat'); const last = chat && chat.lastElementChild; if (last) last.scrollIntoView({ block: 'end' }); }, ms));
  });
  document.addEventListener('focusout', () => setTimeout(() => { typing = isField(document.activeElement); if (!isChatField(document.activeElement)) unlock(); burst(800); }, 120));
  /* the boxes are redrawn and shown/hidden by other code: keep measurements fresh */
  if (window.MutationObserver) new MutationObserver(() => { grow(); reserve(); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  if (window.ResizeObserver) { const ro = new ResizeObserver(reserve); const watch = () => document.querySelectorAll(FLOAT).forEach((f) => ro.observe(f)); watch(); setTimeout(watch, 1500); }
  place();
})();
