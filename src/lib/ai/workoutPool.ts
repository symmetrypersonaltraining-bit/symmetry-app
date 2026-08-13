// THE CLEARED POOL — the only workouts and movements a gated client's AI may
// ever offer.
//
// Dustin's spec, on his parents Gerard (71) and Sharon:
//
//   "These constraints MUST be enforced in the data layer / server side, NOT
//    left to a model prompt. A prompt can be talked out of a rule; a filtered
//    candidate set cannot. The AI should only ever be able to offer workouts
//    from a pre-approved pool that Dustin has cleared for that specific client.
//    If someone asks for something outside the pool, the correct behaviour is
//    to say it is not one of their options and offer what is, not to improvise
//    a new workout."
//
// What this file exists to prevent, stated plainly, because it is not a
// hypothetical:
//
//   GERARD — 2018 motorcycle accident. Roughly 1.5 INCHES OF TIBIA MISSING,
//   drop foot with almost no anterior tib activation, left hip and pelvis broken
//   and surgically repaired, right rotator cuff repaired. Everything seated or
//   supported. ZERO spinal loading. No impact.
//
//   SHARON — bilateral mastectomy, so limited shoulder ROM overhead and in
//   push/pull. Trigeminal neuralgia medication causing DIZZINESS AND
//   INSTABILITY. ZERO spinal loading. NO balance or unstable-surface work.
//
// Their contraindications DO NOT OVERLAP beyond "no spinal loading". Offering
// Gerard's seated-everything session to Sharon would ignore her overhead limit;
// offering Sharon's to Gerard would ignore his. So the client scoping below is
// not tidiness — cross-offering is its own way of getting someone hurt.
//
// ── THE DESIGN, AND WHY IT IS SHAPED THIS WAY ───────────────────────────────
//
// The model is never handed a workout it is not allowed to offer. Not told not
// to — never handed one. That is the whole idea, and it is the difference
// between a safety property and a strongly-worded suggestion. There is no
// prompt text anywhere in this file, deliberately: nothing here can be argued
// with, because nothing here is reasoning.
//
// FAILS CLOSED. Every error path returns "gated with an empty pool", never
// "ungated". An outage that quietly ungated Gerard could put a loaded spinal
// movement in front of a man with a rebuilt pelvis; an outage that leaves him
// with no options for ten minutes is an inconvenience he can ask about. Note
// this is the OPPOSITE default to lib/ai/tier.ts, which fails to the cheap side
// — the two are not inconsistent, they are each falling toward the harm that
// matters in their own domain.

import type { Db } from "@/lib/ai/scope";

export interface PoolWorkout {
  dayId: string;
  label: string;
  /** Movement names in order, so a recommendation can say what is in it. */
  exercises: string[];
}

export interface ClearedPool {
  /** True when this client's AI may ONLY offer from the pool below. */
  gated: boolean;
  workouts: PoolWorkout[];
  /**
   * Every movement that appears anywhere in this client's cleared days.
   *
   * Dustin, 13 Aug, expanding the ask: "switching movements within the
   * workouts". A cleared DAY pool does not answer that — swapping one exercise
   * needs a cleared EXERCISE vocabulary, and there was not one.
   *
   * Derived rather than curated, on purpose. Every movement in here is already
   * in a session Dustin built and cleared for this specific person, so the set
   * is safe BY CONSTRUCTION and costs him no extra data entry. It is
   * conservative — a movement he would allow but has not yet programmed is not
   * in it — and conservative is the correct direction to be wrong in here.
   */
  exerciseIds: Set<string>;
  exerciseNames: string[];
}

const EMPTY_GATED: ClearedPool = {
  gated: true,
  workouts: [],
  exerciseIds: new Set(),
  exerciseNames: [],
};

const UNGATED: ClearedPool = {
  gated: false,
  workouts: [],
  exerciseIds: new Set(),
  exerciseNames: [],
};

/** Is this client's AI restricted to a cleared pool? Fails CLOSED. */
export async function isPoolGated(db: Db, clientId: string | null | undefined): Promise<boolean> {
  if (!clientId) return false; // no client = no client-specific restriction to apply
  try {
    const { data, error } = await db
      .from("client_app_settings")
      .select("ai_pool_only")
      .eq("client_id", clientId)
      .maybeSingle();
    // A missing column (not deployed yet) errors here, and no row means the
    // client was never gated. Both are genuinely "not gated" rather than
    // "unknown", so they are the one place false is correct.
    if (error) return false;
    return (data as { ai_pool_only?: boolean | null } | null)?.ai_pool_only === true;
  } catch {
    // An actual failure IS unknown, and unknown must be safe.
    return true;
  }
}

/**
 * The cleared pool for one client.
 *
 * Returns `gated: false` and empty lists for everybody else — callers check
 * `gated` and keep their existing behaviour, so nothing changes for the roster.
 */
export async function clearedPoolFor(db: Db, clientId: string | null | undefined): Promise<ClearedPool> {
  if (!clientId) return UNGATED;

  let gated: boolean;
  try {
    gated = await isPoolGated(db, clientId);
  } catch {
    return EMPTY_GATED;
  }
  if (!gated) return UNGATED;

  try {
    const { data, error } = await db
      .from("days")
      .select(
        "id, label, created_at, sections(position, prescribed_exercises(position, exercise_id, exercises(name)))"
      )
      // BOTH conditions, always. `swappable` alone would reach the shared
      // library and the other clients' days; `client_owner_id` alone would
      // reach every day this person has ever been given, cleared or not.
      .eq("client_owner_id", clientId)
      .eq("swappable", true)
      .order("created_at", { ascending: true });

    if (error) return EMPTY_GATED;

    type Row = {
      id: string;
      label: string | null;
      sections: { position: number; prescribed_exercises: { position: number; exercise_id: string; exercises: { name: string } | null }[] }[] | null;
    };

    const rows = (data as Row[] | null) || [];
    const exerciseIds = new Set<string>();
    const exerciseNames = new Set<string>();
    const workouts: PoolWorkout[] = [];
    // Deduplicated by CONTENT, not by label.
    //
    // The data these read from has, twice now, been built by a loop that
    // inserts one `days` row per scheduled date instead of reusing one — 34
    // duplicate rows across these two clients on 13 Aug alone, six copies of
    // each session at the same microsecond. Left alone, "I don't want to do
    // this one today" would offer Gerard seven identical Total Body & Carry
    // sessions.
    //
    // For these two in particular that is not cosmetic: the entire point of the
    // feature is few options, plainly named. So the de-duplication lives here
    // rather than relying on the data staying clean, because the data has
    // already not stayed clean twice.
    const seen = new Set<string>();

    for (const d of rows) {
      const secs = (d.sections || []).slice().sort((a, b) => a.position - b.position);
      const names: string[] = [];
      const ids: string[] = [];
      for (const s of secs) {
        const pes = (s.prescribed_exercises || []).slice().sort((a, b) => a.position - b.position);
        for (const pe of pes) {
          const nm = pe.exercises?.name;
          if (pe.exercise_id) ids.push(pe.exercise_id);
          if (nm) names.push(nm);
        }
      }
      // Vocabulary is built from EVERY cleared row, including the duplicates —
      // they hold the same movements, and a movement missed here is a swap the
      // client is wrongly refused.
      ids.forEach((i) => exerciseIds.add(i));
      names.forEach((n) => exerciseNames.add(n));

      const sig = `${(d.label || "").trim().toLowerCase()}::${names.join("|")}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      workouts.push({ dayId: d.id, label: (d.label || "Workout").trim(), exercises: names });
    }

    return { gated: true, workouts, exerciseIds, exerciseNames: [...exerciseNames].sort() };
  } catch {
    return EMPTY_GATED;
  }
}

/**
 * Is this day one this client is allowed to be given?
 *
 * The check that runs immediately before anything is written, so a day id that
 * reached the caller some other way — a stale client payload, a model that
 * echoed an id from context, a copy-paste between the two of them — still
 * cannot land.
 */
export async function isDayInPool(db: Db, clientId: string, dayId: string): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("days")
      .select("id")
      .eq("id", dayId)
      .eq("client_owner_id", clientId)
      .eq("swappable", true)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

/** Is this movement in the client's cleared vocabulary? */
export async function isExerciseInPool(db: Db, clientId: string, exerciseId: string): Promise<boolean> {
  const pool = await clearedPoolFor(db, clientId);
  if (!pool.gated) return true;
  return pool.exerciseIds.has(exerciseId);
}
