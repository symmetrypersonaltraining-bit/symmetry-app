import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ALL_MOODS, faceSrc, lapseMood, winMood, surfaceMood } from "../../src/lib/ai/faces";

const ROOT = process.cwd();

// The registry is only worth having if the art is actually there. A mood whose
// file is missing renders a broken image on a client's home screen — visible to
// them, invisible in a diff, and impossible to notice in review.
test("every mood resolves to a file that exists", () => {
  const missing: string[] = [];
  for (const mood of ALL_MOODS) {
    const src = faceSrc(mood);
    const file = path.join(ROOT, "public", src.replace(/^\//, ""));
    if (!fs.existsSync(file)) missing.push(`${mood} -> ${src}`);
  }
  assert.deepEqual(missing, [], `moods with no artwork:\n  ${missing.join("\n  ")}`);
});

test("an unknown mood degrades to the old cartoon instead of a broken image", () => {
  assert.equal(faceSrc(undefined), "/bots/neutral.webp");
  assert.equal(faceSrc("not-a-mood" as never), "/coachbot.png");
});

// The rule Dustin actually asked for, 2026-08-12: "I have several clients that
// don't do it at all... try to keep it only to people that were logging
// consistently and fell off, not ones that have never logged before at all."
//
// The failure mode is not a wrong picture. It is the app nagging a client who
// never signed up for food logging, every day, forever.
test("a client who never logged is never nudged about lapsing", () => {
  for (const daysSinceLog of [3, 7, 14, 60]) {
    assert.equal(
      lapseMood({ daysSinceLog, priorLoggedDays28: 0 }),
      null,
      `nudged a client with no logging history after ${daysSinceLog} days`
    );
    assert.equal(lapseMood({ daysSinceLog, priorLoggedDays28: 5 }), null, "5 days in 28 is not a habit to have fallen off");
  }
});

test("the ladder is relative to the client's own normal, not an absolute count", () => {
  // Daily logger, three days quiet — that is a real gap for them.
  assert.equal(lapseMood({ daysSinceLog: 3, priorLoggedDays28: 26 }), "concerned");
  // Twice-a-week logger, same three days — completely unremarkable.
  assert.equal(lapseMood({ daysSinceLog: 3, priorLoggedDays28: 9 }), null);
  assert.equal(lapseMood({ daysSinceLog: 6, priorLoggedDays28: 9 }), "concerned");
});

test("it escalates once, and stops", () => {
  assert.equal(lapseMood({ daysSinceLog: 2, priorLoggedDays28: 26 }), null);
  assert.equal(lapseMood({ daysSinceLog: 3, priorLoggedDays28: 26 }), "concerned");
  assert.equal(lapseMood({ daysSinceLog: 7, priorLoggedDays28: 26 }), "stern");
  // There is no third rung. The loudest face in the set is not reachable from
  // missed logging, on purpose.
  assert.equal(lapseMood({ daysSinceLog: 90, priorLoggedDays28: 28 }), "stern");
});

test("a PR outranks everything else happening that day", () => {
  assert.equal(winMood({ isPr: true, streakDays: 40, hitGoal: true }), "pr");
  assert.equal(winMood({ streakDays: 40 }), "streak");
  assert.equal(winMood({ hitGoal: true, streakDays: 8 }), "hype");
  assert.equal(winMood({ streakDays: 8 }), "cool");
  assert.equal(winMood({ fullDayLogged: true }), "happy");
});

test("each mounted surface has a face of its own", () => {
  assert.equal(surfaceMood("nutrition"), "nutrition");
  assert.equal(surfaceMood("logger"), "lifting");
  assert.equal(surfaceMood("home"), "plan");
  assert.equal(surfaceMood("anything-new"), "neutral");
});
