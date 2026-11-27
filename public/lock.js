/* Plate scroll lock: while any sheet or dialog is open, the page behind it cannot scroll (iOS Safari lets the page behind move even under a modal).
   The page is pinned in place at its current scroll position and put back exactly where it was when the last dialog closes. Works for every dialog in the app, nested ones included. */
(function () {
  'use strict';
  const open = new Set(); let y = 0, saved = null;
  function lock() {
    if (saved) return;
    const b = document.body, s = b.style; y = window.scrollY || document.documentElement.scrollTop || 0;
    saved = { position: s.position, top: s.top, left: s.left, right: s.right, width: s.width };
    s.position = 'fixed'; s.top = -y + 'px'; s.left = '0'; s.right = '0'; s.width = '100%';
    document.documentElement.classList.add('modalOpen');
  }
  function unlock() {
    if (!saved) return;
    const s = document.body.style; Object.assign(s, saved); saved = null;
    document.documentElement.classList.remove('modalOpen'); window.scrollTo(0, y);
  }
  window.__lock = () => ({ n: open.size, saved: !!saved, y });
  const showModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () {
    const r = showModal.apply(this, arguments);
    if (!open.has(this)) { open.add(this); lock(); }
    return r;
  };
  document.addEventListener('close', (e) => { if (open.delete(e.target) && !open.size) unlock(); }, true);

  /* portrait only. Android installs honour the manifest and this call; iPhone does not allow any web app to lock rotation, so there the app covers the screen
     with a "turn upright" card while the phone is on its side, and uncovers it the moment it is upright again. */
  try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {}); } catch (e) {}
  const veil = document.createElement('div'); veil.id = 'rotVeil'; veil.setAttribute('aria-hidden', 'true');
  veil.innerHTML = '<div><svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg><b>Turn your phone upright</b></div>';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(veil));
  if (document.body) document.body.appendChild(veil);
})();
