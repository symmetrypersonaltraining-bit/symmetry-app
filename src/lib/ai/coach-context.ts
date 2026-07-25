// Shared coach context assembly for the nutrition AI chat endpoints.
// Extracted so /api/nutrition-ai/act can fall through to the exact coach
// behavior (/api/nutrition-ai/coach keeps its own in-file copy tonight — the
// two must stay in sync; migrate coach/route.ts onto this module when that
// file is next touched).
//
// The context is the client's last 14 days of daily totals computed through
// the canonical dailyTotals module (same numbers as the macro bar / charts /
// averages strip), plus current macro targets and latest weight / body fat.

import { Db } from "@/lib/ai/scope";
import { computeDayTotals, LogRow, PlanMeal } from "@/lib/nutrition/dailyTotals";

export const COACH_SYSTEM_PROMPT = `You are the nutrition coach assistant inside the Symmetry Personal Training app (physique coaching, trainer: Dustin). You speak directly to the client: encouraging, honest, specific, brief — no fluff, no lecture. Ground every statement in the context data provided; never invent numbers. If the data is sparse (few logged days), say so and keep advice modest. You may suggest small macro adjustments, but frame them as suggestions for the client to discuss with Dustin — plan changes are his call.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"message":string,"suggestions":[{"label":string,"delta":{"p":number,"c":number,"f":number,"kcal":number}}]}

Rules:
- "message": 2-5 sentences max, plain text.
- "suggestions": 0-3 concrete, actionable tweaks (e.g. {"label":"Add a scoop of whey at breakfast","delta":{"p":25,"c":2,"f":1,"kcal":117}}). deltas are the daily macro change in grams / kcal (negative = reduce). Omit the array or leave it empty when nothing concrete applies.`;

interface DayTotal {
  date: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  logged: number;
}

// Daily totals through the canonical shared calculator — historical logs may
// reference archived plan versions, so plan items are fetched per meal_id
// (same pattern as AveragesStrip and coach/route.ts).
async function fetchDailyTotals(db: Db, clientId: string, days: number): Promise<DayTotal[]> {
  const end = new Date().toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  const start = startDate.toISOString().slice(0, 10);

  const { data: logs } = await db
    .from("meal_adherence_logs")
    .select("*")
    .eq("client_id", clientId)
    .gte("log_date", start)
    .lte("log_date", end);
  const rows = ((logs as (LogRow & { log_date: string })[]) || []);
  if (!rows.length) return [];

  const mealIds = Array.from(new Set(rows.map((r) => r.meal_id).filter((x): x is string => !!x)));
  const pseudoMeals: PlanMeal[] = [];
  if (mealIds.length) {
    const { data: items } = await db
      .from("meal_items")
      .select("id, meal_id, food, amount, unit, is_unlimited, protein, carbs, fats, position")
      .in("meal_id", mealIds);
    const byMeal: Record<string, PlanMeal> = {};
    for (const it of ((items as Record<string, unknown>[]) || [])) {
      const mid = String(it.meal_id);
      if (!byMeal[mid]) byMeal[mid] = { id: mid, name: "", timing: null, position: 0, meal_items: [] };
      byMeal[mid].meal_items.push({
        id: String(it.id), food: String(it.food || ""), amount: it.amount as number | null,
        unit: it.unit as string | null, is_unlimited: !!it.is_unlimited,
        protein: it.protein as number | null, carbs: it.carbs as number | null,
        fats: it.fats as number | null, position: Number(it.position) || 0,
      });
    }
    pseudoMeals.push(...Object.values(byMeal));
  }

  const byDate: Record<string, (LogRow & { log_date: string })[]> = {};
  for (const l of rows) (byDate[l.log_date] ||= []).push(l);
  return Object.keys(byDate)
    .sort()
    .map((date) => {
      const t = computeDayTotals(byDate[date], pseudoMeals);
      return { date, kcal: Math.round(t.kcal), p: Math.round(t.protein), c: Math.round(t.carbs), f: Math.round(t.fats), logged: t.loggedCount };
    })
    // Days holding only placeholder rows (__unlogged / __removed edits) aren't
    // logged days — don't show the model a fake 0-kcal day.
    .filter((d) => d.logged > 0);
}

export async function assembleCoachContext(db: Db, clientId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const [dailyTotals, targetRes, metricsRes] = await Promise.all([
    fetchDailyTotals(db, clientId, 14),
    db
      .from("macro_targets")
      .select("calories, protein, carbs, fats, effective_date")
      .eq("client_id", clientId)
      .lte("effective_date", today)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("metrics")
      .select("metric_date, weight, body_fat_pct")
      .eq("client_id", clientId)
      .order("metric_date", { ascending: false })
      .limit(10),
  ]);

  const target = targetRes.data as { calories: number; protein: number; carbs: number; fats: number } | null;
  const metrics = (metricsRes.data as { metric_date: string; weight: number | null; body_fat_pct: number | null }[]) || [];
  const latestWeight = metrics.find((m) => m.weight != null);
  const latestBf = metrics.find((m) => m.body_fat_pct != null);

  const lines: string[] = [`Today's date: ${today}`];
  lines.push(
    target
      ? `Daily macro targets: ${target.calories} kcal, ${target.protein}g protein, ${target.carbs}g carbs, ${target.fats}g fat.`
      : "No macro targets set (open plan — awareness/baseline logging)."
  );
  if (latestWeight) lines.push(`Latest weight: ${latestWeight.weight} lbs (${latestWeight.metric_date}).`);
  if (latestBf) lines.push(`Latest body fat: ${latestBf.body_fat_pct}% (${latestBf.metric_date}).`);
  lines.push(
    dailyTotals.length
      ? `Daily totals for the last 14 days (only days with logs; "logged" = meals logged that day):\n${JSON.stringify(dailyTotals)}`
      : "No meals logged in the last 14 days."
  );
  return lines.join("\n");
}
