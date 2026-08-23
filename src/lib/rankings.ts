/**
 * Who may be RANKED. 2026-08-03.
 *
 * Dustin: "Let's go ahead and take me out of the actual rankings in the
 * challenge to make sure my clients are the spotlight."
 *
 * The database enforces this for the challenge board (clients.exclude_from_
 * rankings, read by v_challenge_roster). But two boards are built in TypeScript
 * instead of SQL — /api/leaderboard and the standings half of /api/challenge —
 * and they rank from client_app_settings.leaderboard_opt_in, which the trainer
 * can switch on for himself like anyone else. Without this they would put him
 * back at the top of a board the DB just took him off.
 *
 * Not folded into demoClient.isExcludedFromRoster on purpose. That one means
 * "isn't a real person, must not touch any roster-wide number". This one means
 * "is a real person whose numbers are real, but must not be ranked against the
 * clients". Merging them would quietly drop the trainer out of totals and
 * attention feeds where he belongs.
 */

import { isExcludedFromRoster } from "@/lib/demoClient";
import { isTrainerEmail } from "@/lib/trainer";

/**
 * Every trainer on the instance, from the `trainers` TABLE.
 *
 * `isTrainerEmail()` alone is not enough here. It answers from the build-time
 * list plus whatever this Node process happens to have learned since it
 * started — so a trainer added from inside the app (Brooke, 23 Aug) is a
 * trainer on the lambda that resolved her and a client on every other one. On a
 * ranked, named board that means she is sometimes listed among the people she
 * coaches, and which it is depends on which instance served the request.
 *
 * Callers that have a database handle should pass this in. It is optional so
 * that the pure predicate below stays pure and testable.
 */
export async function trainerEmailSet(
  db: { from: (t: string) => { select: (c: string) => { eq: (c: string, v: unknown) => Promise<{ data: unknown }> } } },
): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const { data } = await db.from("trainers").select("email").eq("active", true);
    for (const r of ((data as { email?: string | null }[]) || [])) {
      const e = (r.email || "").trim().toLowerCase();
      if (e) out.add(e);
    }
  } catch { /* fall back to the build-time list below */ }
  return out;
}

/** True when this person must never appear in a ranked, named standing. */
export function isExcludedFromRankings(
  client:
    | { id?: string; email?: string | null; name?: string | null; exclude_from_rankings?: boolean | null }
    | null
    | undefined,
  trainers?: Set<string>,
): boolean {
  if (!client) return false;
  if (client.exclude_from_rankings === true) return true;
  const email = (client.email || "").trim().toLowerCase();
  if (email && trainers?.has(email)) return true;
  if (isTrainerEmail(client.email)) return true;
  return isExcludedFromRoster(client);
}

/** Ids to drop from a ranked board, given rows carrying email and/or name. */
export function unrankedClientIds(
  rows: { id: string; email?: string | null; name?: string | null; exclude_from_rankings?: boolean | null }[] | null | undefined,
  trainers?: Set<string>,
): Set<string> {
  const out = new Set<string>();
  for (const r of rows || []) if (isExcludedFromRankings(r, trainers)) out.add(r.id);
  return out;
}
