// ============================================================================
// THE COACH CANNOT SAY "DONE" WHEN IT DID NOTHING.
//
// Dustin, 13 Sep, 3:12pm Central:
//   him: "log a 3 mile hike for my cardio today"
//   it:  "On it — logging a 3-mile hike for your cardio today. Done. Good way
//         to kick off the week, Dustin — get that first session in the books
//         and start logging meals as you go…"
//
// Nothing was written. No cardio_logs row, no offplan_workout_logs row, nothing
// on the schedule, no ai_action_log entry. He found out three hours later by
// opening the Workout tab and seeing "Rest day".
//
// TWO FAULTS, and this file is about the second one, which is the dangerous one:
//
//   1. The coach has no tool for a workout the client ACTUALLY DID. Its client
//      tools can move, swap, add-from-library, mark a SCHEDULED session done,
//      log a weigh-in, look up a movement. A hike is none of those, so no tool
//      ran, toolsUsed came back 0, and the workout pass was discarded by design.
//
//   2. It then fell through to the nutrition coach, WHICH CLAIMED THE WRITE.
//      That path returns intent "none" — the literal meaning of which is "I did
//      not do anything" — while the message said "Done."
//
// Fault 2 is not specific to hikes. The same path would let it claim it had
// logged a meal, moved a session or recorded a weigh-in, and the only way to
// find out is to go and look. That is the class of failure that makes an app
// unsellable, and it had no enforcement behind it — only a prompt line, which
// the model ignored.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripFalseClaims, CLAIMS_AN_ACTION, NOTHING_HAPPENED } from "@/lib/ai/coachClaimGuard";

const ACT = readFileSync(join(process.cwd(), "src/app/api/nutrition-ai/act/route.ts"), "utf8");

describe("the coach cannot say done when it did nothing", () => {
  it("catches the exact reply he got", () => {
    const real =
      "On it — logging a 3-mile hike for your cardio today. Done. Good way to kick off " +
      "the week, Dustin — get that first session in the books and start logging meals as you go.";
    const { text, stripped } = stripFalseClaims(real);

    assert.equal(stripped.length, 2, "both 'On it — logging…' and 'Done.' are claims");
    assert.doesNotMatch(text, /\bDone\b/, "the manufactured confirmation must be gone");
    assert.match(text, new RegExp(NOTHING_HAPPENED.slice(0, 30)), "and it must say so plainly");
    assert.match(text, /kick off the week/, "the genuinely useful coaching survives");
  });

  it("the correction leads, rather than hiding under the coaching", () => {
    const { text } = stripFalseClaims("I've logged it. Protein is running 26g short on average.");
    assert.ok(text.startsWith(NOTHING_HAPPENED), "a correction read third is a correction missed");
  });

  it("an honest reply is returned bit-for-bit unchanged", () => {
    // The overwhelmingly common case. If fixing this quietly reworded every
    // normal answer, the fix would be worse than the bug.
    const honest =
      "You're 26g short on protein for the week. Breakfast is the easiest place to add it — " +
      "you logged five of six meals yesterday, so the habit is there.";
    const { text, stripped } = stripFalseClaims(honest);
    assert.equal(stripped.length, 0);
    assert.equal(text, honest);
  });

  it("second person is left alone — that sentence is usually the useful one", () => {
    assert.doesNotMatch("You logged 5 meals yesterday.", CLAIMS_AN_ACTION);
    assert.doesNotMatch("Once you've logged it I can check the totals.", CLAIMS_AN_ACTION);
    assert.doesNotMatch("I can log that for you if you want.", CLAIMS_AN_ACTION);
  });

  it("catches the other shapes the same failure takes", () => {
    for (const claim of [
      "I've added that to Friday.",
      "I moved your session to Saturday.",
      "Done.",
      "All set.",
      "That's logged.",
      "It's on your schedule now.",
      "Logged it.",
      "I went ahead and recorded your weigh-in.",
    ]) {
      assert.match(claim, CLAIMS_AN_ACTION, `should be caught: ${claim}`);
    }
  });

  it("a reply that was ONLY a false claim still says something honest", () => {
    const { text } = stripFalseClaims("Done.");
    assert.equal(text, NOTHING_HAPPENED, "never return an empty message to the client");
  });

  // ── THE WIRING. A guard nothing calls is a guard that does not exist. ──────
  //
  // Every `intent: "none"` return in the act route is, by construction, a turn
  // where nothing was written — so every one of them has to pass through the
  // guard. This is the assertion that actually fails against the unfixed route.
  it("every MODEL-authored no-write reply goes through the guard", () => {
    assert.match(ACT, /stripFalseClaims/, "the route must import and call it");

    // The three replies the model writes on a turn that changes nothing: the
    // extractor's clarifying question, the coach answer (the one that lied),
    // and the salvaged raw text.
    assert.match(ACT, /message:\s*honest\(act\.reply\)/, "the clarifying question");
    assert.match(ACT, /message:\s*honest\(coach\.value\.message\)/, "the coach answer");
    assert.match(ACT, /message:\s*honest\(fallback/, "the salvage path");
  });

  it("the tool path is deliberately NOT guarded", () => {
    // `run.text` is returned only when `run.toolsUsed > 0` — a tool actually
    // ran and actually wrote. "Done." is TRUE there, and stripping it would
    // turn a correct confirmation into a claim that nothing happened, which is
    // the same lie pointing the other way.
    assert.match(
      ACT,
      /return NextResponse\.json\(\{ intent: "none", message: run\.text \}\)/,
      "a confirmation backed by a real write must survive untouched",
    );
  });

  it("the app's own hardcoded messages are left alone", () => {
    // The unresolved-foods reply is written by us, in the route, and is already
    // honest. Running a model-output guard over app-authored copy would be
    // cargo cult.
    assert.match(ACT, /I won't guess the numbers/, "still app-authored, still unguarded");
  });
});
