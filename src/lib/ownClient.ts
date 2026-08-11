// "Which clients row belongs to the person signed in right now?"
//
// Five components answered this with:
//
//     .ilike("name", "%Dustin%")
//
// ...but only on the trainer branch. For a client they did the correct thing —
// look up by auth_user_id — and then for the trainer they went looking for a
// human being by name.
//
// It works on exactly one database. On any other instance there is no client
// called Dustin, the query returns nothing, and the component renders as though
// the person simply has no data: no coach avatar, no week summary, no milestone
// badges, no macros card, no Sunday weigh-in reminder. Nothing throws. Nothing
// logs. It just quietly is not there, which is the hardest kind of broken to be
// handed a bug report about.
//
// This is the same mistake as identifying the trainer by a hardcoded email
// (fixed in b92b3e3) — identity by literal string — except one layer down, in
// the data, where it fails silently instead of loudly.
//
// Checked before changing it: Dustin's clients row already carries
// auth_user_id, and its email already matches his login. The name match was
// never load-bearing; the branch directly beneath it would have worked all
// along.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthedUser {
  id: string;
  email?: string | null;
}

/**
 * The signed-in person's own `clients` row, or null.
 *
 * Two lookups, in this order, and NEVER by name:
 *   1. auth_user_id — the real link, set when the account was created.
 *   2. email — for a row created before the account was linked.
 *
 * `columns` is passed through so each caller keeps selecting only what it
 * needs; this changes how the row is FOUND, not what comes back.
 */
export async function fetchOwnClientRow<T = Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  user: AuthedUser | null | undefined,
  columns: string,
): Promise<T | null> {
  if (!user?.id) return null;

  const byAuth = await sb.from("clients").select(columns).eq("auth_user_id", user.id).limit(1);
  const authRow = (byAuth.data as unknown as T[] | null)?.[0];
  if (authRow) return authRow;

  const email = user.email?.trim();
  if (!email) return null;
  // ilike, not eq: emails are stored as typed and case must not decide this.
  const byEmail = await sb.from("clients").select(columns).ilike("email", email).limit(1);
  return (byEmail.data as unknown as T[] | null)?.[0] ?? null;
}
