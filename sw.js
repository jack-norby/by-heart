// By Heart: offline support. The app shell is cached on install; bump VERSION (with the ?v= in
// index.html) on every release so phones pick up the new files.
const VERSION = "202610201406";
const CACHE = "byheart-" + VERSION;
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "favicon.svg?v=" + VERSION, "favicon-32.png?v=" + VERSION, "apple-touch-icon.png", "icon-192.png", "icon-512.png",
  "style.css?v=" + VERSION, "config.js?v=" + VERSION, "bible.js?v=" + VERSION, "library.js?v=" + VERSION, "words.js?v=" + VERSION, "memory.js?v=" + VERSION, "app.js?v=" + VERSION, "firebase-config.js?v=" + VERSION, "account.js?v=" + VERSION,
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("byheart-") && k !== CACHE && k !== "byheart-fonts").map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // optional reading fonts: keep a copy once loaded so they work offline
  if (url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com") {
    e.respondWith(caches.open("byheart-fonts").then(c => c.match(req).then(hit => hit || fetch(req).then(res => { c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return; // Bible lookups always go to the network
  if (/\/(firebase-)?config\.js$/.test(url.pathname)) { e.respondWith(fetch(req).catch(() => caches.match(req))); return; } // keys can change between releases
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); return res; })
      .catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
