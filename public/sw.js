/* Symmetry service worker.
 *
 * It exists for ONE reason: Chrome will not offer "Install app" without a
 * service worker that handles fetch. That prompt is what replaces walking a
 * client through sideloading a debug APK past a Play Protect warning.
 *
 * SO IT DELIBERATELY CACHES ALMOST NOTHING.
 *
 * The native shell loads the live Vercel deployment, which is why a web deploy
 * reaches every phone instantly. A service worker that cached HTML or JS would
 * quietly undo that — clients would sit on a stale build, and "it's fixed on
 * my end" would stop being true. That trade is not worth an offline mode nobody
 * asked for.
 *
 * What it does:
 *   - passes every request straight through to the network
 *   - caches ONLY hashed static assets (/_next/static/*), which are immutable by
 *     construction: a new build produces new filenames, so a cache hit can never
 *     be stale
 *   - takes over immediately on update, so a bad worker can be replaced by
 *     shipping a good one rather than asking people to reinstall
 */

const CACHE = "symmetry-static-v1";

self.addEventListener("install", (event) => {
  // Don't wait for old tabs to close — the point is that updates land now.
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any cache from a previous version of this worker.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Only our own origin, and only immutable build output. Everything else —
  // pages, API calls, Supabase, images from storage — goes to the network every
  // time, with no interception at all.
  const cacheable = url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
  if (!cacheable) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    })(),
  );
});
