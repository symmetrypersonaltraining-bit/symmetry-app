import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pickPlanForDate, PLAN_SELECT } from "../../src/lib/nutrition/resolvePlan";

/**
 * EDITING TODAY'S PLAN MUST NOT REWRITE LAST WEEK.
 *
 * Claudine Ocon, 13 Aug: "Omfg i replaced one of the meals for a recipe i made
 * and the clanker changed ALL the meals not only for today but days before
 * (looks like just this week)... i had to manually change amounts to 0 and the
 * clanker put all the amounts back."
 *
 * Right on every count, and none of it was the AI. Her real rows:
 *
 *   meal_plans v2  eff 2026-07-09  archived 2026-08-14 00:46 UTC
 *   meal_plans v3  eff 2026-08-13  live, created_by_client, 15 meals, all new ids
 *
 * Replacing ONE meal cloned the plan and archived the original — which is
 * correct and deliberate, so the trainer's prescription is never mutated. What
 * was not correct is that the resolver only ever fetched status = 'live', so
 * the archived version disappeared from the candidate set and every past day
 * fell through to `?? mealPlan` — today's plan. Two consequences:
 *
 *   1. last week's menu was redrawn as this week's, retroactively;
 *   2. her "I didn't eat that" zeros came back. They live in
 *      meal_adherence_logs.item_overrides keyed by meal_item ID, and the clone
 *      minted new item rows, so on a past day the keys matched nothing and each
 *      item rendered at its full planned amount — silently adding calories to
 *      days that were already finished.
 *
 * These are her actual ids and dates.
 */

const ROOT = process.cwd();

const V2 = { id: "1e22a02c-2c45-4302-9bd6-a7e4783d27bf", version_number: 2, effective_date: "2026-07-09", status: "archived", day_group: null };
const V3 = { id: "b5bcdafe-048a-4a95-a6a1-8e17b68660c6", version_number: 3, effective_date: "2026-08-13", status: "live", day_group: null };
/** Ordered as the query returns them: effective_date desc. */
const CANDIDATES = [V3, V2];

test("a day before the clone resolves to the plan that actually governed it", () => {
  for (const d of ["2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12"]) {
    const got = pickPlanForDate(CANDIDATES, d);
    assert.equal(got?.version_number, 2, `${d} resolved to v${got?.version_number} — that day's history has been rewritten`);
  }
});

test("today and after resolve to the new plan", () => {
  assert.equal(pickPlanForDate(CANDIDATES, "2026-08-13")?.version_number, 3);
  assert.equal(pickPlanForDate(CANDIDATES, "2026-09-01")?.version_number, 3);
});

test("a live plan is never out-sorted by an abandoned future one", () => {
  // The hazard introduced by fetching archived rows at all: 'archived' cannot
  // distinguish "superseded" from "cancelled", so a cancelled plan dated next
  // month would otherwise start governing in September.
  const cancelledFuture = { id: "x", version_number: 4, effective_date: "2026-09-01", status: "archived", day_group: null };
  const set = [cancelledFuture, V3, V2];
  assert.equal(pickPlanForDate(set, "2026-09-05")?.version_number, 3, "a cancelled plan took over from the live one");
  assert.equal(pickPlanForDate(set, "2026-08-20")?.version_number, 3);
});

test("candidates with no status still behave exactly as before", () => {
  // Every caller that predates this change passes plans without a status; none
  // of them may shift underneath.
  const a = { id: "a", version_number: 1, effective_date: "2026-01-01", day_group: null };
  const b = { id: "b", version_number: 2, effective_date: "2026-06-01", day_group: null };
  assert.equal(pickPlanForDate([b, a], "2026-07-01")?.version_number, 2);
  assert.equal(pickPlanForDate([b, a], "2026-03-01")?.version_number, 1);
});

test("a day-group plan still wins over the everyday one, in both passes", () => {
  const mon = { id: "m", version_number: 3, effective_date: "2026-08-13", status: "live", day_group: [1] };
  const every = { id: "e", version_number: 2, effective_date: "2026-07-09", status: "live", day_group: null };
  assert.equal(pickPlanForDate([mon, every], "2026-08-17")?.id, "m", "2026-08-17 is a Monday");
  assert.equal(pickPlanForDate([mon, every], "2026-08-18")?.id, "e");
});

test("the query fetches superseded versions and selects the status it sorts on", () => {
  const src = readFileSync(join(ROOT, "src/lib/nutrition/resolvePlan.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /\.in\("status", \["live", "archived"\]\)/, "the resolver is back to live-only — history will be rewritten again");
  assert.match(PLAN_SELECT, /\bstatus\b/, "status dropped out of PLAN_SELECT; every plan then reads as live");
});

test("the past never falls back to today's plan", () => {
  const src = readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  // The bare `?? mealPlan` is the exact line that rewrote her week.
  assert.ok(
    !/pickPlanForDate\(set, selectedDate\) \?\? mealPlan \?\? null/.test(src),
    "the unconditional fallback to the current plan is back — a past day with no resolvable plan will be redrawn as today",
  );
  assert.match(src, /selectedDate >= today \? \(?mealPlan/);
});
