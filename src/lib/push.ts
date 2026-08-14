import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationEvent } from "@/lib/notificationEvents";

// Firebase Cloud Messaging (HTTP v1) sender — dependency-free.
// INERT until the env var FCM_SERVICE_ACCOUNT_JSON is set (the full Firebase
// service-account JSON, one line). Without it, sendPushToUser() is a safe no-op,
// so nothing here can affect messaging until push is fully wired (see handoff).
// Never throws — a push failure must never block a message send.

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

let cachedToken: { token: string; exp: number } | null = null;

function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    if (!sa.client_email || !sa.private_key || !sa.project_id) return null;
    return sa as ServiceAccount;
  } catch {
    return null;
  }
}

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

// OAuth2 access token for FCM, minted from the service account (RS256 JWT bearer).
async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;
  try {
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = b64url(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }));
    const signingInput = `${header}.${claim}`;
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(signingInput)
      .sign(sa.private_key.replace(/\\n/g, "\n"), "base64url");
    const jwt = `${signingInput}.${signature}`;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j.access_token) return null;
    cachedToken = { token: j.access_token, exp: now + (Number(j.expires_in) || 3600) };
    return j.access_token;
  } catch {
    return null;
  }
}

export interface PushResult {
  ok: boolean;            // at least one token delivered
  reason?: string;        // why nothing was sent (no creds / no tokens / no oauth)
  attempted: number;
  delivered: number;
  results: { token: string; status: number; error?: string; pruned?: boolean }[];
}

// FCM v1 data payload MUST be string-valued.
function stringifyData(data?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(data || {})) {
    const v = (data as Record<string, unknown>)[k];
    if (v != null) out[k] = String(v);
  }
  return out;
}

// Detailed sender — returns per-token FCM status/error so failures are visible
// (used by /api/push-test). Prunes tokens FCM reports as unregistered/invalid so
// stale tokens self-heal. Never throws.
export async function sendPushDiagnostics(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<PushResult> {
  const out: PushResult = { ok: false, attempted: 0, delivered: 0, results: [] };
  try {
    const sa = getServiceAccount();
    if (!sa) { out.reason = "FCM_SERVICE_ACCOUNT_JSON not set (push disabled)"; return out; }
    if (!userId) { out.reason = "no userId"; return out; }
    const admin: any = createAdminClient();
    const { data: rows } = await admin.from("device_tokens").select("token").eq("user_id", userId);
    const tokens: string[] = ((rows as { token: string }[]) || []).map((r) => r.token).filter(Boolean);
    if (!tokens.length) { out.reason = "no device tokens registered for this user"; return out; }
    const access = await getAccessToken(sa);
    if (!access) { out.reason = "could not mint FCM OAuth token — check FCM_SERVICE_ACCOUNT_JSON"; return out; }
    const strData = stringifyData(data);
    for (const token of tokens) {
      out.attempted++;
      const masked = "…" + token.slice(-8);
      try {
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: strData,
              android: { priority: "high", notification: { sound: "default" } },
            },
          }),
        });
        const txt = await r.text().catch(() => "");
        let errCode = "";
        try { const j = JSON.parse(txt); errCode = j?.error?.status || j?.error?.details?.[0]?.errorCode || ""; } catch { /* noop */ }
        if (r.ok) {
          out.delivered++;
          out.results.push({ token: masked, status: r.status });
        } else {
          // Prune only for token-invalidity signals (never for a generic payload
          // error, so a bug can't nuke a good token).
          const dead = r.status === 404 || r.status === 410 ||
            /UNREGISTERED|registration-token-not-registered|NOT_FOUND/i.test(txt);
          if (dead) { try { await admin.from("device_tokens").delete().eq("token", token); } catch { /* noop */ } }
          out.results.push({ token: masked, status: r.status, error: (errCode || txt).slice(0, 200), pruned: dead });
        }
      } catch (e) {
        out.results.push({ token: masked, status: 0, error: String(e).slice(0, 160) });
      }
    }
    out.ok = out.delivered > 0;
    return out;
  } catch (e) {
    out.reason = "exception: " + String(e).slice(0, 150);
    return out;
  }
}

/**
 * Has this user switched this event off?
 *
 * A MISSING ROW MEANS ENABLED. Only deliberate opt-outs are stored, so the
 * table holds disagreements rather than a row per person per event.
 *
 * Fails OPEN on any error. A push that should have arrived and did not is worse
 * than one extra buzz: silence is indistinguishable from "nothing happened",
 * and this is how someone misses a message from their coach. The gate exists to
 * honour a choice, not to be a second point of failure.
 */
async function isMuted(userId: string, event: NotificationEvent): Promise<boolean> {
  if (event.forced) return false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("notification_preferences")
      .select("enabled")
      .eq("user_id", userId)
      .eq("event_key", event.key)
      .maybeSingle();
    if (error) return false;
    return (data as { enabled?: boolean } | null)?.enabled === false;
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget push. Never throws, never blocks.
 *
 * `event` is REQUIRED and is a NotificationEvent rather than a string, which is
 * the point: before this, sendPushToUser was called with no preference check at
 * all, and a new caller could bypass preferences simply by not knowing they
 * existed. Now the type system makes you name the event, and naming it routes
 * you through the gate. There is one door.
 */
export async function sendPushToUser(
  userId: string,
  event: NotificationEvent,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  try {
    if (await isMuted(userId, event)) return;
    await sendPushDiagnostics(userId, title, body, data);
  } catch { /* push must never break the caller */ }
}
