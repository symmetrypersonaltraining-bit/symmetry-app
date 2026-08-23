"use client";

// Nutrition v3 — shared range-averages hook. The single source for avg
// kcal/P/C/F per logged day, adherence %, and logging rate over a range.
// Extracted verbatim from AveragesStrip so the unified top card and any other
// consumer produce identical numbers — all computed through the canonical
// dailyTotals module.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogRow, PlanMeal, dayGroupMenuTarget } from "@/lib/nutrition/dailyTotals";
import { fetchLivePlans, pickPlanForDate, type DayGroupPlan } from "@/lib/nutrition/resolvePlan";

interface TargetRow { effective_date?: string | null; calories: number; protein: number; carbs: number; fats: number }
import { summariseLogRange } from "@/lib/nutrition/rangeAverages";

export type RangeKey = "wtd" | "1w" | "2w" | "4w" | "8w" | "custom";

export const AVG_RANGES: { key: RangeKey; label: string; days: number }[] = [
  // "wtd" has no fixed length — it is Sunday to today, so `days` is 0 and the
  // window is computed. See the comment on `weekToDateStart` below.
  { key: "wtd", label: "Week", days: 0 },
  { key: "1w", label: "1W", days: 7 },
  { key: "2w", label: "2W", days: 14 },
  { key: "4w", label: "4W", days: 28 },
  { key: "8w", label: "8W", days: 56 },
  { key: "custom", label: "Custom", days: 0 },
];

export interface AveragesResult {
  loggedDays: number;
  totalDays: number;
  kcal: number; p: number; c: number; f: number;
  /**
   * Logging consistency × macro accuracy, 0-100. Dustin, 2026-07-31:
   * "adherence should be based on consistently logging and hitting macros n
   * calories." Falls back to the old meal-status average when the client has no
   * macro target on file — `adherenceBasis` says which one ran.
   */
  adherence: number | null;
  /** Days logged ÷ days in the range, 0-100. */
  consistency: number | null;
  /** How close the logged days landed to target across cals/P/C/F, 0-100. */
  accuracy: number | null;
  adherenceBasis: "logging+macros" | "meal-status";
  target: { kcal: number; p: number; c: number; f: number } | null;
}

export function shiftDate(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
/**
 * Sunday of the week containing `iso`.
 *
 * Dustin, 2026-08-20: "Logic on the daily average needs to go by days so far
 * this week dont include days in the future for averages for tge week."
 *
 * The summary card was a ROLLING SEVEN DAYS labelled "7d". On a Thursday that
 * denominator is 7 even though the week is four days old, so logging Mon, Tue
 * and Wed read as "3 of 7 days · 43%" when it is three of four. Nothing was
 * counting a future date — the window simply was not the week, while being
 * labelled and read as one.
 *
 * Sunday-start matches `weekStartOf` in weekly-numbers.ts, `coach-context.ts`
 * ("weeks run Sunday to Saturday") and every other "This week" range in the UI.
 * A second definition of when a week starts is its own bug.
 */
export function weekToDateStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return shiftDate(iso, -dow);
}

function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function useNutritionAverages(
  clientId: string,
  today: string,
  range: RangeKey,
  customStart: string,
  customEnd: string,
  // Bump to force a refetch (e.g. after logging changes today's numbers).
  refreshKey?: unknown,
): { loading: boolean; result: AveragesResult | null } {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AveragesResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let start = today, end = today;
    if (range === "custom") {
      start = customStart; end = customEnd;
      if (start > end) { const t = start; start = end; end = t; }
    } else if (range === "wtd") {
      // Sunday → today. Never past today, so a day that has not happened can
      // never sit in the denominator.
      start = weekToDateStart(today);
    } else {
      const rg = AVG_RANGES.find((x) => x.key === range)!;
      start = shiftDate(today, -(rg.days - 1));
    }
    const supabase = createClient();
    const [logsRes, targetRes, planRows] = await Promise.all([
      supabase.from("meal_adherence_logs").select("*").eq("client_id", clientId).gte("log_date", start).lte("log_date", end),
      // EVERY target in force across the window, newest first — not just the
      // newest overall. A week that spans a target change used to be graded
      // end-to-end against the new numbers.
      supabase.from("macro_targets").select("effective_date, calories, protein, carbs, fats").eq("client_id", clientId).lte("effective_date", end).order("effective_date", { ascending: false }).limit(24),
      // The plans covering the window, so a DAY-GROUP client is scored against
      // the menu for that weekday. Only Tyler and Hassan have those; for
      // everyone else pickPlanForDate's menu is untagged and contributes
      // nothing here, because dayGroupMenuTarget refuses an untagged plan.
      fetchLivePlans(supabase, clientId, end, undefined, 0),
    ]);
    const logs = ((logsRes.data as (LogRow & { log_date: string })[]) || []);
    // Historical logs can reference archived plan versions — fetch their items
    // so prorated meals still contribute exact macros.
    const mealIds = Array.from(new Set(logs.map((l) => l.meal_id).filter((x): x is string => !!x)));
    const pseudoMeals: PlanMeal[] = [];
    if (mealIds.length) {
      const { data: items } = await supabase
        .from("meal_items")
        .select("id, meal_id, food, amount, unit, is_unlimited, protein, carbs, fats, position")
        .in("meal_id", mealIds);
      const byMeal: Record<string, PlanMeal> = {};
      for (const it of ((items as Record<string, unknown>[]) || [])) {
        const mid = String(it.meal_id);
        if (!byMeal[mid]) byMeal[mid] = { id: mid, name: "", timing: null, position: 0, meal_items: [] };
        byMeal[mid].meal_items.push({
          id: String(it.id), food: String(it.food || ""), amount: it.amount as number | null, unit: it.unit as string | null,
          is_unlimited: !!it.is_unlimited, protein: it.protein as number | null, carbs: it.carbs as number | null,
          fats: it.fats as number | null, position: Number(it.position) || 0,
        });
      }
      pseudoMeals.push(...Object.values(byMeal));
    }
    // Averages + adherence come from the single canonical implementation so
    // this strip, the week card and the weekly AI context can never disagree.
    // The target and the window length go in because adherence is now
    // consistency × accuracy, not a meal-status average.
    const targetRows = ((targetRes.data as TargetRow[] | null) || []);
    const tRow = targetRows[0] ?? null;
    const asMacro = (r: TargetRow | null) =>
      r ? { calories: Number(r.calories) || 0, protein: Number(r.protein) || 0, carbs: Number(r.carbs) || 0, fats: Number(r.fats) || 0 } : null;

    // What was in force on a given day. The day-group menu first — that is the
    // only case where a plan sets the numbers — then the macro_targets row that
    // had actually started by that date.
    const plans = (planRows || []) as DayGroupPlan[];
    const targetForDate = (d: string) => {
      const menu = dayGroupMenuTarget(pickPlanForDate(plans, d) as never);
      if (menu) return { calories: menu.kcal, protein: menu.protein, carbs: menu.carbs, fats: menu.fats };
      return asMacro(targetRows.find((r) => !r.effective_date || r.effective_date <= d) ?? null);
    };

    const totalDays = diffDays(start, end) + 1;
    const sum = summariseLogRange(logs, pseudoMeals, {
      target: asMacro(tRow),
      targetForDate,
      windowDays: totalDays,
    });
    setResult({
      loggedDays: sum.loggedDays,
      totalDays,
      kcal: sum.kcal, p: sum.p, c: sum.c, f: sum.f,
      adherence: sum.adherence,
      consistency: sum.consistency,
      accuracy: sum.accuracy,
      adherenceBasis: sum.adherenceBasis,
      // The reference line the strip prints. The END of the range, because
      // that is the target in force now; each DAY was scored on its own.
      target: tRow ? { kcal: Number(tRow.calories) || 0, p: Number(tRow.protein) || 0, c: Number(tRow.carbs) || 0, f: Number(tRow.fats) || 0 } : null,
    });
    setLoading(false);
  }, [clientId, today, range, customStart, customEnd]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return { loading, result };
}
