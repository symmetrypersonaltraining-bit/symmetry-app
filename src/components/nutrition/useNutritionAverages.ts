"use client";

// Nutrition v3 — shared range-averages hook. The single source for avg
// kcal/P/C/F per logged day, adherence %, and logging rate over a range.
// Extracted verbatim from AveragesStrip so the unified top card and any other
// consumer produce identical numbers — all computed through the canonical
// dailyTotals module.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogRow, PlanMeal } from "@/lib/nutrition/dailyTotals";
import { summariseLogRange } from "@/lib/nutrition/rangeAverages";

export type RangeKey = "1w" | "2w" | "4w" | "8w" | "custom";

export const AVG_RANGES: { key: RangeKey; label: string; days: number }[] = [
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
    } else {
      const rg = AVG_RANGES.find((x) => x.key === range)!;
      start = shiftDate(today, -(rg.days - 1));
    }
    const supabase = createClient();
    const [logsRes, targetRes] = await Promise.all([
      supabase.from("meal_adherence_logs").select("*").eq("client_id", clientId).gte("log_date", start).lte("log_date", end),
      supabase.from("macro_targets").select("calories, protein, carbs, fats").eq("client_id", clientId).lte("effective_date", end).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
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
    const tRow = targetRes.data as { calories: number; protein: number; carbs: number; fats: number } | null;
    const totalDays = diffDays(start, end) + 1;
    const sum = summariseLogRange(logs, pseudoMeals, {
      target: tRow
        ? {
            calories: Number(tRow.calories) || 0,
            protein: Number(tRow.protein) || 0,
            carbs: Number(tRow.carbs) || 0,
            fats: Number(tRow.fats) || 0,
          }
        : null,
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
      target: tRow ? { kcal: Number(tRow.calories) || 0, p: Number(tRow.protein) || 0, c: Number(tRow.carbs) || 0, f: Number(tRow.fats) || 0 } : null,
    });
    setLoading(false);
  }, [clientId, today, range, customStart, customEnd]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return { loading, result };
}
