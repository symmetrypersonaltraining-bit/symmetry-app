// ============================================================================
// DAY-GROUP MEAL PLANS — shared live-plan resolver.
//
// A client's live menu can vary by day of the week. Each meal_plans row may
// carry `day_group smallint[]` = the ISO weekdays (1=Mon..7=Sun, America/
// Chicago) that menu applies to. NULL/empty day_group = an EVERYDAY plan (the
// legacy behavior — applies to every weekday).
//
// resolveLivePlanForDate() returns the single plan that governs a given date:
//   1. the first live candidate whose day_group CONTAINS the date's weekday
//   2. else the first live candidate with a NULL/empty day_group (everyday)
//   3. else null
//
// ADDITIVE + SAFE: a client with a single NULL-day_group live plan resolves to
// that plan for EVERY weekday → identical to today's behavior. Untagged plans
// are unchanged for every existing client.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { isoWeekdayFromDateStr } from "./weekday";

// The exact meal/meal_items select the nutrition pages use, PLUS day_group +
// effective_date so the resolver (and client-side date-nav) can pick correctly.
export const PLAN_SELECT =
  "id, version_number, title, day_group, effective_date, " +
  // `micros` matters: without it in the select list, meal_items arrive with no
  // nutrient panel and computeDayTotals reports every planned meal's sodium as
  // unknown even though the row has it. An omitted column reads exactly like an
  // empty one, which is how this stayed invisible.
  "meals(id, name, timing, position, swaps, meal_items(id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, micros, position))";

export interface DayGroupPlan {
  id: string;
  version_number: number | null;
  title?: string | null;
  day_group?: number[] | null;
  effective_date?: string | null;
  meals?: unknown[];
  [k: string]: unknown;
}

// Pure selection over already-fetched live candidates (ordered effective_date
// desc, created_at desc). Unit-tested. `everyday` = null OR empty day_group.
//
// Dustin, 2026-08-05: "If we set up a meal plan that changes, it needs to be
// scheduled ahead of time. And I need to be able to see it days ahead of time,
// instead of having you flip it on live day-by-day, like we did with my peak.
// That did not work."
//
// The candidate list may now contain plans that have not STARTED yet — the
// fetch reaches into the future so a scheduled plan can be viewed before its
// first day. So the effective_date filter moved in here, where the viewed date
// is known. It used to live entirely in the query (.lte effective_date, today),
// which was only correct while nothing ahead of today was ever fetched.
//
// Getting this wrong shows next week's menu today, so it is checked against the
// DATE BEING VIEWED and nothing else.
export function pickPlanForDate<T extends { day_group?: number[] | null; effective_date?: string | null }>(
  candidates: T[],
  dateStr: string,
): T | null {
  // Not started yet, as of the date being viewed. A null effective_date is a
  // plan with no start — always in force.
  const list = (candidates || []).filter(
    (p) => p.effective_date == null || p.effective_date <= dateStr,
  );
  const wd = isoWeekdayFromDateStr(dateStr);
  const tagged = list.find((p) => Array.isArray(p.day_group) && p.day_group.includes(wd));
  if (tagged) return tagged;
  const everyday = list.find(
    (p) => p.day_group == null || (Array.isArray(p.day_group) && p.day_group.length === 0),
  );
  return everyday ?? null;
}

/**
 * How far past `dateStr` the plan set reaches.
 *
 * The screen can page a day at a time; 8 weeks is far enough to see a whole
 * prep block laid out and short enough that the payload stays small. A plan
 * scheduled beyond this is still there — it just is not preloaded.
 */
export const PLAN_LOOKAHEAD_DAYS = 56;

/** dateStr shifted by n days, calendar-safe, no Date parsing of the string. */
export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

// Fetch a client's live plans (day-group tagged + the everyday one),
// newest-effective first. This is the set the v3 logger holds so client-side
// date navigation can pick the right menu per day with zero refetch.
//
// It now reaches FORWARD as well. Scheduling a plan to start next Monday used
// to be invisible until Monday: the query stopped at today, so paging ahead
// showed the current menu for a day it would not actually govern, and the only
// way to make the new plan appear was to flip it live on the morning. Which is
// exactly what Dustin asked to stop doing.
//
// pickPlanForDate does the effective_date comparison against the viewed date,
// so a plan that has not started cannot leak into an earlier day.
export async function fetchLivePlans(
  supabase: SupabaseClient,
  clientId: string,
  dateStr: string,
  selectExtra?: string,
  lookaheadDays: number = PLAN_LOOKAHEAD_DAYS,
): Promise<DayGroupPlan[]> {
  const sel = selectExtra ? PLAN_SELECT + ", " + selectExtra : PLAN_SELECT;
  const { data } = await supabase
    .from("meal_plans")
    .select(sel)
    .eq("client_id", clientId)
    .eq("status", "live")
    .lte("effective_date", shiftDate(dateStr, Math.max(0, lookaheadDays)))
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });
  return (data as unknown as DayGroupPlan[]) || [];
}

// Resolve the single live plan governing `dateStr` for `clientId`.
export async function resolveLivePlanForDate(
  supabase: SupabaseClient,
  clientId: string,
  dateStr: string,
  opts?: { selectExtra?: string },
): Promise<DayGroupPlan | null> {
  const candidates = await fetchLivePlans(supabase, clientId, dateStr, opts?.selectExtra);
  return pickPlanForDate(candidates, dateStr);
}
