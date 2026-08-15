// `getUser()`, but without the network call when we can manage it.
//
// Drop-in for `await supabase.auth.getUser()`. Same return shape, so a call
// site changes by one word and nothing downstream has to know.
//
// The order is: verify the session token locally (no network, sub-millisecond),
// and only if that cannot answer, ask Supabase the way we always did — capped,
// so a sick auth service degrades the app instead of killing it.
//
// See src/lib/auth/verifyJwt.ts for the incident this comes from and for the
// trade-off Dustin accepted. The property that makes it safe: local
// verification can REFUSE but never wrongly admit, and a refusal costs one
// network call, which is what every request paid before this existed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { withAuthTimeout } from "@/lib/authTimeout";
import { extractAccessToken, supabaseAuthUrls, verifyAccessToken } from "@/lib/auth/verifyJwt";

/**
 * The shape callers already destructure: `const { data: { user } } = ...`.
 *
 * `user` is deliberately narrow. The fast path only ever knows what the token
 * carries, so typing it as Supabase's full `User` would be a lie that compiles
 * — a call site reading `user.created_at` would find undefined at runtime and
 * only on the fast path, which is the worst kind of bug to reproduce.
 */
export interface FastUser {
  id: string;
  email?: string;
  role?: string;
}

export interface GetUserFastResult {
  data: { user: FastUser | null };
  /** True when auth could not be reached at all. Distinct from "no user". */
  degraded: boolean;
  /** Which path answered. For the health endpoint and for debugging. */
  source: "local" | "remote" | "none";
}

/**
 * The cap used when a getUser() call MIGHT be performing a token refresh.
 *
 * ── WHY THIS IS NOT 4 SECONDS, WHICH IS THE BUG THAT MADE IT NECESSARY ──────
 *
 * `withAuthTimeout` races the call against a timer and returns when the timer
 * wins. It does not — cannot — cancel the underlying request. The abandoned
 * call keeps going.
 *
 * That is harmless when the call is only ASKING who somebody is. It is
 * destructive when the call is REFRESHING, because Supabase rotates the refresh
 * token: the old one is spent the instant the new pair is issued, and the new
 * pair is delivered through the setAll callback onto a response we have already
 * returned. Old token spent, new token lost, session dead — the exact fault
 * `redirectKeepingSession` in the middleware was written to fix, reintroduced
 * from underneath by a timeout added six hours ago to fix something else.
 *
 * It was not theoretical for even one night: during the 15 Aug outage auth was
 * taking 10–65s against a 4s cap, so EVERY refresh attempted in those hours was
 * abandoned mid-flight. Dustin's own session died of it at 06:35Z — token
 * expired, refresh burned, next navigation went to /login.
 *
 * The fix is to cap only where there is nothing to lose, and where we must
 * wait, to wait LONGER THAN SUPABASE ITSELF DOES. Their auth deadline is ~10s
 * (observed: `context deadline exceeded` at 10.0–10.3s, repeatedly). At 15s
 * either the refresh has completed and its cookies are on the response, or
 * Supabase has already given up and there is no rotation in flight to lose.
 * Nothing is ever abandoned mid-rotation.
 *
 * Still bounded, because an unbounded await is what produced the 504s: 15s sits
 * under Vercel's 25s middleware limit with room for the rest of the request.
 */
export const REFRESH_TIMEOUT_MS = 15_000;

export async function getUserFast(
  supabase: SupabaseClient,
  cookies: { name: string; value: string }[]
): Promise<GetUserFastResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Whether a session cookie exists at all decides how long we may wait below.
  // A request carrying no token cannot be refreshing anything, so cutting it
  // short costs nothing. A request carrying one might be.
  const token = supabaseUrl ? extractAccessToken(cookies) : null;

  if (supabaseUrl && token) {
    const { jwksUrl, issuer } = supabaseAuthUrls(supabaseUrl);
    const claims = await verifyAccessToken(token, { jwksUrl, issuer });
    if (claims) {
      return {
        data: { user: { id: claims.sub, email: claims.email, role: claims.role } },
        degraded: false,
        source: "local",
      };
    }
  }

  // Could not answer locally — no cookie, an unfamiliar shape, a token at or
  // near expiry that needs rotating, or keys we could not load. Ask Supabase.
  //
  // The cap depends on what is at stake. See REFRESH_TIMEOUT_MS above: a call
  // that may be rotating a refresh token must never be abandoned part-way,
  // because abandoning it destroys the session it was trying to renew.
  const res = await withAuthTimeout(
    supabase.auth.getUser(),
    token ? REFRESH_TIMEOUT_MS : undefined
  );
  if (res.degraded) return { data: { user: null }, degraded: true, source: "none" };

  const u = res.value?.data?.user ?? null;
  return {
    data: { user: u ? { id: u.id, email: u.email ?? undefined, role: u.role ?? undefined } : null },
    degraded: false,
    source: "remote",
  };
}
