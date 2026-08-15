// Which program does a hand-built workout belong to when a client has several?
//
// More than one ACTIVE program_assignment is the normal state here, not a
// fault. Measured on live data 2026-08-15: 26 of 35 clients have two or more.
// Two separate reasons, both deliberate:
//
//   - every client who has ever used a manual/self-scheduled workout carries a
//     "Personal Workouts" program alongside their real one (22 were created in
//     one pass on 2026-07-31)
//   - five clients run several REAL programs at once, because a corrective
//     track + a training layer + a cardio block is three programs by design
//     (Sara Prince has four, Christine Latham and Sharon Rambo three each)
//
// So the question is never "which one active assignment is it" — it is "which
// of these is the right home for a workout the client just built by hand".
//
// The old code asked Postgres for `.limit(1)` with no ORDER BY, which is not a
// question with an answer: the planner returns whichever row is convenient and
// is free to return a different one next time. The same client adding the same
// workout twice could put one copy in their prescribed block and the other in
// their personal sidecar, and a hand-built "Solo — …" session appearing inside
// a prescribed programme is precisely what Claudine reported on 14 Aug.
//
// The order below is a preference, not a guess, and every step is total — two
// runs over the same rows cannot disagree.

export interface PhaseRow {
  id: string;
  position: number | null;
}

export interface ActiveAssignment {
  id?: string | null;
  assigned_at?: string | null;
  programs?: {
    id?: string | null;
    /** Non-null marks the auto-created "Personal Workouts" sidecar. */
    personal_for_client_id?: string | null;
    phases?: PhaseRow[] | null;
  } | null;
}

/** Sort key: lower is more preferred. */
function rank(a: ActiveAssignment): [number, number, string] {
  const isPersonal = a.programs?.personal_for_client_id ? 1 : 0;
  // Negated so that a LATER assignment sorts first under ascending compare.
  // An unparseable or absent date sorts last rather than crashing or winning:
  // a row with no date is the least evidence that it is the current block.
  const t = a.assigned_at ? Date.parse(a.assigned_at) : NaN;
  const recency = Number.isFinite(t) ? -t : Number.POSITIVE_INFINITY;
  return [isPersonal, recency, a.id || ""];
}

/**
 * The phases of the assignment a manual workout should hang off, ordered by
 * position so the caller can take the first.
 *
 * Returns [] when the client has no active assignment, or when every active
 * assignment's program has no phases — both of which mean "fall through to the
 * personal-program path", which is the caller's next step.
 */
export function pickPhases(assignments: ActiveAssignment[]): PhaseRow[] {
  const withPhases = (assignments || []).filter((a) => (a?.programs?.phases || []).length > 0);
  if (!withPhases.length) return [];

  const best = withPhases.slice().sort((x, y) => {
    const [xp, xr, xi] = rank(x);
    const [yp, yr, yi] = rank(y);
    if (xp !== yp) return xp - yp;
    if (xr !== yr) return xr < yr ? -1 : 1;
    return xi < yi ? -1 : xi > yi ? 1 : 0;
  })[0];

  return (best.programs?.phases || [])
    .slice()
    .sort((a, b) => (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY));
}
