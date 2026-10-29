/* Plate service worker: caches the app shell so it opens instantly and offline.
   AI calls (any cross-origin request) always go to the network. Bump VERSION on every deploy. */
const VERSION = 'plate-v97';
const SHELL = ['./', 'index.html', 'styles.css', 'config.js', 'countries.js', 'db.js', 'sync.js', 'auth.js', 'ai.js', 'prompts.js', 'lookup.js', 'burn.js', 'actions.js', 'app.js', 'composer.js', 'goals.js', 'today.js', 'recipes.js', 'nutrition.js', 'insights.js', 'gym-data.js', 'gym-art.js', 'gym-art-f.js', 'rig-lat.js', 'rig2.js', 'rig2-a.js', 'rig2-b.js', 'rig2-c.js', 'rig2-d.js', 'rig2-e.js', 'rig2-f.js', 'rig2-g.js', 'rig2-h.js', 'rig2-i.js', 'rig2-j.js', 'gym.js', 'gym-log.js', 'gym-plan.js', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

/* Safari refuses to show a navigation answered by a service worker with a response that was redirected
   (Cloudflare turns /index.html into /). Rebuild such responses as plain ones, both when caching and when serving. */
const clean = (res) => (res && res.redirected) ? res.blob().then((b) => new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers })) : Promise.resolve(res);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => fetch(u, { cache: 'reload' }).then(clean).then((r) => { if (r.ok) return c.put(u, r); }).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // proxy + fonts: network only
  // stale-while-revalidate for the shell
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then(clean).then((res) => {
        if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit ? clean(hit) : net;
    })
  );
});
