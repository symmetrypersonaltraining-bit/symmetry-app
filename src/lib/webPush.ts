/**
 * Web Push — the delivery route that actually reaches people.
 *
 * WHY THIS EXISTS, measured before it was written.
 *
 * Dustin, 16 Aug: "Noone is chatting in the group chat. confirm they are
 * getting notification."
 *
 * They were not, and it was not close. 29 active clients with logins; TWO rows
 * in `device_tokens` — his own and one other. Not "switched off": only two
 * preference rows are disabled in the entire table. Nobody could receive a push
 * at all, because `PushRegister` returns immediately unless it is running
 * inside the Android APK (`Capacitor.isNativePlatform()`), and `public/sw.js`
 * had no push handling in it whatsoever.
 *
 * A hundred group messages went out in a fortnight and 27 people were never
 * told about one of them. The silence was not disinterest.
 *
 * Web Push reaches the installed web app on Android and, since iOS 16.4, an
 * iPhone with the app added to the home screen. No APK, no sideloading past a
 * Play Protect warning, no app store.
 *
 * ── INERT UNTIL CONFIGURED ──────────────────────────────────────────────────
 *
 * Same contract as the FCM sender next door: with no VAPID keys in the
 * environment every function here is a safe no-op that returns a reason. It can
 * therefore ship before the keys exist without changing anything for anyone,
 * and `configured()` is what the settings screen asks so it can say "your coach
 * has not finished setting this up" instead of failing silently — which is the
 * failure this whole file exists to end.
 *
 * ── NEVER THROWS ────────────────────────────────────────────────────────────
 *
 * A push failure must never take a message send down with it. Sending is
 * best-effort by definition; the message is the thing that matters.
 */

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export interface WebPushPayload {
  title: string;
  body: string;
  /** Where a tap should land. Group pushes must carry the group thread. */
  url?: string;
  /**
   * Collapse key. Three group messages arriving as one notification is the
   * difference between a busy app and a muted one.
   */
  tag?: string;
}

export interface WebPushResult {
  sent: number;
  failed: number;
  /** Set when nothing was attempted, so a caller can say why. */
  skipped?: "no_vapid_keys" | "no_subscriptions" | "lookup_failed";
}

let configuredOnce = false;

/** The public key the browser needs to subscribe. Null when unconfigured. */
export function vapidPublicKey(): string | null {
  const k = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return k && k.trim() ? k.trim() : null;
}

/** True when this instance can actually send. */
export function configured(): boolean {
  return !!(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function ensureConfigured(): boolean {
  if (!configured()) return false;
  if (!configuredOnce) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      vapidPublicKey() as string,
      process.env.VAPID_PRIVATE_KEY as string,
    );
    configuredOnce = true;
  }
  return true;
}

/**
 * Send to every live subscription a user has.
 *
 * One row per BROWSER, not per user: the same person on a phone and a laptop
 * has two, and should be reached on both.
 *
 * 404 and 410 mean the subscription is dead — the browser was uninstalled, the
 * permission revoked, the endpoint rotated. Those are MARKED, not deleted, so
 * "they had push and it lapsed" stays distinguishable from "they never set it
 * up". Those are different conversations to have with a client.
 */
export async function sendWebPush(userId: string, payload: WebPushPayload): Promise<WebPushResult> {
  if (!ensureConfigured()) return { sent: 0, failed: 0, skipped: "no_vapid_keys" };

  try {
    const admin = createAdminClient();
    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId)
      .is("failed_at", null);

    // A refused READ is not an empty list, and collapsing the two is the exact
    // failure this file was written to end. "no_subscriptions" is what the
    // settings screen turns into "you haven't turned push on" — a sentence that
    // is simply false when the query was rejected, and one that sends the
    // person to fix something that is not broken while the real fault stays
    // invisible. PostgREST returns its error rather than throwing, so the catch
    // at the bottom would never have seen this either.
    if (error) {
      console.error("sendWebPush: could not read push_subscriptions —", error.message);
      return { sent: 0, failed: 0, skipped: "lookup_failed" };
    }
    if (!subs || subs.length === 0) {
      return { sent: 0, failed: 0, skipped: "no_subscriptions" };
    }

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || "/messages",
      ...(payload.tag ? { tag: payload.tag } : {}),
    });

    let sent = 0;
    let failed = 0;

    await Promise.all(
      (subs as { id: string; endpoint: string; p256dh: string; auth: string }[]).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            // 4 hours. A group message that arrives two days late is worse than
            // one that never arrives — it reads as the app being broken.
            { TTL: 60 * 60 * 4 },
          );
          sent += 1;
        } catch (e) {
          failed += 1;
          const status = (e as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            // Unchecked, a refused mark-dead meant this endpoint was retried on
            // every send forever, `failed` climbed on every message, and the
            // one column that would explain why stayed empty. The write returns
            // its error rather than throwing, so nothing anywhere noticed.
            const { error: markErr } = await admin
              .from("push_subscriptions")
              .update({ failed_at: new Date().toISOString(), last_error: `gone (${status})` })
              .eq("id", s.id);
            if (markErr) {
              console.error(`sendWebPush: subscription ${s.id} is gone (${status}) but could not be marked —`, markErr.message);
            }
          } else {
            // Transient. Recorded but NOT marked dead — marking a subscription
            // dead on a timeout is how somebody silently stops being reachable.
            const { error: noteErr } = await admin
              .from("push_subscriptions")
              .update({ last_error: String((e as Error)?.message || e).slice(0, 300) })
              .eq("id", s.id);
            if (noteErr) {
              console.error(`sendWebPush: could not record the failure on subscription ${s.id} —`, noteErr.message);
            }
          }
        }
      }),
    );

    return { sent, failed };
  } catch (e) {
    console.error("sendWebPush failed", e);
    return { sent: 0, failed: 0 };
  }
}
