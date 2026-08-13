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

// The takeover that uses this rule is the only full-screen one that is not good
// news, so the blast radius of getting it wrong is every client at once. These
// pin the two things that would make it a nuisance.
test("the lapse takeover shows at most twice per lapse, then stops", async () => {
  const fs2 = await import("node:fs");
  const src = fs2.readFileSync(process.cwd() + "/src/components/ClientTakeovers.tsx", "utf8");

  // The seen-key carries the date of their LAST LOG, so it is one key per
  // lapse rather than per day. A date-of-today key would re-fire every morning
  // for as long as they stayed away, which is the definition of pestering.
  assert.match(
    src,
    /lapse-\$\{tier\}-\$\{lastLog\}/,
    "the lapse seen-key is no longer stamped with the last-log date — it will re-fire daily"
  );
  assert.doesNotMatch(src, /lapse-\$\{tier\}-\$\{todayCT\}/, "stamping with today re-fires every morning");
});

test("the copy never mentions weight, and never frames it as a broken streak", async () => {
  const fs2 = await import("node:fs");
  const src = fs2.readFileSync(process.cwd() + "/src/components/ClientTakeovers.tsx", "utf8");
  const at = src.indexOf('pick.kind === "lapse"');
  // Style props are not copy: `fontWeight` is not the app mentioning weight.
  const block = src
    .slice(at, src.indexOf("const ch = pick.challenge", at))
    .replace(/\bfontWeight\b/g, "")
    .replace(/\bwindow\.location\.href = "[^"]*"/g, "");
  for (const banned of ["streak", "lbs", "pounds", "weight", "failed", "disappoint", "should have"]) {
    assert.ok(
      !new RegExp(`\\b${banned}\\b`, "i").test(block),
      `the lapse takeover says "${banned}" — this is the one screen that catches someone at their worst week`
    );
  }
});
