// Fetches the rows behind the week-over-week block. All the arithmetic lives in
// weekly-numbers.ts (pure, tested); this file only reads.
//
// Food totals go through summariseLogRange — the same function the averages
// strip and the This Week card use — so a number the AI states and a number the
// client sees on screen come from one implementation. That was the whole point:
// "triple check the numbers because they have been off here and there."

import { Db } from "@/lib/ai/scope";
import { LogRow, PlanMeal } from "@/lib/nutrition/dailyTotals";
import { summariseLogRange } from "@/lib/nutrition/rangeAverages";
import {
  EMPTY_WEEK,
  MacroTarget,
  WeekFacts,
  WeekWindow,
  lastWeekWindow,
  thisWeekWindow,
  weeklyNumbersBlock,
} from "@/lib/ai/weekly-numbers";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

/**
 * Plan items for the meals these logs reference. Historical logs can point at
 * archived plan versions, so items are fetched by meal_id rather than off the
 * live plan — same pattern as AveragesStrip and coach-context.
 */
async function fetchPseudoMeals(db: Db, logs: (LogRow & { log_date: string })[]): Promise<PlanMeal[]> {
  const mealIds = Array.from(new Set(logs.map((l) => l.meal_id).filter((x): x is string => !!x)));
  if (!mealIds.length) return [];
  const [{ data: items }, { data: meals }] = await Promise.all([
    db
      .from("meal_items")
      .select("id, meal_id, food, amount, unit, is_unlimited, protein, carbs, fats, position")
      .in("meal_id", mealIds),
    // The meal's own position matters: summariseLogRange uses the set of plan
    // positions to tell a real plan slot from a quick-add extra. Leaving it 0
    // made every 6th/7th meal look like a snack (EXTRA_POSITIONS is [6, 7]) and
    // quietly dropped it out of the adherence average.
    db.from("meals").select("id, name, timing, position").in("id", mealIds),
  ]);
  const metaById = new Map<string, { name?: string | null; timing?: string | null; position?: number | null }>();
  for (const m of ((meals as Record<string, unknown>[]) || [])) {
    metaById.set(String(m.id), m as { name?: string | null; timing?: string | null; position?: number | null });
  }
  const byMeal: Record<string, PlanMeal> = {};
  // Seed from the meals themselves so a plan slot with no items still registers
  // its position (Dustin has two: "M4a" and the mandatory evening snack).
  for (const [mid, meta] of metaById) {
    byMeal[mid] = {
      id: mid,
      name: String(meta?.name ?? ""),
      timing: (meta?.timing ?? null) as string | null,
      position: Number(meta?.position) || 0,
      meal_items: [],
    };
  }
  for (const it of ((items as Record<string, unknown>[]) || [])) {
    const mid = String(it.meal_id);
    if (!byMeal[mid]) {
      const meta = metaById.get(mid);
      byMeal[mid] = {
        id: mid,
        name: String(meta?.name ?? ""),
        timing: (meta?.timing ?? null) as string | null,
        position: Number(meta?.position) || 0,
        meal_items: [],
      };
    }
    byMeal[mid].meal_items.push({
      id: String(it.id),
      food: String(it.food || ""),
      amount: it.amount as number | null,
      unit: it.unit as string | null,
      is_unlimited: !!it.is_unlimited,
      protein: it.protein as number | null,
      carbs: it.carbs as number | null,
      fats: it.fats as number | null,
      position: Number(it.position) || 0,
    });
  }
  return Object.values(byMeal);
}

function factsFor(
  window: WeekWindow,
  logs: (LogRow & { log_date: string })[],
  pseudoMeals: PlanMeal[],
  workouts: { scheduled_date: string; status: string | null }[],
  weighIns: { metric_date: string; weight: number | null }[],
  // The day still in progress. Left out of the averages (never out of
  // loggedDays) so a half-eaten day can't understate the week.
  inProgressDate?: string,
): WeekFacts {
  const inWin = <T>(rows: T[], key: string) =>
    rows.filter((r) => {
      const d = String((r as Record<string, unknown>)[key]);
      return d >= window.start && d <= window.end;
    });

  const wLogs = inWin(logs, "log_date");
  const sum = summariseLogRange(wLogs, pseudoMeals, {
    excludeDates: inProgressDate ? [inProgressDate] : [],
  });
  const sw = inWin(workouts, "scheduled_date");
  const wi = inWin(weighIns, "metric_date")
    .filter((m) => m.weight != null)
    .sort((a, b) => (a.metric_date < b.metric_date ? -1 : 1));

  return {
    ...EMPTY_WEEK(window),
    loggedDays: sum.loggedDays,
    avgDays: sum.avgDays,
    avg: sum.loggedDays ? { kcal: sum.kcal, p: sum.p, c: sum.c, f: sum.f } : null,
    adherence: sum.adherence,
    workoutsScheduled: sw.length,
    workoutsCompleted: sw.filter((w) => w.status === "completed").length,
    weightStart: wi.length ? Number(wi[0].weight) : null,
    weightEnd: wi.length ? Number(wi[wi.length - 1].weight) : null,
  };
}

export interface WeeklyComparison {
  today: string;
  last: WeekFacts;
  current: WeekFacts;
  /** The target in force during LAST week. */
  target: MacroTarget | null;
  /** The target in force now — differs whenever it was changed mid-comparison. */
  currentTarget: MacroTarget | null;
  /** The pre-computed block to hand a model verbatim. */
  block: string;
}

function toTarget(row: unknown): MacroTarget | null {
  const t = row as { calories?: unknown; protein?: unknown; carbs?: unknown; fats?: unknown } | null;
  if (!t) return null;
  return {
    calories: Number(t.calories) || 0,
    protein: Number(t.protein) || 0,
    carbs: Number(t.carbs) || 0,
    fats: Number(t.fats) || 0,
  };
}

/**
 * Last complete week vs this week so far, for one client.
 * `today` is injectable so callers (and tests) can pin the date.
 */
export async function fetchWeeklyComparison(db: Db, clientId: string, today = CT_TODAY()): Promise<WeeklyComparison> {
  const last = lastWeekWindow(today);
  const current = thisWeekWindow(today);
  // One read spanning both windows, then split in memory — two windows, two
  // round trips per table would be four extra queries per client per week.
  const from = last.start;
  const to = current.end;

  const [logsRes, swRes, metricsRes, lastTargetRes, curTargetRes] = await Promise.all([
    db.from("meal_adherence_logs").select("*").eq("client_id", clientId).gte("log_date", from).lte("log_date", to),
    db
      .from("scheduled_workouts")
      .select("scheduled_date, status")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to),
    db
      .from("metrics")
      .select("metric_date, weight")
      .eq("client_id", clientId)
      .gte("metric_date", from)
      .lte("metric_date", to),
    // Each week gets the target that was actually in force during it. The old
    // single query bounded by `to` (this week's END — a future Saturday) meant a
    // target set today could be used to grade a week that closed a fortnight
    // ago. Live check on 2026-07-31: Dustin's last week was measured against a
    // target that took effect 2026-07-30, turning "29g BELOW protein" into
    // "1g ABOVE" and pointing the coaching the wrong way.
    db
      .from("macro_targets")
      .select("calories, protein, carbs, fats")
      .eq("client_id", clientId)
      .lte("effective_date", last.end)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("macro_targets")
      .select("calories, protein, carbs, fats")
      .eq("client_id", clientId)
      .lte("effective_date", today)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const logs = ((logsRes.data as (LogRow & { log_date: string })[]) || []);
  const pseudoMeals = await fetchPseudoMeals(db, logs);
  const workouts = (swRes.data as { scheduled_date: string; status: string | null }[]) || [];
  const weighIns = (metricsRes.data as { metric_date: string; weight: number | null }[]) || [];
  const currentTarget = toTarget(curTargetRes.data);
  // No target existed yet when last week ran → fall back to the current one
  // rather than printing no comparison at all.
  const target = toTarget(lastTargetRes.data) ?? currentTarget;

  const lastFacts = factsFor(last, logs, pseudoMeals, workouts, weighIns);
  const currentFacts = factsFor(current, logs, pseudoMeals, workouts, weighIns, today);

  return {
    today,
    last: lastFacts,
    current: currentFacts,
    target,
    currentTarget,
    block: weeklyNumbersBlock(lastFacts, currentFacts, target, currentTarget),
  };
}

/** Never let a context failure take down the surface that asked for it. */
export async function weeklyNumbersBlockSafe(db: Db, clientId: string): Promise<string | null> {
  try {
    const cmp = await fetchWeeklyComparison(db, clientId);
    return cmp.block;
  } catch (e) {
    console.error("weekly numbers block failed (continuing without it)", e);
    return null;
  }
}
