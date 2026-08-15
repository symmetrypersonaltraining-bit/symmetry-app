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

export async function getUserFast(
  supabase: SupabaseClient,
  cookies: { name: string; value: string }[]
): Promise<GetUserFastResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (supabaseUrl) {
    const token = extractAccessToken(cookies);
    if (token) {
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
  }

  // Could not answer locally — no cookie, an unfamiliar shape, a token near
  // expiry that needs rotating, or keys we could not load. Ask Supabase.
  const res = await withAuthTimeout(supabase.auth.getUser());
  if (res.degraded) return { data: { user: null }, degraded: true, source: "none" };

  const u = res.value?.data?.user ?? null;
  return {
    data: { user: u ? { id: u.id, email: u.email ?? undefined, role: u.role ?? undefined } : null },
    degraded: false,
    source: "remote",
  };
}
