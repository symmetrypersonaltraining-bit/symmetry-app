/**
 * Demo-account exclusion. 2026-07-25.
 *
 * A populated demo account is useful for showing the app off, and poisonous to
 * every roster-wide number if it's allowed to count. 62 fake sessions would
 * inflate the group challenge total that real clients see, push the demo to the
 * top of the consistency board, and clutter the trainer's attention feed and
 * week digest with someone who isn't real.
 *
 * So the demo is excluded from every SHARED calculation, while its own personal
 * screens (progress, personal bests, consistency, nutrition, workouts) stay
 * fully populated — those read by client id and never aggregate across people.
 *
 * Identified by email rather than a hardcoded uuid, so restoring the demo later
 * (or pointing it at a different address) needs no code change.
 *
 * Removing the demo: delete the account and this file's filters become no-ops.
 */

export const DEMO_EMAILS = ["demo@symmetrytraining.app"];

/** Name markers that should also never appear in roster-wide numbers. */
const EXCLUDED_NAME_PARTS = ["test client", "demo account"];

export function isExcludedFromRoster(
  client: { email?: string | null; name?: string | null } | null | undefined,
): boolean {
  if (!client) return false;
  const email = (client.email || "").trim().toLowerCase();
  if (email && DEMO_EMAILS.includes(email)) return true;
  const name = (client.name || "").trim().toLowerCase();
  return EXCLUDED_NAME_PARTS.some((p) => name.includes(p));
}

/** Ids to drop, given rows that carry an email and/or name. */
export function excludedClientIds(
  rows: { id: string; email?: string | null; name?: string | null }[] | null | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const r of rows || []) if (isExcludedFromRoster(r)) out.add(r.id);
  return out;
}
