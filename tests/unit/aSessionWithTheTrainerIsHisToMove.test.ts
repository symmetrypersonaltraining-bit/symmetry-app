import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Dustin, 5 Sep 2026, asked whether clients should keep control of their own
// schedule now that the AI can move things:
//
//   "I was referring to their scheduled sessions w me. Full control on their
//    schedule stays as is but I dictate scheduled sessions w me."
//
// Two rules in one sentence, and they pull in opposite directions. A guard that
// is too broad undoes the 15 Aug ruling — "we can all move workouts from
// anywhere to anywhere period" — which was itself paid for by Bobbie Page
// giving up on the app: "i got frustrated because it wasnt working and stopped
// trying." A guard that is too narrow lets a client move a booked appointment.
//
// A supervised workout is the app's half of an appointment; the other half is a
// Google Calendar event, which is the source of truth for when two people meet
// in a gym. Moving only this half leaves them disagreeing. 259 future sessions
// carry the flag.

const ROOT = process.cwd();
const src = fs.readFileSync(path.join(ROOT, "src/lib/ai/clientActions.ts"), "utf8");

test("moving a workout checks whether it is a session with the trainer", () => {
  assert.ok(
    /select\("id, client_id, status, scheduled_date, deleted_at, day_id, supervised, appointment_id"\)/.test(src),
    "move_my_workout no longer reads supervised/appointment_id, so it cannot tell a client's own workout from a booking with Dustin",
  );
  assert.ok(
    /if \(row\.supervised \|\| row\.appointment_id\) \{/.test(src),
    "the guard on sessions with the trainer is gone",
  );
});

test("the refusal is narrow, and says so", () => {
  // The whole risk of this guard is the model generalising it. One refusal it
  // has never seen before is all it takes to bring back "ask your coach" as a
  // reflex, which is the behaviour that lost Bobbie.
  const guard = src.slice(src.indexOf("if (row.supervised || row.appointment_id)"), src.indexOf("if (row.supervised || row.appointment_id)") + 900);
  assert.ok(
    /everything else on\s*` \+\s*`their schedule they can still move freely themselves/.test(guard),
    "the refusal no longer tells the client what they CAN still do — a bare refusal teaches the model to refuse",
  );
  assert.ok(
    /do NOT send anything yourself/.test(guard),
    "the refusal no longer stops the AI escalating on its own — Dustin's rule is that only what a client deliberately sends reaches him",
  );
});

test("their own workouts are still unrestricted", () => {
  // The 15 Aug ruling, still standing.
  assert.ok(
    /ANY workout of theirs can go to ANY date/.test(src),
    "the tool no longer tells the model their own workouts move anywhere — the old refusals will creep back",
  );
  // Scoped to the handler BODY, not the file — the comment above it describes
  // the two guards that were removed, and matching that text would fail on the
  // history rather than on the code.
  const start = src.indexOf('if (name === "move_my_workout")');
  const body = src.slice(start, src.indexOf('if (name === "swap_my_workout")'));
  assert.ok(start > 0 && body.length > 100, "could not find the move_my_workout handler");
  const refusals = body.split("\n").filter((l) => /^\s*(if|return)/.test(l) && /return "/.test(l));
  for (const line of refusals) {
    assert.ok(
      /isn't on this client's schedule|need the workout id|Couldn't move it/.test(line),
      `move_my_workout has grown a new refusal, which is what 15 Aug removed: ${line.trim()}`,
    );
  }
});
