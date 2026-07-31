// The canonical range summary: average kcal/P/C/F per logged day and adherence
// % over a set of meal_adherence_logs rows.
//
// This used to live inline inside useNutritionAverages, which meant every other
// surface that wanted "how did they eat over this window" wrote its own loop —
// and they drifted. Dustin: "triple check the numbers because they have been
// off here and there and not accurate." So there is now exactly ONE
// implementation, it is pure, and it is unit-tested. The averages strip, the
// week summary card and the weekly AI context all call this.
//
// Averages are PER LOGGED DAY, not per calendar day. A week with three logged
// days reports the average of those three — days with no logs at all are not
// counted as zeros, because a day nobody logged is missing data, not a 0 kcal
// day.

import { computeDayTotals, adherencePct, isExtraLog, LogRow, PlanMeal } from "@/lib/nutrition/dailyTotals";

export interface RangeSummary {
  /** Distinct dates that carry at least one log row. */
  loggedDays: number;
  /** Averages per logged day. 0 when nothing is logged. */
  kcal: number;
  p: number;
  c: number;
  f: number;
  /** Average % adherence across days that have plan meals logged. null = no plan logs. */
  adherence: number | null;
}

export function summariseLogRange(
  logs: (LogRow & { log_date: string })[],
  pseudoMeals: PlanMeal[],
): RangeSummary {
  const byDate: Record<string, LogRow[]> = {};
  for (const l of logs) (byDate[l.log_date] ||= []).push(l);

  let kcal = 0, p = 0, c = 0, f = 0, adhSum = 0, adhDays = 0;
  const days = Object.keys(byDate);

  for (const d of days) {
    const t = computeDayTotals(byDate[d], pseudoMeals);
    kcal += t.kcal; p += t.protein; c += t.carbs; f += t.fats;

    // Adherence: average proration across the day's PLAN meals only.
    // "meal_position <= 20" alone is NOT the plan band. v3 moved quick-add snacks out of
    // the legacy 101+ range into EXTRA_POSITIONS [6, 7] and writes them adherence
    // "Off-plan", which scores 0.75 — so every snack landed inside the plan average and
    // dragged it down. Log all 6 plan meals Full, add one snack, and the card reported
    // (6 + 0.75) / 7 = 96% instead of 100% (confirmed: Dustin, 2026-07-20).
    // A snack that IS part of the plan carries a real meal_id, so isExtraLog keeps it in
    // the average; only genuine quick-adds are excluded.
    const dayLogs = byDate[d];
    const planPositions = new Set<number>(
      dayLogs.filter((l) => !!l.meal_id || !!l.item_overrides?.__custom).map((l) => l.meal_position),
    );
    const planLogs = dayLogs.filter(
      (l) =>
        l.meal_position <= 20 &&
        !isExtraLog(l, planPositions) &&
        !l.item_overrides?.__removed &&
        !l.item_overrides?.__unlogged &&
        !l.item_overrides?.__custom?.unlogged &&
        l.adherence,
    );
    if (planLogs.length) {
      let s = 0;
      for (const l of planLogs) s += l.adherence === "Off-plan" ? 0.75 : (adherencePct(l.adherence) ?? 0);
      adhSum += (s / planLogs.length) * 100;
      adhDays++;
    }
  }

  const denom = days.length || 1;
  return {
    loggedDays: days.length,
    kcal: kcal / denom,
    p: p / denom,
    c: c / denom,
    f: f / denom,
    adherence: adhDays ? adhSum / adhDays : null,
  };
}
