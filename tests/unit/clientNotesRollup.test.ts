// The notes nobody had closed out.
//
// `exercise_notes.resolved` shipped with the table and NOTHING had ever written
// it. On 21 Aug 2026: 63 rows, 63 unresolved, 59 of them client-authored, the
// oldest from 19 July. Sitting in there were "skipped. left knee pain"
// (Claudine, 17 Aug), "lower back hurts a bit" (Claudine, 20 Aug), "Skipped
// today. Still afraid of them." (Bobbie, 17 Aug), and two separate "Could we
// switch to an exercise that doesn't use the ball?" from Sara Prince.
//
// This is NOT a test that he never saw them — routeTrainingNote does deliver
// symptoms and questions as messages, and most of those did arrive at the time.
// It guards the thing that was actually missing: state. A message scrolls away,
// a note had none, and "which of these have I dealt with?" had no answer at all.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isSymptomNote, routeTrainingNote } from "../../src/lib/trainingNoteRouting.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─── ranking ────────────────────────────────────────────────────────────────

test("the real notes that sat unread for a month rank as symptoms", () => {
  // Verbatim from the table.
  for (const n of [
    "skipped. left knee pain",
    "lower back hurts a bit",
    "Soreness in upper back. Reduced to two sets.",
    "Skipped today. Still afraid of them.",
    "Step ups weak and unstable",
  ]) {
    assert.equal(isSymptomNote(n), true, `should rank first: "${n}"`);
  }
});

test("bookkeeping does not rank as a symptom", () => {
  for (const n of ["80 lbs next week", "Did kettlebell swings instead.", "No machine", "Will do tomorrow"]) {
    assert.equal(isSymptomNote(n), false, `should not rank first: "${n}"`);
  }
});

test("a question is worth a reply but is not a symptom", () => {
  // Both are worth showing him; only one is worth showing him FIRST. Ranking a
  // swap request alongside a knee giving out would flatten the only ordering
  // the list has.
  const q = "Could we switch to an exercise that doesn't use the ball?";
  assert.equal(routeTrainingNote(q), "deliver", "a question should still reach him");
  assert.equal(isSymptomNote(q), false, "a question should not outrank a symptom");
});

test("the ranking and the interrupting rule share one vocabulary", () => {
  // If these ever drift, a note can be urgent enough to wake him and still sort
  // to the bottom of the list he opens afterwards.
  const src = code(read("src/lib/trainingNoteRouting.ts"));
  assert.match(src, /export const SYMPTOM = \[/, "the symptom list is no longer shared");
  const fn = src.slice(src.indexOf("export function isSymptomNote"));
  assert.match(fn, /SYMPTOM\.some/, "isSymptomNote has its own copy of the vocabulary");
});

// ─── the write is verified ──────────────────────────────────────────────────

test("resolving a note proves a row actually changed", () => {
  const c = code(read("src/app/(app)/home/noteActions.ts"));
  for (const fn of ["resolveExerciseNote", "unresolveExerciseNote"]) {
    const body = c.slice(c.indexOf(`export async function ${fn}`));
    const upTo = body.slice(0, body.indexOf("revalidatePath") + 40);
    assert.match(upTo, /\.select\("id"\)/,
      fn + " does not ask which rows changed — an update matching zero rows is not an error");
    assert.match(upTo, /if \(!data \|\| data\.length === 0\)/,
      fn + " ignores an empty result, so a refused write reads as success");
  }
});

test("only a trainer can close a note", () => {
  const c = code(read("src/app/(app)/home/noteActions.ts"));
  // Counted, not merely matched: there are two actions here (resolve and
  // unresolve) and gating only one of them is the failure this guards. The
  // mechanism moved from isTrainerEmail() — a build-time list — to the
  // `trainers` table on 22 Aug, so a trainer added from inside the app is one
  // too; the count is what actually carries the rule.
  assert.equal((c.match(/viewerIsTrainer\(\w+, user\)/g) || []).length, 2,
    "both actions must gate on the caller being a trainer");
});

test("an optimistic tick is put back when the write fails", () => {
  // The row is removed from the list BEFORE the write returns, so a refused
  // write would otherwise clear it off the screen while the database still has
  // it open — the same shape that lost a workout log on 17 Aug.
  const c = code(read("src/components/ClientNotesPanel.tsx"));
  assert.match(c, /if \(err\) \{[\s\S]{0,200}?c\.delete\(n\.id\)/,
    "a failed resolve leaves the note hidden");
  assert.match(c, /window\.alert\(err\)/, "a failed resolve says nothing to the person who tapped");
});

// ─── unmounted 21 Aug, and deliberately kept ────────────────────────────────

test("the panel is off trainer home, and its query went with it", () => {
  // Dustin, 21 Aug: "those changes would also get rid of the need for the needs
  // your eyes tab right? that would declutter my trainer dashboard a lot and
  // still catch everything."
  //
  // It caught everything by showing everything, which is how 63 notes piled up
  // with a client's back injury buried under twelve pull-up weights. The work
  // is now split three ways: equipment problems become swap proposals, routine
  // set data and cardio substitutions close themselves and never surface, and
  // what is genuinely left is one counted row in Today's Admin.
  const c = code(read("src/app/(app)/home/page.tsx"));
  assert.ok(!/<ClientNotesPanel\b/.test(c), "the notes panel is back on trainer home");
  // The sixty-row query must go too. Fetching notes on every render to feed a
  // panel that is not mounted is pure cost, and it is the kind of thing that
  // survives a removal unnoticed.
  assert.ok(!/from\("exercise_notes"\)/.test(c),
    "trainer home still queries exercise_notes for a panel it no longer renders");
});

test("the component still exists, unmounted", () => {
  // Same treatment as TrainerWeekDigest and SaturdayReview: the resolve/unresolve
  // flow, the optimistic tick and its rollback are all worth keeping if notes
  // ever come back to a screen of their own.
  assert.ok(
    existsSync(join(process.cwd(), "src/components/ClientNotesPanel.tsx")),
    "ClientNotesPanel was deleted rather than unmounted",
  );
});

test("Today's Admin counts the notes instead, and links to them", () => {
  const c = code(read("src/components/TodaysAdmin.tsx"));
  assert.match(c, /from\("exercise_notes"\)/, "Today's Admin no longer counts notes");
  assert.match(c, /not\("resolved", "is", true\)/, "it counts resolved notes too");
  // The routine classes must stay excluded or the count becomes the old panel
  // again, just smaller.
  assert.match(c, /ROUTINE/, "the routine-note filter is gone, so set weights would be counted as work");
});
