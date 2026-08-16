// Guard: editing a client's programme does not show a change that never saved.
//
// `WorkoutDayEditor` is the screen where a trainer changes what a client will
// actually do — sets, reps, duration, the cue, and which exercises are in the
// day at all. Every editor on the row called `onUpdate()`, which repaints
// immediately, and then fired the write WITHOUT looking at the result.
//
// So a refused update showed the trainer their new number, on a client's
// programme, while the database kept the old one. Nothing said otherwise until
// the next load — by which point the change had been made in their head and the
// client had trained.
//
// Delete was worse than the field edits. `onDelete()` takes the row off the
// screen, and it ran unconditionally: the trainer removes an exercise they have
// decided not to programme, watches it disappear, and the client trains it that
// afternoon.
//
// Reverting on failure rather than only warning, because these inputs are
// uncontrolled (`defaultValue`): an alert alone would leave the typed value
// sitting on screen, still showing a number that is not in the database, which
// is the same lie with an apology attached.
//
// ── /api/workout-manual ────────────────────────────────────────────────────
//
// Two more, both in code whose own comments explain why they matter:
//
//   The `program_assignments` insert — "the assignment is active, which is what
//   makes the program visible to the client at all". Unchecked, the helper
//   returned the phase id as success and the workout was saved into a programme
//   the client could not see, which looks to them exactly like it vanishing.
//
//   The rollback — "A half-created day still LOOKS like a workout in the list,
//   so leaving one behind is worse than reporting the failure". It was wrapped
//   in a try/catch over PostgREST calls, which cannot fire, so a rollback that
//   left one behind said nothing at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const EDITOR = strip(
  readFileSync(join(process.cwd(), "src/app/(app)/clients/[clientId]/day/[dayId]/WorkoutDayEditor.tsx"), "utf8"),
);
const MANUAL = strip(readFileSync(join(process.cwd(), "src/app/api/workout-manual/route.ts"), "utf8"));

test("no field editor writes without reading the result", () => {
  // Every edit goes through saveField now. A bare update is the fault returning.
  const bare = EDITOR.match(/await\s+supabase\s*\n?\s*\.from\("prescribed_exercises"\)\s*\n?\s*\.update\(/g) || [];
  assert.equal(
    bare.length,
    1,
    "only saveField() may update prescribed_exercises directly — an editor is writing on its own again",
  );
  assert.match(EDITOR, /async function saveField\(/);
});

test("a refused save puts the value back rather than leaving the typed one on screen", () => {
  const i = EDITOR.indexOf("async function saveField(");
  const body = EDITOR.slice(i, i + 900);
  assert.match(body, /const \{ error \} = await supabase/);
  assert.match(body, /if \(!error\) return;/, "the failure path must be the only path that does anything");
  assert.match(body, /onUpdate\(field, previous\)/, "local state is not put back");
  assert.match(body, /revert\(\)/, "the uncontrolled input still shows the typed value");
  assert.match(body, /window\.alert\(/);
});

for (const [what, marker] of [
  ["the volume-type select", "onChange={async e => {"],
  ["the number and text inputs", "onBlur={async e => {"],
] as const) {
  test(`${what} hands saveField the previous value`, () => {
    const i = EDITOR.indexOf(marker);
    assert.ok(i > 0, `${what} not found`);
    const body = EDITOR.slice(i, i + 420);
    assert.match(body, /const prev = /, "nothing to revert to");
    assert.match(body, /await saveField\(/);
  });
}

test("the cue field saves through the same path", () => {
  assert.match(EDITOR, /await saveField\("cue"/);
});

test("a refused delete leaves the exercise on screen, because it is still in the workout", () => {
  const i = EDITOR.indexOf("async function handleDelete");
  const body = EDITOR.slice(i, i + 700);
  const guard = body.indexOf("if (error)");
  const remove = body.indexOf("onDelete()");
  assert.match(body, /const \{ error \} = await supabase/, "the delete is unchecked again");
  assert.ok(guard > 0 && guard < remove, "the row leaves the screen before the delete is known to have landed");
  assert.match(body.slice(guard, guard + 300), /return;/);
});

// ── workout-manual ─────────────────────────────────────────────────────────

test("a workout is not saved into a programme the client cannot see", () => {
  assert.match(MANUAL, /const \{ error: asgErr \} = await db\.from\("program_assignments"\)\.insert/);
  assert.match(MANUAL, /if \(asgErr\) return null;/, "the caller must take its existing failure path");
});

test("a rollback that left a half-created day says so", () => {
  const i = MANUAL.indexOf("if (created.days) {");
  const body = MANUAL.slice(i, i + 1400);
  // Derived from the steps, not just declared: `const cleanupErr = null` would
  // satisfy a looser check while reporting nothing, for ever.
  assert.match(
    body,
    /const cleanupErr = step1\.error \|\| step2\.error \|\| step3\.error;/,
    "the cleanup result is no longer read from the steps that produce it",
  );
  assert.match(body, /rollback incomplete/);
  assert.match(body, /console\.error\(/);
});

test("the rollback stops at the first failure instead of deleting past it", () => {
  // Deleting a day whose sections are still there is how orphans are made.
  const i = MANUAL.indexOf("if (created.days) {");
  const body = MANUAL.slice(i, i + 1400);
  assert.match(body, /step1\.error \? \{ error: step1\.error \} : await db/);
  assert.match(body, /step2\.error \? \{ error: step2\.error \} : await db/);
});
