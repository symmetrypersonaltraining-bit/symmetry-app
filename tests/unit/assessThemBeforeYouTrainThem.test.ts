import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Dustin, 5 Sep 2026: "lets get assessment done fir all. next time I open a
// session fir them, full screen takeover to do assessment before their
// session."
//
// Half the roster had no assessment, which cost nothing until the coach started
// reading them — a coach telling fourteen people it cannot see anything about
// their body looks broken to half the clients who try it.
//
// Two things this must never become:
//
//   A BLOCK. He was offered a hard block and chose "Not now, ask again next
//   session." He is standing in a gym with ninety seconds before a client walks
//   in, and an app that will not let him start is one he stops opening.
//
//   A CHANGE TO THE LOGGER. Both ways in end at the same route, so the gate
//   lives on the route and the logger — off limits without per-item permission
//   — is not touched at all.

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const gate = read("src/components/AssessmentGate.tsx");
const route = read("src/app/(app)/workout/[dayId]/page.tsx");
const form = read("src/app/(app)/assessment/page.tsx");

test("the gate is on the route, and the logger is untouched", () => {
  assert.ok(/AssessmentGate/.test(route), "the gate is no longer rendered by the workout route");
  const logger = read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx");
  assert.ok(
    !/AssessmentGate/.test(logger),
    "the gate has moved into the logger, which is off limits without per-item permission",
  );
});

test("it can always be got past, and comes back next session", () => {
  assert.ok(/Not now/.test(gate), "the way past the gate is gone — he chose (b), not a hard block");
  assert.ok(
    /sym_assess_gate:\$\{clientId\}:\$\{sessionDate\}/.test(gate),
    "the dismissal is no longer keyed to the client AND the session date: keyed more broadly it stops asking, keyed more narrowly it nags twice in one session",
  );
  assert.ok(
    /It will ask again next session/.test(gate),
    "the gate no longer tells him it will be back, so dismissing it reads as dismissing it for good",
  );
});

test("it only fires for a trainer opening a client's session", () => {
  assert.ok(
    /if \(trainerApp && forClient && clientId\)/.test(route),
    "the gate's condition has changed — it must never appear to a client, nor when he logs his own training",
  );
});

test("the form can assess somebody who is already a client", () => {
  // Without this the gate leads somewhere that cannot do the job: the form was
  // built for a stranger and either creates an account or writes an orphan row.
  assert.ok(/const existingClientId = params.get\("clientId"\)/.test(form), "the form no longer accepts an existing client");
  assert.ok(/client_id: existingClientId/.test(form), "the assessment is no longer written against that client");
  assert.ok(
    /existingClientId \? 'active' : 'pending_signup'/.test(form),
    "an existing client's assessment is saved as pending_signup again, which hides it from anything filtering on status",
  );
  assert.ok(
    /\{!existingClientId && \(/.test(form),
    "Create Client is offered again for somebody who already has an account",
  );
});
