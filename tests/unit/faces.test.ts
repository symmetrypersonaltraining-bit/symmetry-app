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
test("a client who never logged is never nudged ABOUT LOGGING", () => {
  // The original rule, and still the important half: someone who never built
  // the habit is never told off for breaking it. What changed on 13 Aug is that
  // total silence now gets a different screen, which does not mention logging —
  // so the assertion is about the TIER, not merely about being left alone.
  for (const daysSinceLog of [3, 7, 14]) {
    assert.equal(
      lapseMood({ daysSinceLog, priorLoggedDays28: 0 }),
      null,
      `nudged a client with no logging history after ${daysSinceLog} days`
    );
    assert.equal(lapseMood({ daysSinceLog, priorLoggedDays28: 5 }), null, "5 days in 28 is not a habit to have fallen off");
  }
  // Past three weeks it is no longer about logging at all.
  for (const daysSinceLog of [21, 60]) {
    const tier = lapseMood({ daysSinceLog, priorLoggedDays28: 0 });
    assert.equal(tier, "quiet", `after ${daysSinceLog} days of total silence somebody should say hello`);
    assert.notEqual(tier, "concerned");
    assert.notEqual(tier, "stern");
  }
});

test("the ladder is relative to the client's own normal, not an absolute count", () => {
  // Daily logger, three days quiet — that is a real gap for them.
  assert.equal(lapseMood({ daysSinceLog: 3, priorLoggedDays28: 26 }), "concerned");
  // Twice-a-week logger, same three days — completely unremarkable.
  assert.equal(lapseMood({ daysSinceLog: 3, priorLoggedDays28: 9 }), null);
  assert.equal(lapseMood({ daysSinceLog: 6, priorLoggedDays28: 9 }), "concerned");
});

// Robert had been silent 25 days and the ladder said nothing, because he never
// logged regularly enough to have "fallen off". Correct by the rule, wrong about
// the person. Dustin: "Robert could definitely get a little nudge."
test("total silence gets its own gentler screen, whatever their logging history", () => {
  // Never logged, three weeks of nothing at all.
  assert.equal(lapseMood({ daysSinceLog: 25, priorLoggedDays28: 4 }), "quiet");
  assert.equal(lapseMood({ daysSinceLog: 21, priorLoggedDays28: 0 }), "quiet");

  // But it must stay much slower than the logging rungs — a light user who
  // trained a fortnight ago is not missing.
  assert.equal(lapseMood({ daysSinceLog: 14, priorLoggedDays28: 4 }), null);
  assert.equal(lapseMood({ daysSinceLog: 3, priorLoggedDays28: 4 }), null);

  // Someone who WAS logging never gets the quiet screen — they get the ladder,
  // which knows more about them.
  assert.equal(lapseMood({ daysSinceLog: 25, priorLoggedDays28: 24 }), "stern");
});

test("the quiet screen never wears the disappointed face", async () => {
  // Someone who never logged has done nothing to disappoint anyone.
  const { faceSrc } = await import("../../src/lib/ai/faces");
  assert.notEqual(faceSrc("quiet"), faceSrc("concerned"));
  assert.notEqual(faceSrc("quiet"), faceSrc("stern"));
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

// ─────────────────────────────────────────────────────────────────────────────
// THE WHOLE POINT OF A REGISTRY IS THAT NOTHING BYPASSES IT.
//
// Dustin, 2026-08-13: "so the nutrition coach card, workout coach card,
// homescreen coach card all have new avatars and new voice w memory correct?"
//
// The honest answer at the time was "mostly", and the gaps were exactly the
// kind nobody spots: four surfaces still resolved a face without going through
// this file. Three called <AiBadge /> with no mood, which is not broken — it is
// the new art, just permanently neutral, so the face stops carrying any part of
// the message. The fourth, the bot in the group chat, was still pointing at
// /coachbot.png: the pre-sticker-set cartoon, so the same bot looked like two
// different characters depending on which screen you met it on.
//
// Neither shows up as an error. Both are only visible by looking at every
// surface at once, which is what this test does instead.
// ─────────────────────────────────────────────────────────────────────────────
test("nothing outside the registry points at the old cartoon", async () => {
  const { execSync } = await import("node:child_process");
  const hits = execSync(
    `grep -rn "coachbot.png" src/ --include=*.tsx --include=*.ts || true`,
    { encoding: "utf8", cwd: process.cwd() },
  )
    .split("\n")
    .filter(Boolean)
    // faces.ts owns FALLBACK_FACE; CoachBadge's mention is a comment telling
    // people NOT to wire it in.
    .filter((l) => !l.startsWith("src/lib/ai/faces.ts"))
    // Comment lines are not call sites. Covers //, {/* and a * continuation,
    // which is how every remaining mention of the old file is written: as a
    // note explaining why NOT to use it.
    .filter((l) => !/^\S+:\d+:\s*(\/\/|\{?\/\*|\*)/.test(l));
  assert.deepEqual(
    hits,
    [],
    "a surface resolves the old cartoon directly instead of through faceSrc():\n  " + hits.join("\n  "),
  );
});

test("the AI face on a client-facing card is never left at the default", async () => {
  const { execSync } = await import("node:child_process");
  // <AiBadge /> with no mood renders `neutral` forever. That is fine for a
  // decorative byline and wrong for a card whose whole job is to react to
  // something — a lapse, a PR, a nudge, this week's plan. Every call site has to
  // have made a choice; add new ones to this list only after checking that
  // "always neutral" is genuinely what that surface wants.
  const NEUTRAL_ON_PURPOSE = [
    // (empty — every current call site names a mood)
  ];
  const sites = execSync(`grep -rn "<AiBadge" src/ --include=*.tsx || true`, {
    encoding: "utf8",
    cwd: process.cwd(),
  })
    .split("\n")
    .filter(Boolean)
    .filter((l) => !/^\S+:\d+:\s*(\/\/|\{?\/\*|\*)/.test(l))
    .filter((l) => !l.includes("src/components/AiBadge.tsx"));

  const moodless = sites.filter((l) => !/\bmood=/.test(l));
  const unexpected = moodless.filter((l) => !NEUTRAL_ON_PURPOSE.some((ok) => l.includes(ok)));
  assert.deepEqual(
    unexpected,
    [],
    "these AI faces will render neutral no matter what is happening:\n  " + unexpected.join("\n  "),
  );
});
