import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GOALS MUST STAY ADDITIVE.
 *
 * Dustin, approving the mock-up: "just make sure we run this carefully and do
 * not mess up the functionality of any of the charts or features visually on
 * the charts."
 *
 * The Progress screen is six components that already work and that clients look
 * at every week. The containment strategy is not "be careful" — it is that
 * goals are ONE new component mounted above them, so the blast radius of the
 * whole feature is three files that did not exist yesterday.
 *
 * This file is that promise, checkable. It is cheap now and it is the only
 * thing that will stop the fifth person to touch this feature from "just
 * tidying" a shared chart component to make their bit fit.
 */

const ROOT = process.cwd();
const PAGE = readFileSync(join(ROOT, "src/app/(app)/progress/page.tsx"), "utf8");

/** The components that were on Progress before goals existed. */
const PRE_EXISTING = [
  "MetricCards",
  "ConsistencyCalendar",
  "AchievementCard",
  "ProgressPhotos",
  "ThenVsNow",
  "PersonalBests",
];

test("every pre-existing card is still mounted, in the same place", () => {
  const missing = PRE_EXISTING.filter((c) => !PAGE.includes(`<${c} `));
  assert.deepEqual(missing, [], `a card was removed from Progress: ${missing.join(", ")}`);

  // And goals go ABOVE them rather than in between, which is what keeps the
  // screen recognisable to somebody who opens it every week.
  const goalsAt = PAGE.indexOf("<GoalsSection");
  assert.ok(goalsAt > -1, "GoalsSection is not mounted");
  for (const c of PRE_EXISTING) {
    assert.ok(PAGE.indexOf(`<${c} `) > goalsAt, `${c} now renders above the goal card`);
  }
});

test("the goals feature edits no existing component", () => {
  // The load-bearing claim. If any of the six ever imports the goals code, the
  // containment is gone and a bug in goals can take a working chart down.
  const leaks: string[] = [];
  for (const c of PRE_EXISTING) {
    const src = readFileSync(join(ROOT, `src/components/${c}.tsx`), "utf8");
    if (/@\/lib\/goals|GoalCard|GoalsSection|client_goals/.test(src)) leaks.push(c);
  }
  assert.deepEqual(
    leaks,
    [],
    `an existing Progress card now depends on the goals feature: ${leaks.join(", ")}`,
  );
});

test("GoalsSection renders nothing rather than breaking the screen", () => {
  // A Progress screen that fails because an optional new card threw would be a
  // bad trade for a feature not every client has yet.
  const src = readFileSync(join(ROOT, "src/components/GoalsSection.tsx"), "utf8");
  assert.match(src, /catch \{\s*\n?\s*return null;/, "GoalsSection no longer swallows its own errors");
  assert.match(
    src,
    /if \(!active\.length && !showNudge\) return null;/,
    "GoalsSection renders something for a client with no goal and no stale weigh-in",
  );
});

test("every displayed number comes from analyseGoal, not from local arithmetic", () => {
  // The rule the whole feature hangs on: the card, the chart and the coach must
  // be incapable of disagreeing. A client who catches the screen contradicting
  // itself stops believing the parts that were right.
  const card = readFileSync(join(ROOT, "src/components/GoalCard.tsx"), "utf8");
  assert.match(card, /analyseGoal\(goal, readings, today\)/);
  // The specific temptation is recomputing a rate inline for the copy.
  assert.ok(
    !/\/\s*7\s*\)\s*\*\s*7|weeksLeft\s*=/.test(card.replace(/const \{[^}]*\} = a;/g, "")),
    "GoalCard computes its own rate or weeks — it must read them off the analysis",
  );
});

test("the nudge fires only past the agreed threshold", () => {
  const src = readFileSync(join(ROOT, "src/components/GoalsSection.tsx"), "utf8");
  assert.match(
    src,
    /daysSince == null \|\| daysSince > WEIGH_IN_NUDGE_DAYS/,
    "the weigh-in nudge no longer respects WEIGH_IN_NUDGE_DAYS",
  );
  const goals = readFileSync(join(ROOT, "src/lib/goals.ts"), "utf8");
  assert.match(goals, /WEIGH_IN_NUDGE_DAYS = 7/, "Dustin asked for 7 days specifically");
});

test("the database allows only one running goal per metric", () => {
  // Two active weight goals means two goal lines and two required rates, and
  // the coach would have to pick one without being able to say why. Same lesson
  // as the duplicate-days bug the same night: if the database does not forbid
  // it, it happens, and it is found later by a confused person.
  const mig = execSync(`cat supabase/migrations/20260814_client_goals.sql`, { encoding: "utf8", cwd: ROOT });
  assert.match(mig, /create unique index if not exists uq_client_goal_one_active_per_metric/);
  assert.match(mig, /where status in \('proposed', 'active'\)/, "a proposed goal must also block a second one");
});
