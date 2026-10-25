/*
 * Doro service worker.
 *
 * Two jobs:
 *   1. Keep the app usable when the connection drops (campus wifi, tunnels).
 *   2. Show web push notifications with in-app notifications as the fallback.
 *
 * Caching is deliberately conservative: the shell and static assets are cached,
 * API calls never are. A stale task list would be worse than an offline one, and
 * the app already keeps its state in localStorage.
 *
 * Bump VERSION in the same commit as any deploy that changes the shell or the
 * brand assets. `install` skips waiting and `activate` deletes every older
 * doro-* cache, so the next page load is served from the new bundle instead of
 * a mix of old chunks. The registration in components/pwa-bridge.tsx reloads
 * the tab once the new worker takes control.
 */

const VERSION = "doro-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = [
  "/",
  "/discover",
  "/activity",
  "/notifications",
  "/profile",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // One bad route must not fail the whole install, so each entry is
      // fetched on its own.
      await Promise.all(
        SHELL_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response.clone());
          } catch {
            // Offline during install: keep whatever the runtime cache has.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("doro-") && !name.startsWith(VERSION))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, cacheName, { shellFallback = true } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (!shellFallback) throw new Error("offline");
    // Any shell page will boot the client, which renders from localStorage.
    const shell =
      (await cache.match("/discover")) ||
      (await cache.match("/")) ||
      (await caches.match("/discover")) ||
      (await caches.match("/"));
    if (shell) return shell;
    throw new Error("offline");
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh in the background so the next visit is current.
    fetch(request)
      .then((response) => {
        if (response && response.ok) cache.put(request, response.clone());
      })
      .catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Live data only: the app degrades to localStorage when these fail.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // Brand assets keep their URL across deploys (unlike hashed Next chunks),
  // so they go to the network first: a new favicon or manifest should land on
  // the first load after a deploy, not one visit later.
  const isBrandAsset =
    url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest";
  if (isBrandAsset) {
    event.respondWith(networkFirst(request, ASSET_CACHE, { shellFallback: false }));
    return;
  }

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?|webmanifest)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});

/* ---------------------------------------------------------------- web push */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Doro";
  const options = {
    body: payload.body || "You have a new update.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "doro-update",
    data: { url: payload.url || "/notifications" },
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
