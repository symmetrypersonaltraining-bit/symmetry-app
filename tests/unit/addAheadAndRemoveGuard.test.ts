// Two faults from Dustin's evening, 17 Aug:
//
//   "I tried to add one to tomorrow, it popped up on today as a 3rd then I
//    deleted that one. my logged one unlogged after that. 2 separate issues"
//
// A: the Add workout date box was capped at TODAY, so tomorrow was impossible.
// B: the delete removed his COMPLETED session instead of the stray one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extraConfirmFor, removalVerdict } from "../../src/lib/removeGuard.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ADD = read("src/components/AddWorkoutButton.tsx");
const BOARD = read("src/components/ScheduleBoard.tsx");

// A COMMENT MUST NOT SATISFY A STRUCTURAL ASSERTION.
//
// Third time today. The mutation harness removed the real `.select("id")` from
// removeWorkout and this suite stayed green, because the comment two lines
// above it writes `.select("id")` in prose. Strip comments before asserting on
// code, and prove the stripper strips.
function code(src: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === "\\") { out += src[++i] ?? ""; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return out;
}

test("the comment stripper strips, or the guards below are theatre", () => {
  assert.equal(code('a // .select("id")\nb').includes('.select("id")'), false);
  assert.ok(code('x.select("id"); // note').includes('x.select("id")'));
});

// ─── A: adding a workout to tomorrow ────────────────────────────────────────

test("the date box accepts future dates", () => {
  assert.doesNotMatch(ADD, /type="date"[^>]*max=\{ctToday\(\)\}/,
    "max is today again — picking tomorrow is clamped back and the workout lands on today");
  assert.match(ADD, /type="date"[^>]*max=\{maxDate\}/,
    "the date box no longer uses the forward bound");
  assert.match(ADD, /const maxDate = daysAheadCT\(/,
    "there is no forward bound at all");
});

test("the backward bound survives — backdating is why this sheet exists", () => {
  assert.match(ADD, /const minDate = daysAgoCT\(90\)/,
    "backdating a session from the last 90 days was removed");
  assert.match(ADD, /type="date"[^>]*min=\{minDate\}/);
});

test("a future date is labelled as scheduled ahead, not backdated", () => {
  assert.match(ADD, /"scheduled ahead" : "backdated"/,
    "a workout added for next Tuesday still says 'backdated', which reads as a bug");
});

// ─── B: the delete guard ────────────────────────────────────────────────────

test("a COMPLETED session asks a second time", () => {
  const v = extraConfirmFor({ id: "a", label: "Deload — Upper Push + Corrective", status: "completed" });
  assert.ok(v, "a finished session comes off on one tap again");
  assert.match(v!, /Deload — Upper Push \+ Corrective/, "the warning must name what it is about to erase");
  assert.match(v!, /adherence/, "it must say what it costs, not just ask twice");
});

test("a session with a log attached counts as done even if the status lags", () => {
  assert.ok(extraConfirmFor({ id: "a", workoutLogId: "log-1", status: "scheduled" }),
    "a session with real training behind it is deletable on one tap");
});

test("an ordinary scheduled session is NOT made into a two-step", () => {
  // Removing something you have not done is routine. A second confirm there is
  // noise, and noise is how people learn to tap through warnings.
  assert.equal(extraConfirmFor({ id: "a", label: "Leg Press", status: "scheduled" }), null);
  assert.equal(extraConfirmFor({ id: "a", status: null }), null);
});

// ─── B: the delete has to prove it hit the right row ────────────────────────

test("a delete that removed nothing says so", () => {
  const v = removalVerdict("wanted", []);
  assert.ok(v, "zero rows changed is not an error — the row is already off the screen either way");
  assert.match(v!, /still on your schedule/);
});

test("a delete that removed the WRONG row says so — this is the 17 Aug fault", () => {
  const v = removalVerdict("the-stray-one", ["the-completed-one"]);
  assert.ok(v, "removing a different session than the one tapped passed silently");
  assert.match(v!, /Something else was removed/);
});

test("a delete that removed extra rows says so", () => {
  assert.ok(removalVerdict("wanted", ["wanted", "and-another"]));
});

test("removing exactly the row named is the only silent case", () => {
  assert.equal(removalVerdict("wanted", ["wanted"]), null);
});

// ─── B: wired in, and in the right order ────────────────────────────────────

test("the board asks, verifies, and restores the row when it went wrong", () => {
  const i = BOARD.indexOf("async function removeWorkout");
  assert.ok(i > 0, "removeWorkout is gone");
  const after = i + "async function removeWorkout".length;
  const rest = BOARD.slice(after);
  const end = rest.search(/\n {2}(?:async )?function /);
  // Comments stripped: this function's own comments quote `.select("id")` and
  // name extraConfirmFor, and a loose match on them passed a mutation that had
  // deleted the real call.
  const body = code(BOARD.slice(i, end === -1 ? BOARD.length : after + end));

  // COMPUTING the confirm is not USING it. The mutation that deleted the
  // `if (extra && ...) return;` line left `const extra = extraConfirmFor(...)`
  // behind, and a match on the name alone sailed through.
  assert.match(body, /const extra = extraConfirmFor\(/,
    "the second confirm is never computed");
  assert.match(body, /if \(extra && [^)]*!window\.confirm\(extra\)\) return;/,
    "the second confirm is computed and then not acted on — a completed session still deletes on one tap");

  assert.match(body, /\.eq\("id", w\.id\)\s*\.select\("id"\)/,
    "the delete cannot prove which row it changed");
  assert.match(body, /removalVerdict\(w\.id,/,
    "the delete's result is never checked against the row that was tapped");

  const confirm = body.indexOf("extraConfirmFor(");
  const optimistic = body.indexOf("prev.filter((x) => x.id !== w.id)");
  const write = body.indexOf(".update({ deleted_at");
  assert.ok(confirm < optimistic, "the row vanishes from the screen before the user has confirmed");
  assert.ok(confirm < write, "the write happens before the confirm");

  // When the verdict is bad the row must come BACK. Bounded to the verdict
  // BLOCK, not a 300-character window: the catch below restores the row too, so
  // a loose window matched that instead and passed a mutation that had removed
  // the restore from this branch.
  const vStart = body.indexOf("if (verdict) {");
  assert.ok(vStart > 0, "the verdict is computed and then ignored");
  const vEnd = body.indexOf("return;", vStart);
  assert.ok(vEnd > vStart, "the bad-verdict branch does not stop — it falls through to 'Removed'");
  const block = body.slice(vStart, vEnd);
  assert.match(block, /setWorkouts\(\(prev\) => \[\.\.\.prev, w\]\)/,
    "a failed delete leaves the row hidden, so the schedule on screen is a lie");
  assert.match(block, /window\.alert\(verdict\)/,
    "the failure is silent — the whole point is that a misfired delete says so");
});
