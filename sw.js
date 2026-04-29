const CACHE_NAME = "taskmaster-shell-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./tasks.html",
  "./profile.html",
  "./login.html",
  "./signup.html",
  "./styles.css",
  "./auth.css",
  "./script.js",
  "./icon.png",
  "./icon.jpeg"
];

const ROUTE_FALLBACKS = new Map([
  ["/", "./index.html"],
  ["/index.html", "./index.html"],
  ["/dashboard.html", "./dashboard.html"],
  ["/tasks.html", "./tasks.html"],
  ["/profile.html", "./profile.html"],
  ["/login.html", "./login.html"],
  ["/signup.html", "./signup.html"]
]);

function resolveFallback(pathname) {
  return ROUTE_FALLBACKS.get(pathname) || "./index.html";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then((response) => {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        return response;
      }).catch(async () => {
        const cached = await caches.match(request);
        return cached || caches.match(resolveFallback(url.pathname));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => (
      cached || fetch(request).then((response) => {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        return response;
      }).catch(() => caches.match(resolveFallback(url.pathname)))
    ))
  );
});
