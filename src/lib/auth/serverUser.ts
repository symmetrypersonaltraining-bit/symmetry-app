// `getUserFast` for server components, which read cookies from next/headers
// rather than from a request object.
//
// Kept separate from getUserFast.ts on purpose: importing next/headers pulls in
// a request context that the middleware (edge) and any future test harness do
// not have. The core stays portable; this file is the one adapter that is not.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserFast, type GetUserFastResult } from "@/lib/auth/getUserFast";

/**
 * Drop-in for `await supabase.auth.getUser()` inside a server component.
 *
 * Returns the same `{ data: { user } }` shape, plus `degraded` and `source` for
 * callers that want to tell "signed out" from "could not reach auth" — which is
 * a distinction worth making anywhere the answer is a redirect.
 */
export async function getServerUser(supabase: SupabaseClient): Promise<GetUserFastResult> {
  const store = await cookies();
  return getUserFast(supabase, store.getAll());
}

/**
 * THE USER, OR THE RIGHT KIND OF LEAVING.
 *
 * Dustin, 31 Aug: "jenns all the sudden started sometimes it prompts her to log
 * in again sometimes its already logged in."
 *
 * `getUserFast` has always returned `degraded` alongside the user, and the
 * whole reason it exists is written out in authTimeout.ts:
 *
 *   "a timeout is not a signed-out user, and treating it as one signs people
 *    out at random"
 *
 * The middleware honours that. Every server component that actually performs
 * the redirect did not: all 32 of them destructured `{ data: { user } }`,
 * dropped `degraded` on the floor, and ran `if (!user) redirect("/login")`.
 *
 * So the distinction was computed carefully, documented at length, and then
 * discarded by every caller that could act on it. One slow auth call or one
 * dropped request on gym wi-fi and `user` is null with `degraded` true — and
 * Jenn is looking at a login screen. She taps in, or simply navigates again,
 * the next call succeeds, and she is "already logged in". Intermittent,
 * unreproducible, and entirely explained.
 *
 * Signed out sends you to /login. UNREACHABLE does not: it goes to
 * /reconnecting, which keeps the session cookies exactly where they are and
 * offers a retry. Nothing is signed out by a bad minute of wi-fi.
 *
 * Not a weakening of anything. The middleware was never the security boundary
 * and neither is this: every table is behind RLS keyed to the JWT, so a request
 * that cannot prove who it is cannot read anything either way. The only
 * question here is which screen somebody lands on, and "log in again" is the
 * wrong answer to "we could not reach the server".
 */
export async function requireUser(supabase: SupabaseClient) {
  const { data: { user }, degraded } = await getServerUser(supabase);
  // Order matters. Degraded is checked FIRST because it also arrives with a
  // null user, and reading the null half first is precisely the bug.
  if (degraded) redirect("/reconnecting");
  if (!user) redirect("/login");
  return user;
}
