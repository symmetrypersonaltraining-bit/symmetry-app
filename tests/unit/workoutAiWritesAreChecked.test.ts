// Guard: the AI workout builder does not hand a client a workout it failed to
// write.
//
// This file has been through this before, and its own comments are the record:
//
//   "The insert error MUST be read. It used to be discarded and `logged` set
//    true unconditionally, so a failed insert still told the client 'Logged -
//    it counts toward your training' while leaving a completed
//    scheduled_workouts row pointing at no log."
//
//   "3 attempts + 1 completed read as 1/4 = 25% adherence for the week instead
//    of 1/1."
//
//   "Jennifer's 30 Jul reads 165 minutes across two walks; she took one."
//
// Both of those were fixed on the workout_logs side. The writes that BUILD the
// workout were still unchecked, and the response hands back every section and
// exercise verbatim, so the client is shown a description of a workout that may
// not be the one in the database.
//
// Two faults, both silent:
//
//   `sections.delete()` on the reuse path is the clear-before-rewrite. Failed,
//   with the inserts succeeding, the day carries the OLD sections AND the new
//   ones — a doubled workout, described to the client as created.
//
//   `prescribed_exercises.insert` dropped an exercise per failure. Nothing
//   about a short workout looks wrong from the outside.
//
// Both now throw into the catch that already exists and already answers
// "Designed the workout but couldn't save it — please try again." No change on
// the success path at all, which matters on a workout surface.
//
// ── What was deliberately NOT changed ──────────────────────────────────────
//
// The scheduling block's writes are captured and logged but still do not fail
// the request. The workout_logs write has already landed by then, so failing
// there would tell a client nothing was logged when a completed session exists
// — one wrong answer swapped for another. What they needed was to be CAPABLE of
// reporting: a PostgREST call returns its error rather than throwing, so the
// catch around that block had never seen one and the console line it exists to
// produce had never fired. Deciding what to tell a client when only half landed
// is a call for Dustin on a workout surface, not a 3am one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAW = readFileSync(join(process.cwd(), "src/app/api/workout-ai/route.ts"), "utf8");
/** The comments name the bug; they must not satisfy the tests. */
const code = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const persist = code.slice(
  code.indexOf("if (reusedDayId) {"),
  code.indexOf("workout-ai persist error"),
);

test("the clear-before-rewrite cannot fail silently", () => {
  // The one that produces a DOUBLED workout: old sections plus new ones.
  assert.match(persist, /const \{ error: clearErr \} = await admin\.from\("sections"\)\.delete\(\)/);
  const guard = persist.indexOf("if (clearErr) throw clearErr");
  const insert = persist.indexOf('.from("sections").insert');
  assert.ok(guard > 0, "the delete is unchecked again");
  assert.ok(guard < insert, "new sections are written before the old ones are known to be gone");
});

test("a renamed day that did not rename is not reported as built", () => {
  assert.match(persist, /const \{ error: labelErr \} = await admin\.from\("days"\)\.update/);
  assert.match(persist, /if \(labelErr\) throw labelErr/);
});

test("an exercise that failed to save does not vanish from a workout described as complete", () => {
  assert.match(persist, /const \{ error: peErr \} = await admin\.from\("prescribed_exercises"\)\.insert/);
  assert.match(persist, /if \(peErr\) throw peErr/);
});

test("every write that builds the workout is checked", () => {
  const bare = persist.match(/(?<!=\s)await\s+admin\s*\n?\s*\.from\([^)]*\)\s*\n?\s*\.(insert|update|delete|upsert)\(/g) || [];
  assert.equal(bare.length, 0, `${bare.length} build writes still discard their result:\n${bare.join("\n")}`);
});

test("a failed build still answers with the message that already existed", () => {
  // The point of throwing rather than returning is that the failure path is the
  // one this route already had. A new error string here would mean the change
  // altered behaviour on more than the failure it was fixing.
  assert.match(code, /Designed the workout but couldn't save it/);
});

// ── The scheduling block: logged, not thrown ───────────────────────────────

const schedule = code.slice(
  code.indexOf("let logged = false;"),
  code.indexOf("workout-ai schedule error"),
);

for (const [what, name] of [
  ["the schedule row on a reused activity day", "schedErr"],
  ["retiring earlier AI attempts", "retireErr"],
  ["marking the replaced workout skipped", "skipErr"],
] as const) {
  test(`${what} can report a failure`, () => {
    assert.match(
      schedule,
      new RegExp(`const \\{ error: ${name} \\} = await admin`),
      `${what} still discards its error, so the catch cannot see it`,
    );
    assert.match(schedule, new RegExp(`if \\(${name}\\) console\\.error`));
  });
}

test("the adherence retirement names its own consequence in the log", () => {
  // "3 attempts + 1 completed reads as 25%" is the bug this write prevents. A
  // log line that just says "error" would not connect the two next time.
  assert.match(schedule, /adherence will read low/);
});

test("the schedule block still does NOT fail the request", () => {
  // Deliberate: the workout_logs write has landed by then. Turning these into
  // throws would report "not logged" over a completed session.
  assert.doesNotMatch(schedule, /if \(schedErr\) throw/);
  assert.doesNotMatch(schedule, /if \(retireErr\) throw/);
});

test("the trainer notification can say it did not arrive", () => {
  const notify = code.slice(code.indexOf("notify the trainer") > 0 ? code.indexOf("sender_kind") - 600 : 0);
  assert.match(notify, /const \{ error: notifyErr \}/);
  assert.match(notify, /if \(notifyErr\) console\.error/);
});
