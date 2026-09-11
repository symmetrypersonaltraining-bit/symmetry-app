// ============================================================================
// A FAILED TICK CLEARS WHEN THE NEXT ONE SAVES.
//
// Dustin, 11 Sep 2026, mid-session on Bulk — Legs, exercise 11 of 17:
//   "new row violates row-level security policy for table workout_logs"
//   "when this happens error doesnt clear once it works"
//
// His log for that session had existed since 10:43 with 24 sets on it. At
// 11:35 one tick went out without his login attached: the lookup for the log
// came back empty (RLS hides what an anonymous caller may not see), the
// logger took that as "no log", inserted, and the insert was refused. The
// next tick carried the login and saved. Three things were wrong with what he
// saw:
//
//   1. the banner is completeError, which only Complete ever clears, so a tick
//      that succeeds afterwards leaves the failure on screen for the rest of
//      the workout;
//   2. the workout_logs insert recorded nothing when refused — set_logs does,
//      workout_logs did not — so there was no row to diagnose it from;
//   3. a refusal for want of a session was shown to him instead of the client
//      asking for its session and trying once more.
//
// Asserted against the source, like the other logger guards. Pure node.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LOGGER = readFileSync(
  join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"),
  "utf8",
);
const CLIENT_ERR = readFileSync(join(process.cwd(), "src/lib/logClientError.ts"), "utf8");
const APP_ERR = readFileSync(join(process.cwd(), "src/lib/logAppError.ts"), "utf8");

function fnBody(src: string, header: string): string {
  const start = src.indexOf(header);
  assert.ok(start >= 0, `could not find ${header}`);
  return src.slice(start, start + 9000);
}

describe("a failed tick clears when the next one saves", () => {
  it("a set that saves clears the banner a failed set left behind", () => {
    const logSet = fnBody(LOGGER, "async function logSet(");
    const clear = logSet.indexOf("setCompleteError(null)");
    const green = logSet.indexOf('updateSet(peId, si, "done", true)');
    assert.ok(clear >= 0, "logSet never clears completeError on success");
    assert.ok(clear < green, "the banner must clear before the set goes green, in the success path");
  });

  it("a refused workout log insert is recorded, not just shown", () => {
    const ensure = fnBody(LOGGER, "async function ensureWorkoutLogUncached(");
    assert.match(ensure, /logClientError\(\{[\s\S]*?scope: "workout_log"/,
      "the insert's error path must report to the error log under scope workout_log");
    assert.match(CLIENT_ERR, /"workout_log"/, "ClientErrorScope must allow workout_log");
    assert.match(APP_ERR, /"workout_log"/, "AppErrorScope must allow workout_log");
  });

  it("a refusal for want of a session asks for the session and tries once more", () => {
    const ensure = fnBody(LOGGER, "async function ensureWorkoutLogUncached(");
    assert.match(ensure, /42501/, "the RLS refusal code must be recognised");
    assert.match(ensure, /supabase\.auth\.getSession\(\)/,
      "the client must be asked for its session before the retry");
    const inserts = ensure.match(/\.from\("workout_logs"\)\.insert\(/g) ?? [];
    assert.ok(inserts.length >= 1, "the insert is still there");
    assert.match(ensure, /retried|retry/i, "the retry must be visible in the source, not implied");
  });
});
