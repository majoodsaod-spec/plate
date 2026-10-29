/* Plate sync. Your phone always works on its own copy (so the app is fast and works offline). Every change is queued and sent to your account;
   changes made on other devices are pulled in. If two devices change the same item, the most recent save wins. */
(function (root) {
  'use strict';
  let ob = {}, cursor = 0, ctr = 0, timer = null, running = false, loaded = false, started = false, last = '', err = '', chain = Promise.resolve(), poll = null;
  const key = (s, k) => s + '|' + k;
  const persist = () => { chain = chain.then(() => DB.set('outbox', ob)).catch(() => {}); return chain; };
  async function load() { if (loaded) return; ob = Object.assign({}, (await DB.get('outbox', {})) || {}, ob); cursor = (await DB.get('syncCursor', 0)) || 0; last = (await DB.get('lastSync', '')) || ''; loaded = true; }

  DB.onWrite = (s, k, v, d) => {
    ob[key(s, k)] = { s, k, v: d ? null : v, d: !!d, n: ++ctr };
    persist(); if (started) schedule(1500);
  };
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => sync(), ms); }

  async function push() {
    for (let guard = 0; guard < 50; guard++) {
      const entries = Object.values(ob).slice(0, 300); if (!entries.length) return;
      const r = await Auth.call('/sync/push', { body: { changes: entries.map((e) => ({ s: e.s, k: e.k, v: e.v, d: e.d })) } });
      entries.forEach((e) => { const cur = ob[key(e.s, e.k)]; if (cur && cur.n === e.n) delete ob[key(e.s, e.k)]; });
      await persist();
    }
  }
  async function pull() {
    let since = Math.max(0, cursor - 2000), changed = 0, top = cursor;
    for (let guard = 0; guard < 100; guard++) {
      const r = await Auth.call('/sync/pull?since=' + since), rows = r.rows || [];
      const fresh = rows.filter((x) => !ob[key(x.s, x.k)]);                // never overwrite something you changed here and have not sent yet
      if (fresh.length) { await DB.applyRows(fresh); changed += fresh.length; }
      rows.forEach((x) => { if (x.u > top) top = x.u; });
      if (!rows.length && !cursor && r.now) top = Math.max(top, r.now);
      if (!r.more) break; since = rows[rows.length - 1].u;
    }
    cursor = top; await DB.set('syncCursor', cursor);
    return changed;
  }
  async function sync() {
    if (running || !Auth.token()) return; running = true; err = '';
    try {
      await load(); await push(); const n = await pull();
      last = new Date().toISOString(); await DB.set('lastSync', last);
      if (n && root.Plate && root.Plate.refreshAll) root.Plate.refreshAll();
    } catch (e) { err = e.offline ? 'Offline. Changes are saved on this phone and will sync later.' : e.message; }
    running = false; root.dispatchEvent(new Event('plate-sync'));
  }
  const Sync = {
    async start() {
      await load(); if (started) { sync(); return; } started = true; sync();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
      root.addEventListener('online', () => sync());
      poll = setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 60000);
    },
    stop() { started = false; clearInterval(poll); clearTimeout(timer); },
    sync, flush: async () => { await load(); await sync(); },
    async pending() { await load(); return Object.keys(ob).length; },
    async queueAll() { await load(); (await DB.allRows()).forEach((r) => { ob[key(r.s, r.k)] = { s: r.s, k: r.k, v: r.v, d: false, n: ++ctr }; }); await persist(); },
    status: () => ({ last, err, pending: Object.keys(ob).length }),
  };
  root.Sync = Sync;
})(window);
