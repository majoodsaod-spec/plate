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
})();
