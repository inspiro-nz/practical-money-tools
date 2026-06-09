/* ============================================================
   Self-Loan Tracker — Service Worker  (cache: slt-v4)
   Part of Practical Money Tools
   https://inspiro-nz.github.io/practical-money-tools/self-loan-tracker/

   Cache-first for app shell. Network-only for external APIs.
   ============================================================ */

const CACHE_NAME = "slt-v4";

// App shell — all files needed to run offline
const APP_SHELL = [
  "./",
  "index.html",
  "styles.css",
  "manifest.json",
  "react.production.min.js",
  "react-dom.production.min.js",
  "babel.min.js",
  "icon-192.png",
  "icon-512.png",
  "bmc_qr.png",
];

// These must always hit the network
const NETWORK_ONLY_HOSTS = [
  "www.alphavantage.co",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdnjs.cloudflare.com",
  "static.cloudflareinsights.com",
];

// ── Install ───────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clear old caches ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first with network-only bypass ───────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (NETWORK_ONLY_HOSTS.includes(url.hostname)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (
            !response ||
            response.status !== 200 ||
            (response.type !== "basic" && response.type !== "cors")
          ) {
            return response;
          }
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, toCache);
          });
          return response;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("index.html");
          }
        });
    })
  );
});
