// The workout logger must not lose work.
//
// Dustin, 2026-08-20: "Went to look at nutrition while logging a workout. When
// I resumed workout, most of what I logged was not logged anymore."
//
// Three separate faults produced that one sentence, and all three are pinned
// here. These are structural tests over the logger source: the logger is a
// 3,000-line client component with no seam to unit-test the writes through, and
// a guard that is not tested is a guard that comes back out.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LOGGER = readFileSync(
  join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"),
  "utf8",
);

/**
 * Source with comments removed.
 *
 * Needed because this file's own first run FAILED on correct code: the comment
 * explaining the __clearDraft() bug contains the string `__clearDraft()`, so
 * the assertion that the call is gone matched the explanation of why it went.
 * That is the fifth time in this codebase a structural assertion has been
 * decided by a comment rather than by code, in one direction or the other.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** A function body, bounded at the next declaration — never a fixed slice. */
function fnBody(name: string): string {
  const i = LOGGER.indexOf(name);
  assert.ok(i > 0, name + " is gone");
  const after = i + name.length;
  const rest = LOGGER.slice(after);
  const end = rest.search(/\n {2}(?:async )?function |\n {2}const \w+ = |\n {2}\/\/ ───/);
  return LOGGER.slice(i, end === -1 ? LOGGER.length : after + end);
}

// ─── 1. a failed READ is not a deletion ─────────────────────────────────────

test("a failed liveness check does not wipe the draft", () => {
  const body = fnBody("async function ensureWorkoutLog");
  assert.match(body, /const \{ data: alive, error: aliveErr \}/,
    "the liveness read discards its error again — a dropped request reads as 'row deleted'");
  assert.match(body, /if \(aliveErr\) \{[\s\S]{0,200}?throw new Error\(/,
    "an errored read still falls through to the delete path");
  // The draft is the ONLY copy of typed-but-unticked work at that moment.
  const upTo = code(body.slice(0, body.indexOf("const { data: existing")));
  assert.doesNotMatch(upTo, /__clearDraft\(\)/,
    "the draft is cleared on a failed read — this is the bug, exactly");
});

test("a failed existing-log lookup does not insert a duplicate", () => {
  const body = fnBody("async function ensureWorkoutLog");
  assert.match(body, /const \{ data: existing, error: existingErr \}/,
    "the lookup discards its error, so a failure reads as 'no log exists'");
  const errIdx = body.indexOf("if (existingErr)");
  const insertIdx = body.indexOf('.from("workout_logs").insert(');
  assert.ok(errIdx > 0 && errIdx < insertIdx,
    "the error check must come BEFORE the insert or it protects nothing");
});

// ─── 2. the tick must not go green on a failed write ────────────────────────

test("logSet checks that the row actually landed", () => {
  const body = fnBody("async function logSet");
  assert.match(body, /const \{ data: setRows, error: setErr \} = await supabase\.from\("set_logs"\)\.upsert/,
    "the upsert's result is discarded — supabase-js resolves errors, it does not throw");
  assert.match(body, /\.select\("id"\)/,
    "without select the write cannot report which rows it changed");
  const errIdx = body.indexOf("if (setErr) throw setErr;");
  const greenIdx = body.indexOf('updateSet(peId, si, "done", true)');
  assert.ok(errIdx > 0 && errIdx < greenIdx,
    "the set turns green before the write is verified");
  assert.match(body, /if \(!setRows \|\| !setRows\.length\)/,
    "nought rows changed is not an error in PostgREST — with client_id null RLS matches nothing and reports nothing");
});

test("a failed set save is shown to the client, not just the console", () => {
  const body = fnBody("async function logSet");
  assert.match(body, /setCompleteError\(/,
    "the failure only reaches console.error — invisible to the person lifting");
});

test("logging a whole movement verifies every row", () => {
  const body = fnBody("async function logAllCurrentSets");
  assert.match(body, /const \{ data: bulkRows, error: bulkErr \}/);
  assert.match(body, /bulkRows\.length !== rows\.length/,
    "a partial bulk write turns every set of the movement green");
});

// ─── 3. typed but not ticked was never saved at all ─────────────────────────

test("typed values are written on blur, not only on the tick", () => {
  const body = fnBody("async function saveTypedSet");
  assert.match(body, /completed: false/,
    "a half-finished set must not be written as done");
  assert.match(body, /if \(!s \|\| s\.done\) return;/,
    "it must not fight logSet over a set that is already ticked");
});

test("an untouched set writes nothing", () => {
  // Otherwise every set of every exercise the client scrolls past becomes a
  // row, and 'was this attempted?' stops being answerable.
  const body = fnBody("async function saveTypedSet");
  assert.match(body, /s\.weight\?\.trim\(\) \|\| s\.reps\?\.trim\(\)/);
  assert.match(body, /s\.distance\?\.trim\(\) \|\| s\.speed\?\.trim\(\) \|\| s\.hr\?\.trim\(\)/,
    "cardio-only fields are not checked, so a typed speed or HR saves nothing");
});

test("the background save stays quiet", () => {
  // It is not an action the client took. Interrupting someone mid-set with an
  // error about a set they have not claimed to have finished is worse than the
  // silence — the tick is where a failure must be loud.
  const body = fnBody("async function saveTypedSet");
  assert.doesNotMatch(body, /setCompleteError\(/);
});

test("every input blur reaches it — all eleven", () => {
  const session = (LOGGER.match(/if \(setEntry\.done\) logSet\(currentExercise\.id, si\); else saveTypedSet\(currentExercise\.id, si\); \}\}/g) || []).length;
  const overview = (LOGGER.match(/onBlur=\{\(\) => \{ if \(setEntry\.done\) logSet\(pe\.id, si\); else saveTypedSet\(pe\.id, si\); \}\}/g) || []).length;
  assert.equal(session, 5, "session-view inputs left on the old blur handler");
  assert.equal(overview, 6, "overview inputs left on the old blur handler");
  assert.doesNotMatch(LOGGER, /if \(setEntry\.done\) logSet\(currentExercise\.id, si\); \}\}/,
    "a session-view input still drops what was typed into it");
  assert.doesNotMatch(LOGGER, /onBlur=\{\(\) => \{ if \(setEntry\.done\) logSet\(pe\.id, si\); \}\}/,
    "an overview input still drops what was typed into it");
});

test("restoring a set reads completed, so an unticked row comes back unticked", () => {
  assert.match(LOGGER, /done: ex\?\.completed \?\? false/,
    "an unticked saved row would come back already green");
});


// ─── the comment stripper has to work, or every test above is decorative ────

test("code() removes comments and keeps code", () => {
  assert.equal(code("a(); // b()").trim(), "a();");
  assert.equal(code("a();\n/* b();\n c(); */\nd();").replace(/\s+/g, " ").trim(), "a(); d();");
  assert.match(code('const u = "https://x.test";'), /https:\/\/x\.test/,
    "a URL inside a string was mistaken for a comment");
  assert.match(code("x(); // __clearDraft()"), /^x\(\);/,
    "the exact case this file failed on");
  assert.match(code("__clearDraft(); // real call"), /__clearDraft\(\)/,
    "a real call must survive");
});
