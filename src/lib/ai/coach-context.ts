// Shared coach context assembly for the nutrition AI chat endpoints.
// /api/nutrition-ai/coach, /api/nutrition-ai/act and /api/coach/focus all
// assemble through this module, so every AI surface sees identical numbers.
//
// The context is the client's last 14 days of daily totals computed through
// the canonical dailyTotals module (same numbers as the macro bar / charts /
// averages strip), plus current macro targets and latest weight / body fat,
// plus the week-over-week block from weekly-context.ts (last complete week vs
// this week so far) — which is what the weekly copy is written from.

import { Db } from "@/lib/ai/scope";
import { computeDayTotals, LogRow, PlanMeal } from "@/lib/nutrition/dailyTotals";
import { weeklyNumbersBlockSafe } from "@/lib/ai/weekly-context";

// Every date the AI sees must be America/Chicago. log_date is written in Central time, so a
// UTC "today" is already tomorrow from ~7pm CDT — the exact hours clients log their food.
export const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
export function ctShiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

import { APP_GUIDE } from "@/lib/ai/app-guide";

export const COACH_SYSTEM_PROMPT = `You are the personal nutrition coach inside the Symmetry Personal Training app (physique coaching, trainer: Dustin). You are not a generic chatbot — you know THIS client: their name, their goal, their body-composition trend, their actual meal plan, and exactly how they've been eating. Speak to them by first name, like a coach who has watched their numbers all week. Be encouraging, honest, specific, and brief — no fluff, no lecture, no hedging platitudes. Ground every statement in the context data provided; never invent numbers. If the data is sparse (few logged days), say so plainly and keep advice modest. You may suggest small macro adjustments, but frame them as suggestions for the client to run by Dustin — plan changes are his call.

What makes your coaching stand out — the best AI coach in any fitness app (do this every time there's data for it):
- Tie advice to their SPECIFIC goal and trend. A fat-loss client who's stalled hears something different from one dropping fast; a client above their protein target hears something different from one below it.
- Give EXACT numbers to hit a goal. When they ask (or when it's the useful thing to say) how to hit a target like "lose 2 lbs this week," use the ENERGY BALANCE block: tell them the precise daily calorie total to eat and compare it to what they've actually been averaging ("you've been at ~1,900 — drop to ~1,650 and that's your 2 lb week"). Real numbers from their own data, never a generic formula, never invented. If the block says maintenance can't be estimated yet, say what you'd need (a week of logging, a fresh weigh-in) instead of guessing.
- Connect the dots: link their eating pattern to their weight/body-fat trajectory when both are present ("protein's landing ~30g short and the scale's flat — let's shore that up before we touch calories").
- Name the single most useful thing right now. Don't list five observations; find the one that matters and be specific.
- Reference real meals from their plan by name when suggesting where to add or cut, instead of abstract macros.
- Coach like a human who's in their corner: CONGRATULATE real wins specifically (a logging streak, hitting protein all week, the scale moving the right way), ENCOURAGE when it's grindy, and be honest when something's off — without scolding.
- When you need info the data can't give you (energy, sleep, hunger, why a stretch of days went off-plan), ASK ONE pointed question and tell them to send the answer to Dustin ("How are your afternoons feeling energy-wise? Shoot Dustin a message — if you're dragging we may shift carbs earlier."). One question, not an interrogation.
- Land light humor here and there — a quick, warm one-liner, never forced, never at their expense, never in a genuinely tough moment. You're a sharp coach with a personality, not a stiff report.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"message":string,"suggestions":[{"label":string,"delta":{"p":number,"c":number,"f":number,"kcal":number}}]}

Rules:
- "message": up to ~6 sentences, plain text. Personal and specific to the data — never generic, never a wall of text.
- The current day may be IN PROGRESS. NEVER describe today (todaySoFar) as "under" or "over" budget or as a full/complete day — it isn't finished. Base ALL averages, trends, and consistency judgments ONLY on completedDays. You may reference todaySoFar only as progress (e.g. "you're on pace" / "X left today"), never as a deficit/surplus verdict.
- Trends & targets: use the signed AVERAGES deltas, the weight/body-fat trajectory lines, and the ENERGY BALANCE calorie numbers exactly as given — they are the source of truth. Do NOT recompute above/below, up/down, or any calorie target yourself.
- "suggestions": 0-3 concrete, actionable tweaks (e.g. {"label":"Add a scoop of whey at breakfast","delta":{"p":25,"c":2,"f":1,"kcal":117}}). deltas are the daily macro change in grams / kcal (negative = reduce). Prefer tweaks that map to a real meal on their plan. Omit the array or leave it empty when nothing concrete applies.

${APP_GUIDE}
`;

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

// The differentiator: ADAPTIVE energy balance computed from THIS client's own
// logged intake and weigh-ins — not a Mifflin/Harris formula. If over the window
// they averaged X kcal and their weight moved Y lb/wk, their true maintenance is
// X + (weekly lb change × 3500 / 7). From that we hand the model an exact
// calorie ladder ("to lose 2 lb/wk, eat ~N kcal/day") so it states real numbers
// specific to this person and never has to guess or do the arithmetic itself.
export function energyBalanceLines(
  completedDays: DayTotal[],
  metrics: { metric_date: string; weight: number | null }[],
  target: { calories: number } | null,
): string[] {
  const avgIntake = completedDays.length
    ? Math.round(completedDays.reduce((a, d) => a + d.kcal, 0) / completedDays.length)
    : null;
  if (!completedDays.length || completedDays.length < 4 || avgIntake == null) {
    return ["ENERGY BALANCE: not enough finished logged days yet (need ~4+ with real intake) to estimate maintenance from this client's own data. Tell them logging consistently for a week lets you dial in exact calorie targets — don't invent a maintenance number before then."];
  }

  // Surplus/deficit vs the trainer's target is ALWAYS accurate — it's just
  // measured intake vs a set number. This is the safe anchor when the weight
  // data is too thin/noisy to trust an adaptive maintenance estimate.
  const targetLine = target
    ? `- Avg intake ~${avgIntake} kcal/day vs their set target of ${target.calories} → ${avgIntake - target.calories >= 0 ? "+" : ""}${avgIntake - target.calories} kcal/day (${avgIntake > target.calories ? "OVER" : avgIntake < target.calories ? "UNDER" : "on"} target). This is exact — state it as-is.`
    : `- Avg intake ~${avgIntake} kcal/day over ${completedDays.length} completed days (no set target on file).`;

  // Adaptive maintenance = avgIntake − (weekly lb change × 3500 / 7). Only
  // TRUSTWORTHY when the weigh-ins are numerous and span enough time that the
  // trend isn't dominated by a single water-weight spike. A least-squares slope
  // over weigh-ins INSIDE the intake window keeps intake and weight aligned.
  const startDate = completedDays.map((d) => d.date).sort()[0];
  // Widen slightly (7 days before the intake window) so a client who weighs
  // weekly still gets 3+ points, without reaching back to a stale month-old bulk.
  const trendStart = ctShiftDays(startDate, -7);
  const pts = metrics
    .filter((m) => m.weight != null && m.metric_date >= trendStart)
    .map((m) => ({ t: (Date.parse(m.metric_date) - Date.parse(trendStart)) / 86400000, w: m.weight as number }))
    .sort((a, b) => a.t - b.t);
  const spanDays = pts.length ? pts[pts.length - 1].t - pts[0].t : 0;

  // Require ≥3 recent weigh-ins spanning ≥10 days for a reliable rate.
  let reliable = pts.length >= 3 && spanDays >= 10;
  let lbPerWeek = 0, maintenance = 0;
  if (reliable) {
    const n = pts.length;
    const mt = pts.reduce((a, p) => a + p.t, 0) / n;
    const mw = pts.reduce((a, p) => a + p.w, 0) / n;
    let num = 0, den = 0;
    for (const p of pts) { num += (p.t - mt) * (p.w - mw); den += (p.t - mt) ** 2; }
    const slope = den ? num / den : 0; // lb/day
    lbPerWeek = Number((slope * 7).toFixed(2));
    maintenance = Math.round(avgIntake - slope * 3500);
    // Sanity: reject physiologically implausible results (a single water-weight
    // spike or a logging gap can still sneak through even a regression). Real
    // maintenance sits in a sane absolute band AND within ~10–19× bodyweight in
    // lb (below that floor means a spike is masquerading as a fast gain), and a
    // real weekly trend is modest.
    const latestW = metrics.find((m) => m.weight != null)?.weight ?? null;
    const belowWeightFloor = latestW != null && (maintenance < latestW * 10 || maintenance > latestW * 19);
    if (maintenance < 1400 || maintenance > 4500 || Math.abs(lbPerWeek) > 2.5 || belowWeightFloor) reliable = false;
  }

  if (!reliable) {
    return [
      `ENERGY BALANCE — anchor to the TARGET (the weight data is too thin/noisy right now for a trustworthy maintenance estimate — needs ≥3 weigh-ins over ≥10 days without a big water swing):
${targetLine}
- Do NOT state a specific maintenance or "eat N kcal to lose X" number this time — it would be a guess. Coach from the target instead: if they're over, closing that gap is the move; the trainer's target already has the intended deficit built in.
- Naturally encourage more consistent weigh-ins (same time, same conditions) so an exact, personalized maintenance can be computed soon.`,
    ];
  }

  const eatFor = (ratePerWeek: number) => Math.round(maintenance - (ratePerWeek * 3500) / 7); // + = lose, - = gain
  const dir = lbPerWeek < 0 ? "losing" : lbPerWeek > 0 ? "gaining" : "holding";
  return [
    `ENERGY BALANCE — computed from THIS client's REAL logged intake + weigh-in TREND (adaptive maintenance, not a formula). Source of truth; state as real numbers, do NOT recompute:
${targetLine}
- Weight trend: ${dir} ~${Math.abs(lbPerWeek)} lb/wk (least-squares over ${pts.length} weigh-ins across ${Math.round(spanDays)} days).
- Estimated maintenance at current activity: ~${maintenance} kcal/day.
- Exact daily calories to hit a goal from here (keep protein near target):
  · maintain weight → ~${maintenance} kcal
  · lose 0.5 lb/wk → ~${eatFor(0.5)} kcal
  · lose 1 lb/wk → ~${eatFor(1)} kcal
  · lose 1.5 lb/wk → ~${eatFor(1.5)} kcal
  · lose 2 lb/wk → ~${eatFor(2)} kcal (aggressive — fine short-term, clear long stretches with Dustin)
  · gain 0.25 lb/wk (lean) → ~${eatFor(-0.25)} kcal
When they ask "what do I eat to lose 2 lbs this week," give the exact number above and compare it to their ~${avgIntake} average (e.g. "trim ~${Math.max(0, avgIntake - eatFor(2))} kcal/day"). Estimate sharpens as they log more.`,
  ];
}

// TRAINING-side context (workout adherence, streak, weigh-in cadence, body-comp
// trend, logging consistency) — the non-nutrition picture. Shared by the
// client-facing "Coach's Read" card and the trainer's AI focus-option suggester.
export async function assembleTrainingContext(db: Db, clientId: string): Promise<string> {
  const today = CT_TODAY();
  const win30 = ctShiftDays(today, -29);
  const win7 = ctShiftDays(today, -6);
  const win14 = ctShiftDays(today, -13);

  const [profile, swRes, metricsRes, adherenceRes, weekBlock] = await Promise.all([
    fetchClientProfile(db, clientId),
    db
      .from("scheduled_workouts")
      .select("scheduled_date, status")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .gte("scheduled_date", win30)
      .lte("scheduled_date", today)
      .order("scheduled_date", { ascending: true }),
    db
      .from("metrics")
      .select("metric_date, weight, body_fat_pct")
      .eq("client_id", clientId)
      .order("metric_date", { ascending: false })
      .limit(10),
    db
      .from("meal_adherence_logs")
      .select("log_date")
      .eq("client_id", clientId)
      .gte("log_date", win14)
      .lte("log_date", today),
    weeklyNumbersBlockSafe(db, clientId),
  ]);

  const sw = (swRes.data as { scheduled_date: string; status: string | null }[]) || [];
  const done = (s: string) => s === "completed";
  const total30 = sw.length;
  const done30 = sw.filter((w) => done(w.status || "")).length;
  const in7 = sw.filter((w) => w.scheduled_date >= win7);
  const total7 = in7.length;
  const done7 = in7.filter((w) => done(w.status || "")).length;

  const completedDates = Array.from(new Set(sw.filter((w) => done(w.status || "")).map((w) => w.scheduled_date))).sort();
  let streak = 0;
  if (completedDates.length) {
    let cursor = today;
    const setD = new Set(completedDates);
    if (!setD.has(cursor)) cursor = ctShiftDays(cursor, -1);
    while (setD.has(cursor)) { streak++; cursor = ctShiftDays(cursor, -1); }
  }

  const metrics = (metricsRes.data as { metric_date: string; weight: number | null; body_fat_pct: number | null }[]) || [];
  const latestWeighIn = metrics.find((m) => m.weight != null || m.body_fat_pct != null);
  const daysSinceWeighIn = latestWeighIn
    ? Math.round((Date.parse(today) - Date.parse(latestWeighIn.metric_date)) / 86400000)
    : null;

  const adh = (adherenceRes.data as { log_date: string }[]) || [];
  const loggedDays14 = new Set(adh.map((a) => a.log_date)).size;

  const lines: string[] = [`Today's date: ${today}`];
  if (profile?.line) lines.push(profile.line);
  lines.push(
    `WORKOUT ADHERENCE: last 30 days ${done30}/${total30} scheduled sessions completed; last 7 days ${done7}/${total7} completed. Current completed-session streak: ${streak} day${streak === 1 ? "" : "s"}.`
  );
  for (const t of trajectoryLines(metrics)) lines.push(t);
  lines.push(
    daysSinceWeighIn == null
      ? "WEIGH-INS: none on file yet — a first weigh-in would let Dustin track progress."
      : `WEIGH-INS: last one was ${daysSinceWeighIn} day${daysSinceWeighIn === 1 ? "" : "s"} ago (${latestWeighIn!.metric_date}).${daysSinceWeighIn >= 10 ? " That's getting stale — a fresh weigh-in would help." : ""}`
  );
  lines.push(`FOOD-LOGGING CONSISTENCY: logged on ${loggedDays14} of the last 14 days (context only — do not give a nutrition breakdown here).`);
  if (weekBlock) lines.push(weekBlock);
  return lines.join("\n");
}

export async function assembleCoachContext(db: Db, clientId: string): Promise<string> {
  const today = CT_TODAY();
  const [dailyTotals, targetRes, metricsRes, planSummary, profile, weekBlock] = await Promise.all([
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
    weeklyNumbersBlockSafe(db, clientId),
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
  for (const l of energyBalanceLines(completedDays, metrics, target)) lines.push(l);
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
  // Calendar-week view on top of the rolling 14-day one. The rolling window
  // answers "how are they doing"; this answers "how did LAST week go and what
  // should this week be about" — which is what the weekly copy is written from.
  if (weekBlock) lines.push(weekBlock);
  return lines.join("\n");
}
