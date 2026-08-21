// Guard: nothing treats `workout_logs.status` as if it could say "completed".
//
// The CHECK constraint on that column allows exactly five values:
//
//   'Done as planned' | 'Modified' | 'Partial' | 'Skipped' | 'Rest day'
//
// "completed" is not among them. It belongs to `scheduled_workouts`, and the
// two vocabularies were conflated in three readers.
//
// Two of them — ClientWeekSummary and TrainerWeekDigest — wrote
// `w.completed || w.status === "completed"`, which is dead: the clause can
// never be true and the boolean already carried the answer.
//
// MetricCards wrote `w.completed || w.status`, and THAT is a real bug. It is a
// truthiness test, and the column is populated on every row that has one —
// always the same single value, because **no code path in this app has ever
// written any of the other four**. Measured: 977 rows, every one of them 'Done
// as planned', across two years and 29 clients. So the filter counted every log
// row as a training day INCLUDING `completed = false` ones, inflating the
// streak and the training-day count with sessions a client started and walked
// away from. One such row exists today; the number only grows.
//
// All three now read the boolean, which is the field that answers the question.
//
// The wider fact is worth keeping: `workout_logs.status` is effectively a
// constant. Every write site hardcodes 'Done as planned' — AddWorkoutButton,
// workout-manual, workout-ai (twice), schedule/actions and WorkoutLogger. There
// is no UI anywhere for recording a modified, partial or skipped session, so
// the other four values in the constraint have never once been used. That is
// not fixed here: it is a product question about whether that distinction
// should exist, and it is on Dustin's list rather than guessed at.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every source file, so a NEW reader with the same mistake fails this too. */
function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const FILES = sources(join(process.cwd(), "src"));

test("no reader tests a workout log's status for truthiness", () => {
  // `w.completed || w.status` — the MetricCards bug. It reads as a fallback and
  // is an unconditional yes.
  const bad: string[] = [];
  for (const f of FILES) {
    const code = strip(readFileSync(f, "utf8"));
    if (/\.completed\s*\|\|\s*\w+\.status(?!\s*===)/.test(code)) bad.push(f);
  }
  assert.deepEqual(bad, [], `truthiness test on a workout log's status in:\n${bad.join("\n")}`);
});

test('no reader compares a workout log\'s status to "completed"', () => {
  // Dead, but dead with a false premise — which is exactly what the bug above
  // grew out of.
  const bad: string[] = [];
  for (const f of FILES) {
    const code = strip(readFileSync(f, "utf8"));
    // Only where the row plainly came from workout_logs: the same expression is
    // CORRECT for scheduled_workouts, which really does use "completed".
    if (!/from\(["']workout_logs["']\)/.test(code)) continue;
    if (/\.completed\s*\|\|\s*\w+\.status\s*===\s*["']completed["']/.test(code)) bad.push(f);
  }
  assert.deepEqual(bad, [], `workout_logs.status compared to "completed" in:\n${bad.join("\n")}`);
});

test("the three readers that had it now read the boolean", () => {
  for (const [f, expected] of [
    ["src/components/MetricCards.tsx", "(w: any) => w.completed)"],
    ["src/components/ClientWeekSummary.tsx", "(w: any) => w.completed)"],
    ["src/components/TrainerWeekDigest.tsx", "if (l.completed) {"],
  ] as const) {
    const code = strip(readFileSync(join(process.cwd(), f), "utf8"));
    assert.ok(code.includes(expected), `${f} no longer reads the completed boolean`);
  }
});

test("scheduled_workouts is left alone — 'completed' is real there", () => {
  // The fix must not have swept up the table where that status genuinely
  // exists, or every done-count in the app goes to zero.
  const summary = strip(readFileSync(join(process.cwd(), "src/components/ClientWeekSummary.tsx"), "utf8"));
  // Checks the two done-counts BY NAME rather than counting occurrences.
  //
  // It used to assert the string appeared exactly twice, which broke the moment
  // a third legitimate reader arrived (21 Aug: the streak reads the same status
  // so a session ticked off on the schedule counts even with no log row). A
  // bare count also could not tell which two survived — one being swept up and
  // a new one added elsewhere would still total two and pass. Naming them is
  // both stricter and stable.
  for (const which of ["doneLast", "doneThis"]) {
    const at = summary.indexOf("const " + which + " =");
    assert.ok(at > -1, which + " is gone from ClientWeekSummary");
    assert.match(
      summary.slice(at, at + 160),
      /r\.status === "completed"/,
      which + ' no longer counts scheduled_workouts by status === "completed" — that done-count would read zero',
    );
  }
});
