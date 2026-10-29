/* Plate storage: a tiny IndexedDB wrapper. Everything is kept on the phone first (so it works offline); sync.js copies changes to your account.
   Stores: meals (by date), recipes, weights, kv (profile, settings). */
(function (root) {
  'use strict';
  const NAME = 'plate', VER = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const rq = indexedDB.open(NAME, VER);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        const meals = db.createObjectStore('meals', { keyPath: 'id' });
        meals.createIndex('date', 'date');
        db.createObjectStore('recipes', { keyPath: 'id' });
        const w = db.createObjectStore('weights', { keyPath: 'date' });
        w.createIndex('date', 'date');
        db.createObjectStore('kv', { keyPath: 'key' });
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
    return dbp;
  }

  function run(store, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const out = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  /* settings that belong to this phone only and never sync */
  const LOCAL = new Set(['proxyUrl', 'passphrase', 'usage', 'outbox', 'syncCursor', 'localUser', 'lastSync', 'recChats']);
  const note = (st, k, v, d) => { if (DB.onWrite) { try { DB.onWrite(st, k, v, !!d); } catch (e) {} } };
  /* whole years since a YYYY-MM-DD birthday, as of today (local time); -1 if the date is missing or in the future */
  function ageFrom(birth) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth || ''); if (!m) return -1;
    const n = new Date(); let a = n.getFullYear() - +m[1];
    if (n.getMonth() + 1 < +m[2] || (n.getMonth() + 1 === +m[2] && n.getDate() < +m[3])) a--;
    return a >= 0 && a < 130 ? a : -1;
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  /* local calendar day as YYYY-MM-DD (not UTC, so late-night meals land on the right day) */
  const dayKey = (d) => {
    d = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  const DB = {
    uid, dayKey,

    /* meals: { id, date, ts, name, kcal, protein, carbs, fat, fiber, sugar, sodium, confidence, source, note } */
    addMeal(m) {
      const meal = Object.assign({ id: uid(), date: dayKey(), ts: Date.now() }, m);
      return run('meals', 'readwrite', (s) => s.put(meal)).then(() => { note('meals', meal.id, meal); return meal; });
    },
    updateMeal(m) { return run('meals', 'readwrite', (s) => s.put(m)).then(() => note('meals', m.id, m)); },
    deleteMeal(id) { return run('meals', 'readwrite', (s) => s.delete(id)).then(() => note('meals', id, null, true)); },
    getMeal(id) { return run('meals', 'readonly', (s) => s.get(id)); },
    mealsOn(date) {
      return run('meals', 'readonly', (s) => s.index('date').getAll(date))
        .then((r) => (r || []).sort((a, b) => a.ts - b.ts));
    },
    mealsBetween(from, to) {
      return run('meals', 'readonly', (s) => s.index('date').getAll(IDBKeyRange.bound(from, to)));
    },

    /* recipes */
    saveRecipe(r) { r.id = r.id || uid(); r.saved = r.saved || Date.now(); return run('recipes', 'readwrite', (s) => s.put(r)).then(() => { note('recipes', r.id, r); return r; }); },
    deleteRecipe(id) { return run('recipes', 'readwrite', (s) => s.delete(id)).then(() => note('recipes', id, null, true)); },
    allRecipes() { return run('recipes', 'readonly', (s) => s.getAll()).then((r) => (r || []).sort((a, b) => b.saved - a.saved)); },

    /* weights */
    setWeight(date, kg, cm) { const row = cm > 0 ? { date, kg, cm } : { date, kg }; return run('weights', 'readwrite', (s) => s.put(row)).then(() => note('weights', date, row)); },
    deleteWeight(date) { return run('weights', 'readwrite', (s) => s.delete(date)).then(() => note('weights', date, null, true)); },
    allWeights() { return run('weights', 'readonly', (s) => s.getAll()).then((r) => (r || []).sort((a, b) => a.date < b.date ? -1 : 1)); },

    /* key/value: profile, goals, connection settings */
    get(key, fallback) {
      return run('kv', 'readonly', (s) => s.get(key)).then((r) => {
        if (!r) return fallback;
        if (key === 'profile' && r.value && r.value.birth) r.value.age = ageFrom(r.value.birth);     // age always follows the birthday
        return r.value;
      });
    },
    ageFrom,
    set(key, value) { return run('kv', 'readwrite', (s) => s.put({ key, value })).then(() => { if (!LOCAL.has(key)) note('kv', key, { key, value }); }); },

    /* backup: iOS can clear site data if the app goes unused for a long time, so keep an export */
    async exportAll() {
      const dump = { app: 'plate', version: VER, exported: new Date().toISOString() };
      for (const s of ['meals', 'recipes', 'weights', 'kv']) dump[s] = await run(s, 'readonly', (st) => st.getAll());
      return dump;
    },
    async importAll(dump) {
      if (!dump || dump.app !== 'plate') throw new Error('Not a Plate backup file');
      for (const s of ['meals', 'recipes', 'weights', 'kv'])
        await run(s, 'readwrite', (st) => { (dump[s] || []).forEach((row) => { st.put(row); }); });
      for (const s of ['meals', 'recipes', 'weights', 'kv']) (dump[s] || []).forEach((row) => {
        const k = s === 'weights' ? row.date : s === 'kv' ? row.key : row.id;
        if (!(s === 'kv' && LOCAL.has(row.key))) note(s, k, row);
      });
    },

    /* sync support: apply rows from the server without re-queuing them; wipe when a different person signs in */
    onWrite: null, LOCAL,
    async applyRows(rows) {
      const keyOf = { meals: 'id', recipes: 'id', weights: 'date', kv: 'key' };
      for (const r of rows) {
        if (!keyOf[r.s]) continue;
        await run(r.s, 'readwrite', (st) => { if (r.d) st.delete(r.k); else st.put(r.v); });
      }
    },
    async wipe() { for (const s of ['meals', 'recipes', 'weights', 'kv']) await run(s, 'readwrite', (st) => st.clear()); },
    async hasData() {
      for (const s of ['meals', 'recipes', 'weights']) { const n = await run(s, 'readonly', (st) => st.count()); if (n) return true; }
      const kv = await run('kv', 'readonly', (st) => st.getAllKeys()); return (kv || []).some((k) => !LOCAL.has(k) && k !== 'goalsSkipped');
    },
    async allRows() {
      const out = [], keyOf = { meals: 'id', recipes: 'id', weights: 'date', kv: 'key' };
      for (const s of Object.keys(keyOf)) { const rows = await run(s, 'readonly', (st) => st.getAll()); (rows || []).forEach((r) => { if (!(s === 'kv' && LOCAL.has(r.key))) out.push({ s, k: r[keyOf[s]], v: r }); }); }
      return out;
    },
  };

  root.DB = DB;
})(window);
