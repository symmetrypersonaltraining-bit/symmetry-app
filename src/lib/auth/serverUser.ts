// `getUserFast` for server components, which read cookies from next/headers
// rather than from a request object.
//
// Kept separate from getUserFast.ts on purpose: importing next/headers pulls in
// a request context that the middleware (edge) and any future test harness do
// not have. The core stays portable; this file is the one adapter that is not.

import { cookies } from "next/headers";
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
