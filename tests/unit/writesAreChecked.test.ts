// Guard: a write that failed must never be reported as a change that happened.
//
// This is the fourth time in two days. The same shape turned up in message
// deletes, in payments, in the calendar drag, and now in the AI's workout
// adjuster — and it is the worst of the four, because that one COUNTS the
// writes and reports the count back as fact.
//
//   await db.from("prescribed_exercises").delete().eq("id", id); applied++;
//
// An RLS refusal, a constraint violation and a vanished row all produced the
// same output: "Applied 3 changes", and a workout that had not changed. Dustin
// would have believed it and the client would have trained the old session.
//
// So the rule this file enforces is narrow and absolute: in the apply loop,
// every `applied++` is preceded by a checked write, and a failure is SAID.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/lib/ai/workoutAdjust.ts"), "utf8");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("no write is followed by applied++ on the same line", () => {
  // The exact shape of the bug: write and count welded together, result thrown
  // away. If this pattern ever returns, the counter is lying again.
  const offenders = code
    .split("\n")
    .map((l, i) => ({ l: l.trim(), n: i + 1 }))
    .filter(({ l }) => /\.(insert|update|delete|upsert)\(/.test(l) && /applied\+\+/.test(l));
  assert.deepEqual(
    offenders.map((o) => `${o.n}: ${o.l}`),
    [],
    "a write is being counted on the same line it is issued — its error is discarded"
  );
});

test("every applied++ is guarded by an error check just above it", () => {
  const lines = code.split("\n");
  const bad: string[] = [];
  lines.forEach((l, i) => {
    if (!/^\s*applied\+\+;\s*$/.test(l)) return;
    // Look back for the checked write that earns the increment.
    //
    // The window was 6 and that was too tight: stripping comments replaces them
    // with BLANK lines rather than removing them, so two lines of explanation
    // pushed the real write out of view and the add branch failed despite being
    // correctly guarded. Blank lines are dropped now and the window is wider.
    const window = lines
      .slice(Math.max(0, i - 12), i)
      .filter((x) => x.trim())
      .join("\n");
    const checked = /const \{ (data: \w+, )?error(: \w+)? \} = await/.test(window);
    const guarded = /if \(error/.test(window);
    if (!checked || !guarded) bad.push(`line ${i + 1}: applied++ with no checked write above it`);
  });
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("the repoint is checked — a clone nothing points at is not an edit", () => {
  // Cloning the day and then failing to repoint the sessions leaves the client
  // reading the ORIGINAL. Every subsequent "change" lands on rows nobody sees.
  assert.match(code, /const \{ error: repointErr \} = await db\.from\("scheduled_workouts"\)\.update/);
  assert.match(code, /if \(repointErr\)/);
  assert.match(code, /Couldn't point the sessions at the new copy/);
});

test("failures are collected, not swallowed", () => {
  assert.match(code, /const failures: string\[\] = \[\]/);
  for (const op of ["remove", "modify", "swap", "add"]) {
    assert.match(
      code,
      new RegExp(`failures\\.push\\(\`${op}:`),
      `the ${op} branch must record why it failed`
    );
  }
});

test("a PARTIAL failure is reported, not hidden behind the successes", () => {
  // "Applied 2 changes" when a third failed reads as complete success.
  assert.match(code, /did NOT apply/);
  assert.match(code, /failures\.length\s*\?/, "the message must branch on failures");
});

test("the total-failure message says why, not just that it failed", () => {
  assert.match(code, /No changes could be applied/);
  assert.match(code, /failures\.slice\(0, 3\)\.join\("; "\)/, "include the actual errors");
});
