// Guard: a hand-built workout lands in a PREDICTABLE program.
//
// Written 2026-08-15 after the Claudine sweep. `ensurePhaseId` in
// /api/workout-manual used `.eq("active", true).limit(1).maybeSingle()` with no
// ORDER BY. 26 of 35 clients have two or more active assignments, so that call
// was choosing between real rows with no rule — the same client adding the same
// workout twice could land it in two different programs.
//
// MUTATION-TESTED, as the 14 Aug handoff requires. Each assertion below was
// confirmed to FAIL against a deliberately broken pickPhases before being
// trusted:
//   - removed the isPersonal term  → "real program wins" fails
//   - negated the recency term     → "most recent block wins" fails
//   - dropped the id tiebreak      → "stable under input order" fails
//   - removed the phases filter    → "an empty program is not a home" fails
//   - sorted phases descending     → "lowest position first" fails

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPhases, type ActiveAssignment } from "../../src/lib/pickProgramPhase";

const CLIENT = "c-1";

function real(id: string, assignedAt: string, phases: { id: string; position: number }[]): ActiveAssignment {
  return { id, assigned_at: assignedAt, programs: { id: `p-${id}`, personal_for_client_id: null, phases } };
}

function personal(id: string, assignedAt: string, phases: { id: string; position: number }[]): ActiveAssignment {
  return { id, assigned_at: assignedAt, programs: { id: `p-${id}`, personal_for_client_id: CLIENT, phases } };
}

test("pickPhases: a real program wins over the Personal Workouts sidecar", () => {
  // Claudine's exact shape: 8-Week Split Block (18 Jun) + Personal Workouts
  // (31 Jul). The sidecar is NEWER, so recency alone would pick the wrong one —
  // which is why 'is it personal' is ranked above recency and not below it.
  const got = pickPhases([
    personal("a-personal", "2026-07-31T00:00:00Z", [{ id: "ph-personal", position: 1 }]),
    real("a-block", "2026-06-18T00:00:00Z", [{ id: "ph-block", position: 1 }]),
  ]);
  assert.equal(got[0]?.id, "ph-block");
});

test("pickPhases: among real programs, the most recently assigned wins", () => {
  // Christine Latham carries three real programs. A manual workout belongs in
  // the block she is on now, not the oldest one still marked active.
  const got = pickPhases([
    real("a-old", "2026-06-20T00:00:00Z", [{ id: "ph-old", position: 1 }]),
    real("a-new", "2026-07-23T00:00:00Z", [{ id: "ph-new", position: 1 }]),
    real("a-mid", "2026-07-01T00:00:00Z", [{ id: "ph-mid", position: 1 }]),
  ]);
  assert.equal(got[0]?.id, "ph-new");
});

test("pickPhases: the answer does not depend on the order the rows arrive in", () => {
  // This is the whole point. PostgREST returns rows in whatever order the
  // planner likes, and that order is not stable across calls.
  const rows = [
    real("a-2", "2026-07-23T00:00:00Z", [{ id: "ph-2", position: 1 }]),
    real("a-1", "2026-07-23T00:00:00Z", [{ id: "ph-1", position: 1 }]),
    personal("a-3", "2026-08-01T00:00:00Z", [{ id: "ph-3", position: 1 }]),
  ];
  const forward = pickPhases(rows);
  const reversed = pickPhases(rows.slice().reverse());
  const shuffled = pickPhases([rows[2], rows[0], rows[1]]);
  assert.equal(forward[0]?.id, reversed[0]?.id);
  assert.equal(forward[0]?.id, shuffled[0]?.id);
  // Same assigned_at on two real programs: the id tiebreak decides, and "a-1"
  // sorts before "a-2". Any answer is acceptable to a client; only an UNSTABLE
  // one is a bug.
  assert.equal(forward[0]?.id, "ph-1");
});

test("pickPhases: a program with no phases is not a home for a workout", () => {
  // days.phase_id is NOT NULL. Returning an assignment whose program has no
  // phase would hand the caller nothing to insert against, and the caller would
  // then create a SECOND personal program rather than falling through cleanly.
  const got = pickPhases([
    real("a-empty", "2026-08-01T00:00:00Z", []),
    real("a-has", "2026-06-01T00:00:00Z", [{ id: "ph-has", position: 1 }]),
  ]);
  assert.equal(got[0]?.id, "ph-has");
});

test("pickPhases: no active assignment, or none with phases, returns nothing", () => {
  assert.deepEqual(pickPhases([]), []);
  assert.deepEqual(pickPhases([real("a", "2026-08-01T00:00:00Z", [])]), []);
});

test("pickPhases: phases come back lowest position first", () => {
  const got = pickPhases([
    real("a", "2026-08-01T00:00:00Z", [
      { id: "ph-3", position: 3 },
      { id: "ph-1", position: 1 },
      { id: "ph-2", position: 2 },
    ]),
  ]);
  assert.deepEqual(got.map((p) => p.id), ["ph-1", "ph-2", "ph-3"]);
});

test("pickPhases: a missing or unparseable assigned_at loses rather than wins", () => {
  // A null date used to be a coin flip. Treating it as 'least evidence this is
  // the current block' is the safe reading — the alternative is a row with no
  // date silently beating a real one.
  const got = pickPhases([
    real("a-nodate", null as unknown as string, [{ id: "ph-nodate", position: 1 }]),
    real("a-dated", "2026-06-01T00:00:00Z", [{ id: "ph-dated", position: 1 }]),
  ]);
  assert.equal(got[0]?.id, "ph-dated");

  const garbage = pickPhases([
    real("a-bad", "not a date", [{ id: "ph-bad", position: 1 }]),
    real("a-ok", "2026-06-01T00:00:00Z", [{ id: "ph-ok", position: 1 }]),
  ]);
  assert.equal(garbage[0]?.id, "ph-ok");
});

test("pickPhases: a null phase position sorts last instead of crashing", () => {
  const got = pickPhases([
    real("a", "2026-08-01T00:00:00Z", [
      { id: "ph-null", position: null as unknown as number },
      { id: "ph-1", position: 1 },
    ]),
  ]);
  assert.equal(got[0]?.id, "ph-1");
});
