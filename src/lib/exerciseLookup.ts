// Finding an existing exercise before creating a new one.
//
// WHY THIS EXISTS
// Four places resolve an exercise name to an id — workout-ai, workout-assist,
// workoutAdjust and workout-manual — and every one of them does the same thing
// when the name does not match: it INSERTS a new exercise. The match was an
// exact (case-insensitive) compare against `name` alone, so any name the
// library already knows by a different wording silently minted a duplicate.
//
// That is not hypothetical. 67 duplicate exercises were merged in July, three
// copies of "Knee Stability & Strength" exist, and on 10 Aug Dustin asked to
// add a "seated leg curl machine" that had been in the library since 14 July
// under the name "Seated Hamstring Curl Machine". Asking the AI for it by the
// name he actually uses would have created a second row for one machine.
//
// The `aliases` column existed for exactly this and was read by NOTHING —
// 1 populated row out of 828, zero readers in the codebase.
//
// WHAT THIS DOES NOT DO
// It does not fuzzy-match. "Seated Leg Curl" must not resolve to "Single Leg
// Curl" because someone was feeling clever about edit distance. Only three
// things count as the same exercise: an exact name, an exact alias, or the
// same string once case and punctuation are normalised away. Anything looser
// risks logging a client's sets against the wrong movement, which is worse
// than a duplicate.

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Case, punctuation and spacing removed — nothing else.
 *
 * Deliberately does NOT drop words like "machine": "Seated Leg Curl" and
 * "Seated Leg Curl Machine" are usually the same thing, but "Leg Press" and
 * "Leg Press Machine" being merged by a rule nobody remembers is how a library
 * quietly becomes wrong. Different wording gets an alias, explicitly.
 */
export function normalizeExerciseName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[()[\]{}\-–—_/\\.,:;'"!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(a: string, b: string): boolean {
  const na = normalizeExerciseName(a);
  return na.length > 0 && na === normalizeExerciseName(b);
}

/** Does this row answer to `name`, by its own name or any of its aliases? */
export function rowMatchesName(
  row: { name?: string | null; aliases?: string[] | null },
  name: string,
): boolean {
  if (row.name && namesMatch(row.name, name)) return true;
  for (const a of row.aliases || []) {
    if (a && namesMatch(a, name)) return true;
  }
  return false;
}

/**
 * Prefer the shared library row over a personal copy, so two clients doing the
 * same movement land on the same exercise and their history stays comparable.
 * (workout-manual already did this; the other three did not.)
 */
export function preferShared<T extends { id: string; client_owner_id?: string | null }>(
  rows: T[],
  clientId?: string | null,
): string | null {
  const shared = rows.find((r) => !r.client_owner_id);
  if (shared) return shared.id;
  if (clientId) {
    const mine = rows.find((r) => r.client_owner_id === clientId);
    if (mine) return mine.id;
  }
  return rows[0] ? rows[0].id : null;
}

/**
 * Find an existing exercise id for `name`, or null.
 *
 * Exact name first — identical to the old behaviour, so nothing that resolved
 * before resolves differently now. Only when that misses does it consider
 * aliases, which is purely additive: it can prevent a duplicate being created,
 * it can never redirect a name that already matched.
 */
export async function findExerciseIdByName(
  db: any,
  name: string,
  clientId?: string | null,
): Promise<string | null> {
  const clean = (name || "").trim();
  if (!clean) return null;

  const { data: exact } = await db
    .from("exercises")
    .select("id, client_owner_id")
    .ilike("name", clean)
    .limit(5);
  const rows = (exact as { id: string; client_owner_id: string | null }[] | null) || [];
  if (rows.length) return preferShared(rows, clientId);

  // Alias pass. Compared in JS rather than SQL because Postgres array
  // containment is case-sensitive, and the aliased set is tiny — the column
  // has only just started being used. Bounded so it stays cheap if that changes.
  const { data: aliased } = await db
    .from("exercises")
    .select("id, name, aliases, client_owner_id")
    .not("aliases", "is", null)
    .limit(1000);

  const hits = ((aliased as
    | { id: string; name: string | null; aliases: string[] | null; client_owner_id: string | null }[]
    | null) || []).filter((r) => rowMatchesName(r, clean));

  return hits.length ? preferShared(hits, clientId) : null;
}
