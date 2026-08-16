"use client";

import { useEffect } from "react";

/**
 * Subscribe this BROWSER to push, silently, on every load.
 *
 * ── The bug this exists to fix ──────────────────────────────────────────────
 *
 * Dustin, 16 Aug: "Noone is chatting in the group chat. confirm they are
 * getting notification."
 *
 * They were not. 29 active clients with logins; TWO device tokens in the whole
 * database. `PushRegister` — the component next to this one — returns
 * immediately unless it is running inside the Android APK, so every client on
 * the installed web app received nothing, ever. A hundred group messages in a
 * fortnight and 27 people were never told about one of them.
 *
 * ── Why it never ASKS ───────────────────────────────────────────────────────
 *
 * This component only ever subscribes when permission has ALREADY been granted.
 * It never calls `requestPermission()`.
 *
 * A permission prompt fired on page load is the fastest way to get "Block"
 * pressed, and a blocked origin cannot be asked again — the client would have
 * to find it in browser settings, which means never. So the ASK lives on the
 * settings screen behind a button the person chose to press, where the app can
 * say what the notifications are for first. This component's job is only to
 * make sure a granted permission actually results in a stored subscription:
 * after a reinstall, on a second device, or when the browser rotates an
 * endpoint.
 *
 * ── Inert until configured ──────────────────────────────────────────────────
 *
 * No VAPID key on the instance means no subscribe attempt at all, which is what
 * lets this ship before the keys exist.
 */
export default function WebPushRegister() {
  useEffect(() => {
    (async () => {
      try {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
        // Only when already granted. Never prompt from here.
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

        const cfg = await fetch("/api/push/subscribe").then((r) => r.json()).catch(() => null);
        if (!cfg?.configured || !cfg?.publicKey) return;

        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();

        // Already subscribed with the SAME key: still POST it. The endpoint may
        // be missing server-side — a restored backup, a wiped row, a browser
        // that rotated it while the app was closed — and a subscription the
        // server does not know about is indistinguishable from no subscription
        // at all. Re-posting is cheap; upsert-on-endpoint makes it idempotent.
        let sub = existing;
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
          });
        }

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
      } catch {
        /* Never surface anything here — the person did not ask for this. */
      }
    })();
  }, []);

  return null;
}

/**
 * VAPID keys arrive base64url; PushManager wants raw bytes.
 *
 * Typed as ArrayBuffer rather than Uint8Array on purpose: lib.dom's
 * applicationServerKey is BufferSource, and TS 5.7+ types Uint8Array as
 * Uint8Array<ArrayBufferLike>, which is not assignable to it. Returning the
 * underlying buffer is the honest fix; casting would have hidden a real
 * mismatch behind an `as`.
 */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out.buffer;
}
