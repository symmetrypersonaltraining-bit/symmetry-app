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
  // `status` is load-bearing now that superseded versions are fetched too —
  // pickPlanForDate uses it to make sure a live plan is never out-sorted by an
  // archived one. Drop it from this list and every client silently starts
  // resolving history against whatever has the newest date, cancelled or not.
  "id, version_number, title, day_group, effective_date, status, " +
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
export function pickPlanForDate<T extends { day_group?: number[] | null; effective_date?: string | null; status?: string | null }>(
  candidates: T[],
  dateStr: string,
): T | null {
  // Not started yet, as of the date being viewed. A null effective_date is a
  // plan with no start — always in force.
  const list = (candidates || []).filter(
    (p) => p.effective_date == null || p.effective_date <= dateStr,
  );
  const wd = isoWeekdayFromDateStr(dateStr);
  const pick = (from: T[]): T | null => {
    const tagged = from.find((p) => Array.isArray(p.day_group) && p.day_group.includes(wd));
    if (tagged) return tagged;
    return from.find((p) => p.day_group == null || (Array.isArray(p.day_group) && p.day_group.length === 0)) ?? null;
  };

  // A LIVE plan always wins for a date it is in force on. Superseded versions
  // are only consulted for dates BEFORE the current plan started — which is the
  // whole point of keeping them: last Tuesday was governed by last Tuesday's
  // menu, not by the one that replaced it on Thursday.
  //
  // Doing it in this order rather than by effective_date alone also makes a
  // CANCELLED future plan harmless. An archived row dated next month would
  // otherwise out-sort the live one and start governing in September. Status is
  // the only thing that distinguishes "superseded" from "abandoned", and it
  // cannot tell them apart — so the live plan is never overruled.
  //
  // A candidate with no status is treated as live: that is every caller that
  // predates this, and the existing behaviour must not shift under them.
  const live = list.filter((p) => p.status == null || p.status === "live");
  return pick(live) ?? pick(list);
}

/**
 * How far past `dateStr` the plan set reaches.
 *
 * The screen can page a day at a time; 8 weeks is far enough to see a whole
 * prep block laid out and short enough that the payload stays small. A plan
 * scheduled beyond this is still there — it just is not preloaded.
 */
export const PLAN_LOOKAHEAD_DAYS = 56;

/**
 * ...and it is no longer a ceiling. Dustin, 12 Aug: "there is no limit to me
 * looking ahead at programming scheduled thats ridiculous it was ever set up
 * that way on meal plan or workouts."
 *
 * fetchLivePlans no longer filters on effective_date at all. The constant
 * stays because callers pass it and it still describes the intent of the
 * screen, but nothing truncates. pickPlanForDate compares effective_date
 * against the VIEWED date, so a plan that has not started still cannot leak
 * into an earlier day — the cap was never what protected that.
 */

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
//
// ── AND IT REACHES BACKWARD TOO, WHICH IS NEWER AND HARDER-WON ─────────────
//
// Claudine, 13 Aug: "Omfg i replaced one of the meals for a recipe i made and
// the clanker changed ALL the meals not only for today but days before... i had
// to manually change amounts to 0 and the clanker put all the amounts back."
//
// She was right on every count, and none of it was the AI. Editing a
// trainer-authored meal CLONES the plan (/api/nutrition/plan-edit) and archives
// the original — correct, so Dustin's prescription is never mutated. But this
// query asked for status = 'live', so the moment the old version was archived
// it vanished from the candidate set, and every past day fell through to
// today's plan. Two things followed:
//
//   · last week's menu was redrawn as this week's, retroactively;
//   · every "I didn't eat that" zero came back. Those live in
//     meal_adherence_logs.item_overrides keyed by meal_item ID, and the clone
//     minted brand-new item rows — so on a past day the keys matched nothing
//     and the item rendered at its full planned amount. Her removals silently
//     un-removed themselves, and the day's calories moved with them.
//
// A version's reign is [its effective_date, the next version's). 'live' vs
// 'archived' says which one is CURRENT — it does not say which one governed
// last Tuesday. So superseded versions stay in the set and pickPlanForDate,
// which already picks the newest effective_date on or before the viewed date,
// gets the right answer for history without changing at all.
//
// Capped, because a client who edits a meal a day accumulates versions and each
// one carries its whole meal/item tree. Twenty covers far more history than the
// screen can page to.
const MAX_PLAN_VERSIONS = 20;

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
    .in("status", ["live", "archived"])
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(MAX_PLAN_VERSIONS);
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
