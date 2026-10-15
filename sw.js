// Service worker: network-first for the app shell so updates appear immediately,
// with a cached fallback so the album still opens on flaky venue Wi-Fi.
const CACHE = "eg-shell-v3";
const SHELL = [
  "./", "index.html", "config.js", "css/styles.css",
  "js/main.js", "js/util.js", "js/store.js", "js/camera.js", "js/gallery.js", "js/wall.js", "js/fx.js",
  "vendor/qrcode.mjs", "vendor/supabase.min.js",
  "icons/icon-192.png", "images/couple.png", "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // never touch Supabase / photo traffic
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
