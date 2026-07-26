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

// Every date the AI sees must be America/Chicago. log_date is written in Central time, so a
// UTC "today" is already tomorrow from ~7pm CDT — the exact hours clients log their food.
export const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
export function ctShiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export const COACH_SYSTEM_PROMPT = `You are the personal nutrition coach inside the Symmetry Personal Training app (physique coaching, trainer: Dustin). You are not a generic chatbot — you know THIS client: their name, their goal, their body-composition trend, their actual meal plan, and exactly how they've been eating. Speak to them by first name, like a coach who has watched their numbers all week. Be encouraging, honest, specific, and brief — no fluff, no lecture, no hedging platitudes. Ground every statement in the context data provided; never invent numbers. If the data is sparse (few logged days), say so plainly and keep advice modest. You may suggest small macro adjustments, but frame them as suggestions for the client to run by Dustin — plan changes are his call.

What makes your coaching stand out (do this every time there's data for it):
- Tie advice to their SPECIFIC goal and trend. A fat-loss client who's stalled hears something different from one dropping fast; a client above their protein target hears something different from one below it.
- Connect the dots: link their eating pattern to their weight/body-fat trajectory when both are present (e.g. "protein's been landing ~30g short and the scale's flat — let's shore that up before we touch calories").
- Name the single most useful thing right now. Don't list five observations; find the one that matters and be specific about it.
- Reference real meals from their plan by name when suggesting where to add or cut, instead of speaking in abstract macros.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"message":string,"suggestions":[{"label":string,"delta":{"p":number,"c":number,"f":number,"kcal":number}}]}

Rules:
- "message": 2-5 sentences max, plain text. Personal and specific to the data — never generic.
- The current day may be IN PROGRESS. NEVER describe today (todaySoFar) as "under" or "over" budget or as a full/complete day — it isn't finished. Base ALL averages, trends, and consistency judgments ONLY on completedDays. You may reference todaySoFar only as progress (e.g. "you're on pace" / "X left today"), never as a deficit/surplus verdict.
- Trends: use the signed AVERAGES deltas and the weight/body-fat trajectory lines exactly as given — they are the source of truth for direction. Do NOT recompute above/below or up/down yourself.
- "suggestions": 0-3 concrete, actionable tweaks (e.g. {"label":"Add a scoop of whey at breakfast","delta":{"p":25,"c":2,"f":1,"kcal":117}}). deltas are the daily macro change in grams / kcal (negative = reduce). Prefer tweaks that map to a real meal on their plan. Omit the array or leave it empty when nothing concrete applies.`;

export interface DayTotal {
  date: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  logged: number;
}

export interface TodaySoFar extends DayTotal {
  inProgress: true;
}

// Separate the still-in-progress current day from finished days. The coach must
// judge averages/trends/consistency ONLY on completedDays — a partial current
// day (e.g. 515 of 1963 kcal logged this morning) must never be scored as a
// deficit/surplus or dragged into averages. Pure + unit-tested.
export function splitTodayFromCompleted(
  dailyTotals: DayTotal[],
  today: string,
): { todaySoFar: TodaySoFar | null; completedDays: DayTotal[] } {
  const t = dailyTotals.find((d) => d.date === today);
  return {
    todaySoFar: t ? { ...t, inProgress: true } : null,
    completedDays: dailyTotals.filter((d) => d.date !== today),
  };
}


// Pre-computed averages vs targets with the direction spelled out, so the model
// never has to do arithmetic on the raw daily JSON (it was flipping above/below —
// e.g. calling carbs "below target" when the average was well above).
export function averagesVsTargetsLine(
  completedDays: DayTotal[],
  target: { calories: number; protein: number; carbs: number; fats: number } | null,
): string | null {
  if (!completedDays.length) return null;
  const n = completedDays.length;
  const s = completedDays.reduce((a, d) => ({ k: a.k + d.kcal, p: a.p + d.p, c: a.c + d.c, f: a.f + d.f }), { k: 0, p: 0, c: 0, f: 0 });
  const avg = { k: Math.round(s.k / n), p: Math.round(s.p / n), c: Math.round(s.c / n), f: Math.round(s.f / n) };
  if (!target) return `AVERAGES over ${n} completed days: ${avg.k} kcal, ${avg.p}g protein, ${avg.c}g carbs, ${avg.f}g fat (no targets set).`;
  const d = (a: number, t: number) => { const x = a - t; return `${x >= 0 ? "+" : ""}${x}g (${x > 0 ? "ABOVE" : x < 0 ? "BELOW" : "on"} target)`; };
  return `AVERAGES over ${n} completed days vs targets — these signed deltas are the SOURCE OF TRUTH for above/below; state them exactly, do NOT recompute the direction:\n- calories: avg ${avg.k} vs target ${target.calories} → ${avg.k - target.calories >= 0 ? "+" : ""}${avg.k - target.calories} (${avg.k > target.calories ? "ABOVE" : avg.k < target.calories ? "BELOW" : "on"})\n- protein: avg ${avg.p} vs target ${target.protein} → ${d(avg.p, target.protein)}\n- carbs: avg ${avg.c} vs target ${target.carbs} → ${d(avg.c, target.carbs)}\n- fat: avg ${avg.f} vs target ${target.fats} → ${d(avg.f, target.fats)}`;
}

// Daily totals through the canonical shared calculator — historical logs may
// reference archived plan versions, so plan items are fetched per meal_id
// (same pattern as AveragesStrip and coach/route.ts).
async function fetchDailyTotals(db: Db, clientId: string, days: number): Promise<DayTotal[]> {
  const end = CT_TODAY();
  const start = ctShiftDays(end, -(days - 1));

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

// The client's ACTUAL live meal plan (meals + foods), so the coach knows what's
// on the plan when asked "what's my meal plan / what should I eat for M3". Without
// this the model only sees macro totals and can't reference real meals.
export async function fetchMealPlanSummary(db: Db, clientId: string): Promise<string | null> {
  const { data: plan } = await db
    .from("meal_plans").select("id")
    .eq("client_id", clientId).eq("status", "live")
    .order("effective_date", { ascending: false }).limit(1).maybeSingle();
  const planId = (plan as { id: string } | null)?.id;
  if (!planId) return null;
  const { data: meals } = await db
    .from("meals")
    .select("name, timing, position, meal_items(food, amount, unit, is_unlimited, protein, carbs, fats, position)")
    .eq("meal_plan_id", planId).order("position");
  const list = (meals as unknown as { name: string; timing: string | null; meal_items: { food: string; amount: number | null; unit: string | null; is_unlimited: boolean; protein: number | null; carbs: number | null; fats: number | null; position: number | null }[] }[]) || [];
  if (!list.length) return null;
  return list.map((m) => {
    const its = (m.meal_items || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
    const foods = its.map((it) => {
      const amt = it.is_unlimited ? "" : (it.amount != null ? `${it.amount}${it.unit ? " " + it.unit : ""} ` : "");
      return `${amt}${it.food}${it.is_unlimited ? " (unlimited)" : ""}`;
    });
    let p = 0, c = 0, f = 0;
    for (const it of its) { p += Number(it.protein) || 0; c += Number(it.carbs) || 0; f += Number(it.fats) || 0; }
    const macro = (p || c || f) ? ` [~${Math.round(4 * p + 4 * c + 9 * f)} kcal · ${Math.round(p)}P/${Math.round(c)}C/${Math.round(f)}F]` : "";
    return `- ${m.name}${m.timing ? " (" + m.timing + ")" : ""}: ${foods.join(", ") || "—"}${macro}`;
  }).join("\n");
}

// Who the client is — name, goal, experience, cadence, injuries — so the coach
// speaks to a real person with a real objective instead of a generic "client".
// Returns both a context line and the first name for addressing them.
export async function fetchClientProfile(
  db: Db,
  clientId: string,
): Promise<{ line: string; firstName: string | null } | null> {
  const { data } = await db
    .from("clients")
    .select("name, primary_goal, secondary_goals, experience_level, training_frequency, days_per_week, injuries_limitations, injuries, start_date")
    .eq("id", clientId)
    .maybeSingle();
  const c = data as {
    name: string | null; primary_goal: string | null; secondary_goals: string | null;
    experience_level: string | null; training_frequency: number | null; days_per_week: number | null;
    injuries_limitations: string | null; injuries: string | null; start_date: string | null;
  } | null;
  if (!c) return null;
  const firstName = (c.name || "").trim().split(/\s+/)[0] || null;
  const parts: string[] = [];
  if (c.name) parts.push(`Name: ${c.name}`);
  if (c.primary_goal) parts.push(`Primary goal: ${c.primary_goal}`);
  if (c.secondary_goals) parts.push(`Secondary goals: ${c.secondary_goals}`);
  if (c.experience_level) parts.push(`Experience: ${c.experience_level}`);
  const freq = c.days_per_week ?? c.training_frequency;
  if (freq) parts.push(`Trains ${freq}x/week`);
  const inj = [c.injuries_limitations, c.injuries].filter(Boolean).join("; ");
  if (inj) parts.push(`Injuries/limitations: ${inj}`);
  if (c.start_date) parts.push(`Coaching since: ${c.start_date}`);
  if (!parts.length) return { line: "", firstName };
  return { line: `CLIENT PROFILE — coach this person specifically, by name, toward their goal:\n- ${parts.join("\n- ")}`, firstName };
}

// Body-composition trajectory (not just the latest point) so the coach can say
// "down 4.2 lbs over 3 weeks, ~1.4/wk" and tie eating to results. metrics arrive
// newest-first; we walk oldest→newest and report first vs latest with a weekly rate.
export function trajectoryLines(
  metrics: { metric_date: string; weight: number | null; body_fat_pct: number | null }[],
): string[] {
  const out: string[] = [];
  const asc = metrics.slice().reverse(); // oldest → newest
  const trend = (key: "weight" | "body_fat_pct", label: string, unit: string) => {
    const pts = asc.filter((m) => m[key] != null) as { metric_date: string; weight: number; body_fat_pct: number }[];
    if (pts.length < 2) {
      if (pts.length === 1) out.push(`${label}: ${pts[0][key]}${unit} (${pts[0].metric_date}) — only one data point, no trend yet.`);
      return;
    }
    const first = pts[0], last = pts[pts.length - 1];
    const delta = Number((last[key] - first[key]).toFixed(1));
    const days = Math.max(1, (Date.parse(last.metric_date) - Date.parse(first.metric_date)) / 86400000);
    const perWeek = Number(((delta / days) * 7).toFixed(2));
    const dir = delta < 0 ? "down" : delta > 0 ? "up" : "flat";
    out.push(
      `${label} trajectory: ${first[key]}${unit} (${first.metric_date}) → ${last[key]}${unit} (${last.metric_date}) = ${dir} ${Math.abs(delta)}${unit} over ${Math.round(days)} days (~${perWeek >= 0 ? "+" : ""}${perWeek}${unit}/wk). This direction is the source of truth — do NOT recompute it.`
    );
  };
  trend("weight", "Weight", " lb");
  trend("body_fat_pct", "Body fat", "%");
  return out;
}

export async function assembleCoachContext(db: Db, clientId: string): Promise<string> {
  const today = CT_TODAY();
  const [dailyTotals, targetRes, metricsRes, planSummary, profile] = await Promise.all([
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
    fetchMealPlanSummary(db, clientId),
    fetchClientProfile(db, clientId),
  ]);

  const target = targetRes.data as { calories: number; protein: number; carbs: number; fats: number } | null;
  const metrics = (metricsRes.data as { metric_date: string; weight: number | null; body_fat_pct: number | null }[]) || [];
  const latestWeight = metrics.find((m) => m.weight != null);
  const latestBf = metrics.find((m) => m.body_fat_pct != null);

  const lines: string[] = [`Today's date: ${today}`];
  if (profile?.line) lines.push(profile.line);
  lines.push(
    target
      ? `Daily macro targets: ${target.calories} kcal, ${target.protein}g protein, ${target.carbs}g carbs, ${target.fats}g fat.`
      : "No macro targets set (open plan — awareness/baseline logging)."
  );
  if (latestWeight) lines.push(`Latest weight: ${latestWeight.weight} lbs (${latestWeight.metric_date}).`);
  if (latestBf) lines.push(`Latest body fat: ${latestBf.body_fat_pct}% (${latestBf.metric_date}).`);
  for (const t of trajectoryLines(metrics)) lines.push(t);
  lines.push(
    planSummary
      ? `The client's ACTUAL current meal plan (their planned meals + foods — use this when they ask about their plan, a specific meal, or what to eat):\n${planSummary}`
      : "No structured meal plan on file (open/awareness plan)."
  );

  // Separate the in-progress current day from finished days so the model never
  // scores a partial day as a deficit/surplus or averages it in.
  const { todaySoFar, completedDays } = splitTodayFromCompleted(dailyTotals, today);
  const avgLine = averagesVsTargetsLine(completedDays, target);
  if (avgLine) lines.push(avgLine);
  lines.push(
    completedDays.length
      ? `completedDays — FINISHED days over the last 14 days (only days with logs; "logged" = meals logged that day). Use ONLY these for averages, trends and consistency:\n${JSON.stringify(completedDays)}`
      : "completedDays: none (no finished logged days in the last 14 days)."
  );
  lines.push(
    todaySoFar
      ? `todaySoFar — the CURRENT day, IN PROGRESS and NOT finished. Do NOT judge it as under/over budget or include it in averages; reference it only as progress:\n${JSON.stringify(todaySoFar)}`
      : "todaySoFar: nothing logged yet today."
  );
  return lines.join("\n");
}
