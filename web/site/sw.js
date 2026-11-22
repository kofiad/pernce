// Retires the service worker that pernce.com's app used to install at the
// root (scope "/", cache names "pernce-<hash>"), which answered every page
// load with the cached app. The app now lives at /app with its own worker
// (scope /app/, caches "pernce-app-<hash>", mobile/scripts/pwa.mjs). A
// returning browser checks /sw.js, finds this file instead, and this
// worker: takes over at once, deletes the old caches, unregisters itself
// and reloads open pages so they come from the network (the landing page).
// It never touches IndexedDB or OPFS: that is the user's data, and it is
// origin-scoped, so the app at /app still has it.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("pernce-") && !k.startsWith("pernce-app-")).map((k) => caches.delete(k)),
      );
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: "window" });
      await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => {})));
    })(),
  );
});
