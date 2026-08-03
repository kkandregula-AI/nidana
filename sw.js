/* NIDĀNA — offline service worker.
   Strategy: NETWORK-FIRST for HTML/navigation so a new deploy is picked up
   immediately; CACHE-FIRST for static sub-resources. Falls back to cache
   when offline. Bump CACHE on each release to evict old entries. */
const CACHE = "nidana-v14";
const CORE  = ["./", "./index.html"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(CORE.map(u => c.add(u).catch(() => {})))
    )
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Allow the page to activate a waiting worker immediately.
self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isHTML(req) {
  if (req.mode === "navigate") return true;
  const a = req.headers.get("accept") || "";
  return a.includes("text/html");
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch api.anthropic.com

  if (isHTML(req)) {
    // NETWORK-FIRST: always try the live version, cache it, fall back offline.
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() =>
        caches.match(req).then(hit => hit || caches.match("./index.html") || caches.match("./"))
      )
    );
    return;
  }

  // CACHE-FIRST for everything else (icons, fonts, static assets).
  e.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).then(res => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
    )
  );
});
