// Service worker — app-shell caching for offline use.
// Bump CACHE when you change any precached file.
const CACHE = "sermon-notes-v4";

// On localhost, never cache — so editing files always shows fresh on reload.
const DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./js/app.js",
  "./js/config.js",
  "./js/db.js",
  "./js/store.js",
  "./js/recorder.js",
  "./js/api.js",
  "./js/ui.js",
  "./js/export.js",
  "./js/supabase.js",
  "./js/sync.js",
  "./js/push.js",
  "./js/views/record.js",
  "./js/views/archive.js",
  "./js/views/study.js",
  "./js/views/search.js",
  "./js/views/settings.js",
  "./js/views/quiz.js",
  "./js/views/daily.js",
];

self.addEventListener("install", (e) => {
  if (DEV) { self.skipWaiting(); return; }
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || DEV) return;

  const url = new URL(req.url);
  // Never cache API calls or cross-origin (Supabase, CDN libs, Deepgram, etc.)
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Network-first: always try for fresh content (so deploys show up immediately),
  // updating the cache; fall back to cache only when offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined))
      )
  );
});

// Web Push (Phase 4) — display notifications pushed from Cloudflare cron.
self.addEventListener("push", (e) => {
  let data = { title: "Sermon Notes", body: "Time for today's quiz.", url: "./index.html" };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./index.html";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.postMessage({ type: "navigate", url: target }); return c.focus(); }
      }
      return self.clients.openWindow(target);
    })
  );
});
