// THE `state` PARAMETER IS A CLAIM ABOUT WHO IS CONNECTING. SIGN IT.
//
// /api/auth/google set `state: user.id` and the callback read it straight back
// out of the query string and handed it to save_google_tokens as p_user_id, on
// the service role. Nothing tied that value to the person holding the browser.
//
// Two things that buys an attacker, both quiet:
//
//   1. They complete Google's consent themselves, then replay the callback with
//      somebody else's user id in `state`. The victim's stored refresh token is
//      replaced with the attacker's, and every calendar sync from then on reads
//      the ATTACKER'S calendar into the victim's appointments — inventing
//      sessions, and payments, on a roster the victim is billing from.
//   2. The reverse. They start the flow with the VICTIM'S id in `state` and
//      consent with their own Google account; same result, one step shorter.
//
// user ids are not secret — they are in the clients table, in message rows, and
// in the app's own network traffic — so "they would have to guess it" was never
// the protection it looked like.
//
// So state carries a signature the server can check and nobody else can forge:
//   <userId>.<issuedAtMs>.<nonce>.<hmac-sha256 of the first three>
//
// Also time-boxed. A signed state is still a bearer token; a ten-minute window
// is longer than any real consent screen and short enough that a leaked URL in
// a browser history or a referrer log is worthless by the time it is read.
//
// The key is OAUTH_STATE_SECRET when set. It falls back to the service-role key
// — server-only, always present wherever this route runs, never transmitted —
// so this is live the moment it ships rather than the moment somebody remembers
// to add a Vercel variable. Rotating either one simply invalidates states in
// flight, which is a failed Connect and a retry.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 10 * 60_000;

function key(): string | null {
  return process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function mac(payload: string, k: string): string {
  return createHmac("sha256", k).update(payload).digest("base64url");
}

/** A signed, time-boxed `state` for this user. Null when no key is configured. */
export function signState(userId: string, nowMs: number = Date.now()): string | null {
  const k = key();
  if (!k || !userId) return null;
  const payload = `${userId}.${nowMs}.${randomBytes(9).toString("base64url")}`;
  return `${payload}.${mac(payload, k)}`;
}

export type StateCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_configured" | "malformed" | "bad_signature" | "expired" };

/** Verify a `state` and recover the user id it was issued for. */
export function verifyState(raw: string | null | undefined, nowMs: number = Date.now()): StateCheck {
  const k = key();
  if (!k) return { ok: false, reason: "not_configured" };
  if (!raw) return { ok: false, reason: "malformed" };

  const parts = raw.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };
  const [userId, issued, nonce, sig] = parts;
  if (!userId || !issued || !nonce || !sig) return { ok: false, reason: "malformed" };

  const expected = mac(`${userId}.${issued}.${nonce}`, k);
  // Constant time, and length-checked first — timingSafeEqual throws on a
  // length mismatch, and a throw here is itself a signal.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };

  const at = Number(issued);
  // Signature first, age second: an unsigned value has no trustworthy timestamp
  // to judge, so there is nothing to say about its age.
  if (!Number.isFinite(at) || nowMs - at > MAX_AGE_MS || at - nowMs > 60_000) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, userId };
}
