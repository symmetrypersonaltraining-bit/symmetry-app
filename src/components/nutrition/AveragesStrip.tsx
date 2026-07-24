"use client";

// Nutrition v3 — shared averages strip (client + trainer). Range picker →
// avg kcal / P / C / F per logged day, adherence %, logging rate. Everything
// is computed through the canonical dailyTotals module so the numbers always
// match the macro bar and the charts.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeDayTotals, adherencePct, LogRow, PlanMeal } from "@/lib/nutrition/dailyTotals";

type RangeKey = "1w" | "2w" | "4w" | "8w" | "custom";
const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "1w", label: "1W", days: 7 },
  { key: "2w", label: "2W", days: 14 },
  { key: "4w", label: "4W", days: 28 },
  { key: "8w", label: "8W", days: 56 },
  { key: "custom", label: "Custom", days: 0 },
];

function shiftDate(iso: string, delta: number): string {
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

interface Result {
  loggedDays: number;
  totalDays: number;
  kcal: number; p: number; c: number; f: number;
  adherence: number | null; // avg % across days with plan logs
  target: { kcal: number; p: number; c: number; f: number } | null;
}

export default function AveragesStrip({ clientId, today }: { clientId: string; today: string }) {
  const [range, setRange] = useState<RangeKey>("1w");
  const [customStart, setCustomStart] = useState(shiftDate(today, -6));
  const [customEnd, setCustomEnd] = useState(today);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let start = today, end = today;
    if (range === "custom") {
      start = customStart; end = customEnd;
      if (start > end) { const t = start; start = end; end = t; }
    } else {
      const rg = RANGES.find((x) => x.key === range)!;
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
    const byDate: Record<string, LogRow[]> = {};
    for (const l of logs) (byDate[l.log_date] ||= []).push(l);
    let kcal = 0, p = 0, c = 0, f = 0, adhSum = 0, adhDays = 0;
    const days = Object.keys(byDate);
    for (const d of days) {
      const t = computeDayTotals(byDate[d], pseudoMeals);
      kcal += t.kcal; p += t.protein; c += t.carbs; f += t.fats;
      // adherence: avg proration across the day's plan-band logs (positions ≤ 20).
      const planLogs = byDate[d].filter((l) => l.meal_position <= 20 && !l.item_overrides?.__removed && !l.item_overrides?.__unlogged && !l.item_overrides?.__custom?.unlogged && l.adherence);
      if (planLogs.length) {
        let s = 0;
        for (const l of planLogs) s += l.adherence === "Off-plan" ? 0.75 : (adherencePct(l.adherence) ?? 0);
        adhSum += (s / planLogs.length) * 100;
        adhDays++;
      }
    }
    const denom = days.length || 1;
    const tRow = targetRes.data as { calories: number; protein: number; carbs: number; fats: number } | null;
    setResult({
      loggedDays: days.length,
      totalDays: diffDays(start, end) + 1,
      kcal: kcal / denom, p: p / denom, c: c / denom, f: f / denom,
      adherence: adhDays ? adhSum / adhDays : null,
      target: tRow ? { kcal: Number(tRow.calories) || 0, p: Number(tRow.protein) || 0, c: Number(tRow.carbs) || 0, f: Number(tRow.fats) || 0 } : null,
    });
    setLoading(false);
  }, [clientId, today, range, customStart, customEnd]);

  useEffect(() => { load(); }, [load]);

  const stat = (label: string, value: string, sub?: string) => (
    <div className="text-center flex-1">
      <p className="font-extrabold" style={{ color: "var(--brand-text)", fontSize: 17, lineHeight: 1.1 }}>{value}</p>
      <p style={{ color: "var(--brand-text-secondary)", fontSize: 9, fontWeight: 700, letterSpacing: 0.8 }}>{label}</p>
      {sub && <p style={{ color: "var(--brand-text-secondary)", fontSize: 9 }}>{sub}</p>}
    </div>
  );

  return (
    <div className="rounded-2xl p-3.5 mb-3" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
      <div className="flex gap-1 mb-2.5 flex-wrap">
        {RANGES.map((rg) => (
          <button key={rg.key} onClick={() => setRange(rg.key)} className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={range === rg.key ? { background: "var(--brand-primary)", color: "#fff" } : { background: "var(--brand-bg)", color: "var(--brand-text-secondary)" }}>
            {rg.label}
          </button>
        ))}
      </div>
      {range === "custom" && (
        <div className="flex gap-2 items-center mb-2.5 text-xs">
          <input type="date" value={customStart} max={today} onChange={(e) => setCustomStart(e.target.value)} className="flex-1 rounded-lg px-2 py-1.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", colorScheme: "dark light" }} />
          <span style={{ color: "var(--brand-text-secondary)" }}>to</span>
          <input type="date" value={customEnd} max={today} onChange={(e) => setCustomEnd(e.target.value)} className="flex-1 rounded-lg px-2 py-1.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", colorScheme: "dark light" }} />
        </div>
      )}
      {loading ? (
        <p className="text-center py-4 text-sm" style={{ color: "var(--brand-text-secondary)" }}>Loading…</p>
      ) : !result || result.loggedDays === 0 ? (
        <p className="text-center py-4 text-sm" style={{ color: "var(--brand-text-secondary)" }}>No logs in this range yet.</p>
      ) : (
        <>
          <div className="flex items-center">
            {stat("AVG CAL", Math.round(result.kcal).toLocaleString(), result.target ? `target ${Math.round(result.target.kcal).toLocaleString()}` : undefined)}
            {stat("PROTEIN", Math.round(result.p) + "g", result.target ? `of ${Math.round(result.target.p)}g` : undefined)}
            {stat("CARBS", Math.round(result.c) + "g", result.target ? `of ${Math.round(result.target.c)}g` : undefined)}
            {stat("FAT", Math.round(result.f) + "g", result.target ? `of ${Math.round(result.target.f)}g` : undefined)}
          </div>
          <div className="flex items-center mt-3 pt-3" style={{ borderTop: "1px dashed var(--brand-border)" }}>
            {stat("ADHERENCE", result.adherence != null ? Math.round(result.adherence) + "%" : "—", "plan meals")}
            {stat("LOGGING RATE", Math.round((result.loggedDays / result.totalDays) * 100) + "%", `${result.loggedDays} of ${result.totalDays} days`)}
          </div>
        </>
      )}
    </div>
  );
}
