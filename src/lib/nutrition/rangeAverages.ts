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
//
// A "logged day" means a day with at least one REAL log row. Rows that exist
// only to record structure — a meal deleted for today (__removed), an unlogged
// placeholder — are not food. Counting those dates as logged days is how
// Dustin's week read 2261 kcal instead of 2713 on 2026-07-31: a single
// __removed row created a phantom 0 kcal day and divided the week by 6 instead
// of 5, which also flipped his protein from +32 ABOVE target to -17 BELOW.
//
// The day still in progress is excluded from the averages when the caller asks
// (excludeDates), for the same reason: half a day of food is not a data point
// about how someone is eating, and the AI states these figures as fact.

import { computeDayTotals, adherencePct, isExtraLog, LogRow, PlanMeal } from "@/lib/nutrition/dailyTotals";

/** Structural shape of a macro target. Kept local so this module never imports from ai/. */
export interface MacroTargetLike {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

// ── What "adherence" means, as of 2026-07-31 ────────────────────────────────
//
// Dustin: "adherence should be based on consistently logging and hitting
// macros n calories."
//
// It used to be the average of the per-meal status weights (Full 1, ½ 0.5,
// Off-plan 0.75 …). That measured how someone TAGGED their meals, not how they
// ate. Claudine logs everything "Off-plan", which scores 0.75, so her adherence
// read exactly 75% every single day of every week no matter what she put in her
// mouth — a number that could never move, and therefore never coach anyone.
//
// It is now two real things multiplied:
//
//   consistency = days logged ÷ days in the window
//   accuracy    = how close those days landed to target, across ALL FOUR of
//                 calories, protein, carbs and fat
//   adherence   = consistency × accuracy
//
// Multiplied, not blended, at Dustin's call: a day nobody logged is a miss,
// because it is one. Logging 5 of 7 days and nailing every one of them reads
// 71%, not 100% — and it moves the moment either half moves.
//
// Within 10% of a target is full credit (2000 kcal → 1800–2200 all score 1.0).
// Past that the score falls off in a straight line and reaches zero at 50% off,
// so one bad day dents the week instead of wrecking it.
//
// With no macro target on file there is nothing to be accurate against, so the
// old meal-status average is still used — `adherenceBasis` says which ran.

/** Inside this fraction of target = full credit. */
export const FULL_CREDIT_BAND = 0.1;
/** At or past this fraction off target = no credit. Linear ramp between the two. */
export const ZERO_CREDIT_BAND = 0.5;

/** How close one macro landed to its target, 0..1. null when there's no target to hit. */
export function macroHitScore(actual: number, target: number | null | undefined): number | null {
  if (!target || target <= 0) return null;
  const rel = Math.abs(actual - target) / target;
  if (rel <= FULL_CREDIT_BAND) return 1;
  if (rel >= ZERO_CREDIT_BAND) return 0;
  return 1 - (rel - FULL_CREDIT_BAND) / (ZERO_CREDIT_BAND - FULL_CREDIT_BAND);
}

/** One day's accuracy, 0..1 — the mean across calories, protein, carbs and fat. */
export function dayHitScore(
  totals: { kcal: number; protein: number; carbs: number; fats: number },
  target: MacroTargetLike | null | undefined,
): number | null {
  if (!target) return null;
  const parts = [
    macroHitScore(totals.kcal, target.calories),
    macroHitScore(totals.protein, target.protein),
    macroHitScore(totals.carbs, target.carbs),
    macroHitScore(totals.fats, target.fats),
  ].filter((x): x is number => x != null);
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

export interface RangeSummary {
  /** Distinct dates carrying at least one real log row. */
  loggedDays: number;
  /** Days actually behind the averages (loggedDays minus any excluded date). */
  avgDays: number;
  /** Averages per averaged day. 0 when nothing is logged. */
  kcal: number;
  p: number;
  c: number;
  f: number;
  /** consistency × accuracy, 0-100. Falls back to the meal-status average with no target. */
  adherence: number | null;
  /** Days logged ÷ days in the window, 0-100. null when the caller gave no window length. */
  consistency: number | null;
  /** How close the logged days landed to target, 0-100. null when there's no target. */
  accuracy: number | null;
  /** Which calculation produced `adherence` — so copy can describe it honestly. */
  adherenceBasis: "logging+macros" | "meal-status";
}

export interface SummariseOpts {
  /**
   * Dates to keep out of the averages — in practice the in-progress day. They
   * still count toward loggedDays (the client did log), they just don't get
   * averaged as if they were finished. Ignored when honouring it would leave
   * nothing to average.
   */
  excludeDates?: string[];
  /** The macro target in force for this window. Without it, accuracy can't be scored. */
  target?: MacroTargetLike | null;
  /**
   * Calendar days in the window — the denominator for consistency. Without it
   * there is no honest "of how many days", so consistency stays null and
   * adherence falls back to the meal-status average.
   */
  windowDays?: number;
}

export function summariseLogRange(
  logs: (LogRow & { log_date: string })[],
  pseudoMeals: PlanMeal[],
  opts: SummariseOpts = {},
): RangeSummary {
  const byDate: Record<string, LogRow[]> = {};
  for (const l of logs) (byDate[l.log_date] ||= []).push(l);

  // Which meal_positions are PLAN slots, decided once for the whole range.
  //
  // Deciding this per-day off "rows that carry a meal_id" is wrong whenever a
  // plan meal is logged Off-plan, because an off-plan row has no meal_id. With
  // EXTRA_POSITIONS = [6, 7], a client whose plan genuinely has 6 or 7 meals
  // then has that slot reclassified as a quick-add snack and dropped from the
  // adherence average entirely (confirmed: Dustin's plan is 7 meals; his M5 at
  // position 6 vanished from adherence on every day he ate off plan).
  // The live plan's own positions are authoritative; log-derived positions are
  // the fallback for archived plans.
  const planPositions = new Set<number>();
  for (const m of pseudoMeals || []) if (m.position > 0) planPositions.add(m.position);
  for (const l of logs) {
    if (l.meal_id || l.item_overrides?.__custom) planPositions.add(l.meal_position);
  }

  // A date counts only if it holds real food logs, not just structural rows.
  const realDays: string[] = [];
  const totalsByDate: Record<string, ReturnType<typeof computeDayTotals>> = {};
  for (const d of Object.keys(byDate)) {
    const t = computeDayTotals(byDate[d], pseudoMeals);
    if (t.loggedCount === 0) continue;
    totalsByDate[d] = t;
    realDays.push(d);
  }

  const excluded = new Set(opts.excludeDates || []);
  let avgDates = realDays.filter((d) => !excluded.has(d));
  // Never trade a real average for an empty one (first day of the week, or a
  // client whose only logged day is today).
  const fellBack = !avgDates.length;
  if (fellBack) avgDates = realDays;

  let kcal = 0, p = 0, c = 0, f = 0, adhSum = 0, adhDays = 0;
  let hitSum = 0, hitDays = 0;

  for (const d of avgDates) {
    const t = totalsByDate[d];
    kcal += t.kcal; p += t.protein; c += t.carbs; f += t.fats;

    // Accuracy half of adherence: how close this day landed to target.
    const hit = dayHitScore(t, opts.target);
    if (hit != null) { hitSum += hit; hitDays++; }

    // Adherence: average proration across the day's PLAN meals only.
    // "meal_position <= 20" alone is NOT the plan band. v3 moved quick-add snacks out of
    // the legacy 101+ range into EXTRA_POSITIONS [6, 7] and writes them adherence
    // "Off-plan", which scores 0.75 — so every snack landed inside the plan average and
    // dragged it down. Log all 6 plan meals Full, add one snack, and the card reported
    // (6 + 0.75) / 7 = 96% instead of 100% (confirmed: Dustin, 2026-07-20).
    // A snack that IS part of the plan sits at a plan position, so isExtraLog keeps it
    // in the average; only genuine quick-adds are excluded.
    const dayLogs = byDate[d];
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

  const denom = avgDates.length || 1;

  // Consistency: logged days over days in the window. A date deliberately kept
  // out of the averages comes out of the denominator too — today being half
  // eaten is not the same as today being skipped, and charging someone for a
  // day that hasn't finished yet is exactly the kind of wrong number this
  // module exists to stop.
  const excludedInWindow = fellBack ? 0 : realDays.filter((d) => excluded.has(d)).length;
  const windowDays = opts.windowDays == null ? null : Math.max(1, opts.windowDays - excludedInWindow);
  const consistency = windowDays == null ? null : Math.min(1, avgDates.length / windowDays);
  const accuracy = hitDays ? hitSum / hitDays : null;

  // Meal-status average — the legacy measure, still the fallback when there is
  // no target to be accurate against.
  const statusAdherence = adhDays ? adhSum / adhDays : null;

  const scored = consistency != null && accuracy != null;
  return {
    loggedDays: realDays.length,
    avgDays: avgDates.length,
    kcal: kcal / denom,
    p: p / denom,
    c: c / denom,
    f: f / denom,
    adherence: scored ? consistency * accuracy * 100 : statusAdherence,
    consistency: consistency == null ? null : consistency * 100,
    accuracy: accuracy == null ? null : accuracy * 100,
    adherenceBasis: scored ? "logging+macros" : "meal-status",
  };
}
