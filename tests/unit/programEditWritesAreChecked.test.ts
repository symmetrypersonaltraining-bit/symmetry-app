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

// ── The build-a-workout modal ──────────────────────────────────────────────
//
// `saveAndSchedule` in clients/[clientId]/program/page.tsx had three silent
// exits and one silent write. `assignDay`, ten lines above it in the same file,
// carries the comment that names the fault:
//
//   "The write used to discard its error entirely, so a rejection would look
//    like the button doing nothing at all — the single worst way for a
//    constraint to surface."
//
// That was fixed there and left alone here, four times over: a failed day
// insert returned with the modal open and nothing said; a failed section
// `continue`d, producing a workout that looks finished with a section missing;
// a failed exercise insert dropped that exercise the same way; and the
// prescribed_exercises write was not checked at all.
//
// Stopping rather than skipping, because a workout saved with one section gone
// looks complete and the trainer has no way to tell which one went.

const PROGRAM = strip(readFileSync(join(process.cwd(), "src/app/(app)/clients/[clientId]/program/page.tsx"), "utf8"));

test("every write in the build-a-workout modal reads its result", () => {
  const bare = PROGRAM.match(/(?<!=\s)await\s+supabase\s*\n?\s*\.from\([^)]*\)\s*\n?\s*\.(insert|update|delete|upsert)\(/g) || [];
  assert.equal(bare.length, 0, `${bare.length} writes still discard their result:\n${bare.join("\n")}`);
});

for (const [what, captured, guard] of [
  ["the day", "error: dayErr", "if (dayErr || !newDay)"],
  ["a section", "error: secErr", "if (secErr || !newSec)"],
  ["a new library exercise", "error: exErr", "if (exErr || !newEx)"],
  ["an exercise in the workout", "error: peErr", "if (peErr)"],
] as const) {
  test(`a failed ${what} write says so instead of a dead button`, () => {
    assert.ok(PROGRAM.includes(captured), `${what} is unchecked again`);
    // The GUARD, not just the capture: capturing an error and then not
    // branching on it is the same silence with extra syntax, and the alert on
    // the next failure along would satisfy a looser window.
    const g = PROGRAM.indexOf(guard);
    assert.ok(g > 0, `${what} captures its error but never acts on it`);
    assert.match(PROGRAM.slice(g, g + 400), /window\.alert\(/, `${what} fails silently`);
    assert.match(PROGRAM.slice(g, g + 400), /return;/, `${what} carries on after failing`);
  });
}

test("a failed section or exercise stops the save rather than skipping it", () => {
  // `continue` produced a workout that looks finished with something missing.
  assert.doesNotMatch(PROGRAM, /if \(!newSec\) continue;/);
  assert.doesNotMatch(PROGRAM, /if \(!exRow\) continue;/);
});

test("editing sets, reps or load reports a refusal", () => {
  const i = PROGRAM.indexOf("async function saveExercise");
  const body = PROGRAM.slice(i, i + 600);
  assert.match(body, /const \{ error \} = await supabase/);
  assert.match(body, /window\.alert\(/);
});

// ── The meal plan editor ───────────────────────────────────────────────────
//
// /api/nutrition/plan-edit clones a client's plan before editing it, then
// archives the version it supersedes. Four writes inside that clone were
// unchecked, and every one of them corrupts a live meal plan silently:
//
//   a failed meal copy `continue`d, so the clone lost a meal — and the archive
//   below then retired the original, leaving the client without a meal they had
//   that morning;
//
//   the edited meal's items were inserted unchecked while the response reported
//   `items: edited.length`, so the meal the client opens could be empty;
//
//   a copied meal's items likewise, which is the same trap the file already
//   documents for its explicit column list;
//
//   and on the in-place path, the delete that makes "replace" a replace. Failed,
//   with the insert succeeding, the client opens a meal with every food in it
//   twice and the day's macros doubled.

const PLANEDIT = strip(readFileSync(join(process.cwd(), "src/app/api/nutrition/plan-edit/route.ts"), "utf8"));

test("every write in the plan editor reads its result", () => {
  const bare = PLANEDIT.match(/(?<!=\s)await\s+admin\s*\n?\s*\.from\([^)]*\)\s*\n?\s*\.(insert|update|delete|upsert)\(/g) || [];
  assert.equal(bare.length, 0, `${bare.length} writes still discard their result:\n${bare.join("\n")}`);
});

test("a clone that lost a meal is abandoned, not archived over", () => {
  // Nothing is archived until the copy is whole, so throwing here leaves the
  // client's existing plan in force — which is the safe end state.
  assert.doesNotMatch(PLANEDIT, /if \(!copyId\) continue;/, "a failed meal copy still skips on");
  assert.match(PLANEDIT, /if \(copyErr\) throw new Error/);
  assert.match(PLANEDIT, /Could not copy the meal/);
});

test("an edit reported as saved actually has its items", () => {
  assert.match(PLANEDIT, /const \{ error: editErr \}/);
  assert.match(PLANEDIT, /Could not save the edited meal/);
});

test("a copied meal that lost its food is not passed off as copied", () => {
  assert.match(PLANEDIT, /const \{ error: itemsErr \}/);
  assert.match(PLANEDIT, /Could not copy the items in/);
});

test("replace-in-place cannot leave the old items alongside the new", () => {
  const i = PLANEDIT.indexOf("replace this meal's items in place");
  const body = PLANEDIT.slice(i > 0 ? i : 0);
  const guard = body.indexOf("if (clearErr)");
  const insert = body.indexOf('.from("meal_items").insert');
  assert.ok(guard > 0, "the delete is unchecked again — doubled items, doubled macros");
  assert.ok(guard < insert, "the new items go in before the old ones are known to be gone");
});

// ── The Week Ahead list ────────────────────────────────────────────────────

const DIGEST = strip(readFileSync(join(process.cwd(), "src/components/TrainerWeekDigest.tsx"), "utf8"));

test("a focus that did not save does not take the client off the list", () => {
  // Removal from Week Ahead IS the record of having dealt with them. Unchecked,
  // the focus was never saved AND they never came back round to be noticed.
  const i = DIGEST.indexOf("digest_snoozed_until = nextSunday");
  const body = DIGEST.slice(i, i + 800);
  const guard = body.indexOf("if (error)");
  const remove = body.indexOf("setRows(");
  assert.match(body, /const \{ error \} = await supabase/);
  assert.ok(guard > 0 && guard < remove, "the client leaves the list before the write is known to have landed");
});
