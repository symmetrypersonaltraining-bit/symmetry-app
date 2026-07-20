import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

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

// Send a push to every device token registered for a user. Safe/no-op without creds.
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  try {
    const sa = getServiceAccount();
    if (!sa || !userId) return;
    const admin: any = createAdminClient();
    const { data: rows } = await admin.from("device_tokens").select("token").eq("user_id", userId);
    const tokens: string[] = ((rows as { token: string }[]) || []).map((r) => r.token).filter(Boolean);
    if (!tokens.length) return;
    const access = await getAccessToken(sa);
    if (!access) return;
    for (const token of tokens) {
      try {
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: data || {},
              android: { priority: "high" },
            },
          }),
        });
        // Prune dead tokens so they don't accumulate.
        if (r.status === 404 || r.status === 410) {
          try { await admin.from("device_tokens").delete().eq("token", token); } catch { /* noop */ }
        }
      } catch { /* one token failing must not stop the rest */ }
    }
  } catch { /* push must never break the caller */ }
}
