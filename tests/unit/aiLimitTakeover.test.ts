// Guard: the daily-AI-limit takeover, and the raised caps behind it.
//
// Dustin, 15 Aug: "raise cap but save usage where we can without losing
// anytgijgbwe built. send a screen take over to make them aware of limit and
// give tips on how to save it fir where its needed and where they can dobit
// another way without wasting it."
//
// Context: 15/day cut Jennifer off at 12:52 mid-workout, on a day the whole app
// spent $0.51 against a $95 monthly kill switch. She got one line of chat and
// stopped using the coach.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_LIMITS } from "../../src/lib/ai/meter-core";

const TAKEOVER = readFileSync(join(process.cwd(), "src/components/AiLimitTakeover.tsx"), "utf8");
const SHEET = readFileSync(join(process.cwd(), "src/app/(app)/nutrition/v3/CoachChatSheet.tsx"), "utf8");
const METER = readFileSync(join(process.cwd(), "src/lib/ai/meter.ts"), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the conversational caps are raised, and the risky ones are not", () => {
  // Raised: things a client asks for and can simply want more of.
  for (const f of ["coach_action", "coach_card", "coach_read", "client_assistant",
                   "coach_workout_tools", "celebration", "food_parse", "recipe_ai",
                   "movement_explain"] as const) {
    assert.equal(DEFAULT_LIMITS[f], 60, `${f} should be raised to 60`);
  }
  // NOT raised, each for its own reason — a blanket sweep would have taken
  // these with it, and one of them writes rows.
  assert.equal(DEFAULT_LIMITS.food_photo, 20, "the most expensive client call there is");
  assert.equal(DEFAULT_LIMITS.plan_build, 1, "rebuilding a meal plan twice a day is not a use case");
  assert.equal(DEFAULT_LIMITS.workout_build, 8, "this one WRITES; a loop does damage, not spend");
});

test("no cap was raised past the point where it stops being a cap", () => {
  // A limit of 500 is not a limit, it is a bill. The kill switch is the real
  // guard, but a per-day number that can never bite is worse than honest.
  for (const [f, v] of Object.entries(DEFAULT_LIMITS)) {
    if (v == null) continue;
    assert.ok(v <= 60, `${f} is ${v} — above 60 nothing is being limited`);
  }
});

test("the server tells the client the limit, and the screen does not invent one", () => {
  // Dustin can raise one client's limit in client_app_settings. A hard-coded
  // "60" on screen would then be a lie to that client specifically.
  assert.match(code(METER), /limit: e\.limit/, "capBody must carry the enforced limit");
  assert.match(code(SHEET), /setCappedLimit\(typeof lim === "number" \? lim : null\)/);
  assert.match(code(SHEET), /limit=\{cappedLimit\}/, "…and pass it to the takeover");
  // The copy renders it conditionally, so a missing limit degrades to a
  // sentence that still reads properly rather than "of null each".
  assert.match(code(TAKEOVER), /limit \? ` of \$\{limit\} each` : ""/);
});

test("it shows once a day, not on every hit", () => {
  // Second and third hits get the one-line chat message. A full-screen
  // interruption every time would be the thing people learn to dismiss unread.
  const t = code(TAKEOVER);
  assert.match(t, /localStorage\.getItem\(SEEN_KEY\) === today/, "keyed by the day");
  assert.match(t, /localStorage\.setItem\(SEEN_KEY, today\)/, "and records the view");
  assert.match(t, /timeZone: "America\/Chicago"/, "Chicago, so it resets when the SERVER's day does");
  // Storage disabled must mean "do not show", never "show every single time".
  assert.match(t, /catch \{[\s\S]{0,200}return false;/);
});

test("the takeover cannot trap somebody with no way out", () => {
  const t = code(TAKEOVER);
  assert.match(t, /e\.key === "Escape"/, "escape must close it");
  assert.match(t, /onClick=\{onClose\}/, "and there must be a button");
  assert.match(t, /overflowY: "auto"/, "it is long — it has to scroll on a phone");
  assert.match(t, /role="dialog"/);
  assert.match(t, /aria-modal="true"/);
});

test("every tip points at something that actually exists", () => {
  // A tip that sends a client to a feature we have not built is worse than no
  // tip. These are the four surfaces the tips name.
  const t = TAKEOVER;
  assert.match(t, /My Meals/, "save-a-meal exists — shipped 14 Aug");
  assert.match(t, /last weight for every movement is already on the logger/);
  assert.match(t, /home screen/);
  assert.match(t, /Scroll up/);
});

test("it says plainly that logging is unaffected", () => {
  // The actual damage on 15 Aug was not the missing answer, it was Jennifer
  // concluding the app had stopped working for her and going quiet.
  const t = TAKEOVER;
  assert.match(t, /Everything else in the app still works exactly as normal/);
  assert.match(t, /Nothing you logged is affected/);
  assert.match(t, /none of it can run out/);
});

test("it does not scold", () => {
  // A client hitting the limit is a client USING the thing. Tone matters here
  // more than anywhere else in the app.
  // Comments stripped: the file's own header explains the rule by quoting the
  // phrasing to avoid, and matching that would fail the test on its rationale.
  const t = code(TAKEOVER).toLowerCase();
  for (const bad of ["too much", "overuse", "excessive", "abuse", "wasted", "you should have"]) {
    assert.ok(!t.includes(bad), `takeover copy should not say "${bad}"`);
  }
});
