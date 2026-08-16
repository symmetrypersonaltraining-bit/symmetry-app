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

/* ── PUSH ────────────────────────────────────────────────────────────────────
 *
 * Added 16 Aug 2026, and it is the whole reason nobody was being notified.
 *
 * Dustin: "Noone is chatting in the group chat. confirm they are getting
 * notification." They were not. 29 active clients, TWO device tokens in the
 * database — his and one other. PushRegister returns immediately unless it is
 * running inside the Android APK, so everyone on the installed web app got
 * nothing, ever. A hundred group messages went out in a fortnight and 27 people
 * were never told about a single one. The silence was not disinterest.
 *
 * This handler is the other half of that fix: the server can now reach any
 * browser that has subscribed, Android or iPhone-added-to-home-screen, with no
 * APK involved.
 *
 * The comment at the top of this file says it deliberately caches almost
 * nothing, and that still holds — push does not cache anything.
 */

self.addEventListener("push", (event) => {
  // A push with no data still shows something. A silent failure here is
  // indistinguishable from not being subscribed, which is the exact confusion
  // this whole change exists to end.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = { body: event.data ? event.data.text() : "" };
    } catch {
      payload = {};
    }
  }

  const title = payload.title || "Symmetry";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-192.png",
    // tag groups repeats: three group messages collapse into one notification
    // rather than three, which is the difference between a busy app and a
    // muted one.
    tag: payload.tag || undefined,
    renotify: !!payload.tag,
    data: { url: payload.url || "/messages" },
    // Vibrate is what makes it read as a message rather than an advert.
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/messages";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Focus a tab that is already open rather than stacking another one, and
      // navigate it to the thread the notification came from — a group push
      // that dumps you on the client list is the reason people stop tapping.
      for (const client of all) {
        if ("focus" in client) {
          try {
            await client.focus();
            if ("navigate" in client) await client.navigate(target);
            return;
          } catch {
            /* fall through to openWindow */
          }
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});

/* A subscription can be rotated by the browser at any time. Without this the
 * old endpoint keeps being pushed to, every send 410s, and the person silently
 * stops receiving anything — the failure mode this file was added to fix,
 * arriving by a different door. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const sub = await self.registration.pushManager.subscribe(
          event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true },
        );
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON(), replaces: event.oldSubscription ? event.oldSubscription.endpoint : null }),
        });
      } catch {
        /* nothing useful to do in a worker with no UI */
      }
    })(),
  );
});
