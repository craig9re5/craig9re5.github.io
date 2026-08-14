// Post Composer Service Worker for PWA Shell
const CACHE_NAME = "post-composer-v3";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./post-composer.html",
  "./post-composer.css",
  "./post-composer-app.js",
  "./post-composer-renderer.js",
  "./crypto-js.min.js",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        // Continue even if some individual static asset fails
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Do not cache API requests or non-GET requests
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/publish") || url.pathname === "/status" || url.hostname === "api.github.com") {
    return;
  }

  // Network first for HTML/app files, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
