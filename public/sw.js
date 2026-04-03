const CACHE_NAME = "marathon-app-v2";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/asset-manifest.json",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/logo192.png",
  "/logo512.png",
  "/icon.png",
];

async function getBuildAssets() {
  try {
    const response = await fetch("/asset-manifest.json", { cache: "no-store" });
    if (!response.ok) {
      return [];
    }

    const manifest = await response.json();
    const files = Object.values(manifest.files || {})
      .filter((value) => typeof value === "string" && value.startsWith("/"));

    return Array.from(new Set(files));
  } catch {
    return [];
  }
}

async function warmAppShellCache() {
  const buildAssets = await getBuildAssets();
  const assetsToCache = Array.from(new Set([...CORE_ASSETS, ...buildAssets]));
  const cache = await caches.open(CACHE_NAME);

  await Promise.all(
    assetsToCache.map(async (asset) => {
      try {
        await cache.add(asset);
      } catch {
        // Skip files that are temporarily unavailable without failing install.
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    warmAppShellCache().then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
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
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put("/", copy);
            cache.put("/index.html", copy.clone());
          });
          return response;
        })
        .catch(async () => {
          const cached = await caches.match("/index.html");
          return cached || caches.match("/");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match("/index.html"));
    })
  );
});
