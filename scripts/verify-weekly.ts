// DEV TOOL — not part of the app, the build or the test suite.
//
// Runs the REAL weekly-number functions over REAL rows pulled from the live
// project, so the block the AI is handed can be checked against the raw data by
// hand. This is how the three 2026-07-31 accuracy bugs were found (phantom
// logged day, plan slot 6/7 misread as a snack, last week graded against a
// target set after it ended) — unit tests pin them now, but when Dustin says
// "these numbers look off", start here.
//
//   npx tsx scripts/verify-weekly.ts /tmp/<client>.json [YYYY-MM-DD]
//
// The JSON payload is one object:
//   { logs:    meal_adherence_logs rows for the range (must include log_date),
//     plans:   [{ id, meals: [{ id, name, timing, position, meal_items: [...] }] }],
//     targets: [{ effective_date, calories, protein, carbs, fats }] }
// Pull it with a single json_build_object query via the Supabase MCP tool.
import fs from "node:fs";
import { summariseLogRange } from "../src/lib/nutrition/rangeAverages";
import { computeDayTotals, PlanMeal, LogRow } from "../src/lib/nutrition/dailyTotals";
import { lastWeekWindow, thisWeekWindow, weeklyNumbersBlock, EMPTY_WEEK } from "../src/lib/ai/weekly-numbers";

const TODAY = process.argv[3] || "2026-07-31";
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const logs = payload.logs as (LogRow & { log_date: string })[];

// Same pseudo-meal reconstruction the weekly context does: items by meal_id.
const mealsById = new Map<string, PlanMeal>();
for (const plan of payload.plans) {
  for (const m of plan.meals) {
    mealsById.set(m.id, {
      id: m.id, name: m.name, timing: m.timing, position: m.position,
      meal_items: (m.meal_items || []).map((i: Record<string, unknown>) => ({
        id: String(i.id), food: String(i.food || ""), amount: i.amount as number | null,
        unit: i.unit as string | null, is_unlimited: !!i.is_unlimited,
        protein: i.protein as number | null, carbs: i.carbs as number | null,
        fats: i.fats as number | null, position: Number(i.position) || 0,
      })),
    });
  }
}
const pseudoMeals = [...mealsById.values()];

const win = (w: { start: string; end: string }) =>
  logs.filter((l) => l.log_date >= w.start && l.log_date <= w.end);

const last = lastWeekWindow(TODAY);
const cur = thisWeekWindow(TODAY);

// Targets as-of each window, exactly as fetchWeeklyComparison does.
type T = { effective_date: string; calories: number; protein: number; carbs: number; fats: number };
const asOf = (iso: string) => {
  const rows = (payload.targets as T[] | undefined) || (payload.target ? [payload.target as T] : []);
  const hit = rows.filter((r) => r.effective_date <= iso)
    .sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1))[0];
  return hit ? { calories: +hit.calories, protein: +hit.protein, carbs: +hit.carbs, fats: +hit.fats } : null;
};

// Adherence is consistency × accuracy now, so each window has to carry its own
// target and its own day count into the summariser.
const opts = (w: { end: string; days: number }) => ({
  ...(w.end === TODAY ? { excludeDates: [TODAY] } : {}),
  target: asOf(w.end) ?? asOf(TODAY),
  windowDays: w.days,
});

for (const [label, w] of [["LAST", last], ["CURRENT", cur]] as const) {
  const rows = win(w);
  const s = summariseLogRange(rows, pseudoMeals, opts(w));
  console.log(`\n${label} ${w.start}..${w.end} (${w.days}d)  loggedDays=${s.loggedDays} avgDays=${s.avgDays}` +
    `  avg ${Math.round(s.kcal)}kcal ${Math.round(s.p)}P/${Math.round(s.c)}C/${Math.round(s.f)}F` +
    `  adherence ${s.adherence == null ? "n/a" : Math.round(s.adherence) + "%"}` +
    ` (${s.adherenceBasis}` +
    (s.consistency == null ? "" : `, consistency ${Math.round(s.consistency)}%`) +
    (s.accuracy == null ? "" : `, accuracy ${Math.round(s.accuracy)}%`) + ")");
  const byDate: Record<string, LogRow[]> = {};
  for (const l of rows) (byDate[l.log_date] ||= []).push(l);
  for (const d of Object.keys(byDate).sort()) {
    const t = computeDayTotals(byDate[d], pseudoMeals);
    console.log(`   ${d}  ${byDate[d].length} rows  ${Math.round(t.kcal)}kcal ` +
      `${Math.round(t.protein)}P/${Math.round(t.carbs)}C/${Math.round(t.fats)}F  ` +
      `logged=${t.loggedCount} pending=${t.pendingCount}  [` +
      byDate[d].map((l) => `${l.meal_position}:${l.adherence ?? "-"}`).join(" ") + "]");
  }
}

const facts = (w: typeof last) => {
  const s = summariseLogRange(win(w), pseudoMeals, opts(w));
  return { ...EMPTY_WEEK(w), loggedDays: s.loggedDays, avgDays: s.avgDays,
    avg: s.loggedDays ? { kcal: s.kcal, p: s.p, c: s.c, f: s.f } : null, adherence: s.adherence,
    consistency: s.consistency, accuracy: s.accuracy, adherenceBasis: s.adherenceBasis };
};
console.log("\n--- block the AI is handed ---\n");
console.log(weeklyNumbersBlock(facts(last), facts(cur), asOf(last.end) ?? asOf(TODAY), asOf(TODAY)));
