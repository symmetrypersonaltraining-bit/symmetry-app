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
  "meals(id, name, timing, position, swaps, meal_items(id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position))";

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
export function pickPlanForDate<T extends { day_group?: number[] | null }>(
  candidates: T[],
  dateStr: string,
): T | null {
  const list = candidates || [];
  const wd = isoWeekdayFromDateStr(dateStr);
  const tagged = list.find((p) => Array.isArray(p.day_group) && p.day_group.includes(wd));
  if (tagged) return tagged;
  const everyday = list.find(
    (p) => p.day_group == null || (Array.isArray(p.day_group) && p.day_group.length === 0),
  );
  return everyday ?? null;
}

// Fetch ALL of a client's live plans effective on/before dateStr (day-group
// tagged + the everyday one), newest-effective first. This is the set the v3
// logger holds so client-side date navigation can pick the right menu per day
// with zero refetch.
export async function fetchLivePlans(
  supabase: SupabaseClient,
  clientId: string,
  dateStr: string,
  selectExtra?: string,
): Promise<DayGroupPlan[]> {
  const sel = selectExtra ? PLAN_SELECT + ", " + selectExtra : PLAN_SELECT;
  const { data } = await supabase
    .from("meal_plans")
    .select(sel)
    .eq("client_id", clientId)
    .eq("status", "live")
    .lte("effective_date", dateStr)
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
