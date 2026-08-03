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

import { TRAINER_EMAIL } from "@/lib/ai/scope";
import { isExcludedFromRoster } from "@/lib/demoClient";

/** True when this person must never appear in a ranked, named standing. */
export function isExcludedFromRankings(
  client:
    | { id?: string; email?: string | null; name?: string | null; exclude_from_rankings?: boolean | null }
    | null
    | undefined,
): boolean {
  if (!client) return false;
  if (client.exclude_from_rankings === true) return true;
  if ((client.email || "").trim().toLowerCase() === TRAINER_EMAIL) return true;
  return isExcludedFromRoster(client);
}

/** Ids to drop from a ranked board, given rows carrying email and/or name. */
export function unrankedClientIds(
  rows: { id: string; email?: string | null; name?: string | null; exclude_from_rankings?: boolean | null }[] | null | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const r of rows || []) if (isExcludedFromRankings(r)) out.add(r.id);
  return out;
}
