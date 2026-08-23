// WHOSE CLIENTS ARE THESE?
//
// The database has always known. `trainer_can_see_client()` is the RLS rule
// behind `clients`, and it says exactly the right thing: the owner sees
// everyone, any other trainer sees the rows whose `trainer_id` is theirs.
//
// The API layer never asked. A dozen trainer-gated routes reach for
// `createAdminClient()` — the service role, which bypasses RLS by design
// because it needs to read across tables a client may not touch — and then
// select `clients` with no filter at all. `viewerIsTrainer()` answers "is this
// person a trainer", never "is this person THIS client's trainer", and there
// was no helper in the codebase that asked the second question. So the moment a
// second trainer existed, "needs attention", the live-session board, plateau
// history and the draft queues all handed her the owner's entire roster.
//
// The other half of the same mistake: those routes then removed the trainer's
// own client row from their own feed by testing the NAME against /dustin/i.
// That is identity by literal string, the exact thing `src/lib/ownClient.ts`
// was written to delete — it silently fails for every other trainer (their own
// row stays in their workload) and silently misfires for any real client who
// happens to be called Dustin.
//
// One helper, asked once per request, answers both.

import type { SupabaseClient } from "@supabase/supabase-js";
import { trainerForAuthUser, type AnyDb } from "@/lib/trainerResolve";

export interface RosterScope {
  /** The viewer's `trainers.id`, or null if they are not a trainer. */
  trainerId: string | null;
  /** Owners see every trainer's clients. Nobody else does. */
  isOwner: boolean;
  /** The viewer's OWN `clients` row, so a feed can leave them out of their own workload. */
  ownClientId: string | null;
}

export const NO_ROSTER: RosterScope = { trainerId: null, isOwner: false, ownClientId: null };

interface MinimalDb {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown }> };
    };
  };
}

/**
 * Resolve the viewing trainer, their ownership, and their own client row.
 *
 * `db` should be the SERVICE-ROLE client when the caller is going to read with
 * the service role — resolving the scope through a client that can see less
 * than the query will is how a scope check comes back empty and quietly widens
 * nothing while the query stays wide.
 */
export async function rosterScopeFor(
  db: AnyDb,
  user: { id: string; email?: string | null } | null | undefined,
): Promise<RosterScope> {
  if (!user) return NO_ROSTER;
  const trainer = await trainerForAuthUser(db, user.id, user.email ?? null);
  let ownClientId: string | null = null;
  try {
    const { data } = await (db as unknown as MinimalDb)
      .from("clients")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    ownClientId = (data as { id?: string } | null)?.id ?? null;
  } catch {
    ownClientId = null;
  }
  return {
    trainerId: trainer?.id ?? null,
    isOwner: trainer?.isOwner ?? false,
    ownClientId,
  };
}

/**
 * Is this client on the viewer's roster at all?
 *
 * A row with no `trainer_id` is unassigned; only the owner gets those, which
 * matches `trainer_can_see_client(null)`.
 */
export function onRoster(
  row: { trainer_id?: string | null } | null | undefined,
  scope: RosterScope,
): boolean {
  if (!row) return false;
  if (scope.isOwner) return true;
  if (!scope.trainerId) return false;
  return row.trainer_id === scope.trainerId;
}

/**
 * Is this the viewer's own client row?
 *
 * Replaces `/dustin/i.test(c.name)`. A coach's own training is not part of
 * their coaching workload, whoever the coach is.
 */
export function isViewersOwnClient(
  row: { id?: string | null } | null | undefined,
  scope: RosterScope,
): boolean {
  return !!row?.id && !!scope.ownClientId && row.id === scope.ownClientId;
}

/** The rows of a service-role `clients` read that this viewer may actually have. */
export function scopeRoster<T extends { id: string; trainer_id?: string | null }>(
  rows: T[] | null | undefined,
  scope: RosterScope,
  opts: { includeOwn?: boolean } = {},
): T[] {
  const out: T[] = [];
  for (const r of rows || []) {
    if (!onRoster(r, scope)) continue;
    if (!opts.includeOwn && isViewersOwnClient(r, scope)) continue;
    out.push(r);
  }
  return out;
}

/** Narrow a supabase query to the viewer's roster. Owners are left unfiltered. */
export function restrictToRoster<Q extends { eq: (col: string, v: unknown) => Q }>(
  query: Q,
  scope: RosterScope,
): Q {
  if (scope.isOwner) return query;
  // A non-owner with no trainer id matches nothing rather than everything —
  // failing closed is the only safe direction for a filter like this.
  return query.eq("trainer_id", scope.trainerId ?? "00000000-0000-0000-0000-000000000000");
}

export type { SupabaseClient };
