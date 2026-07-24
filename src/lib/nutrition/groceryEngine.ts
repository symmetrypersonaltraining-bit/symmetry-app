// ============================================================================
// Nutrition v3 — grocery + meal-prep production-sheet engine.
//
// Reads the live plan day-by-day over a start date + N days window:
//   • Grocery amounts are ALWAYS RAW (what you buy): cooked meat ×4/3,
//     cooked grains → dry (÷3 by volume, ÷2.8 by weight), potatoes ×1.2.
//   • Meats & fish show lb + oz ("2 lb 6.4 oz").
//   • Egg whites: counts stay counts ("30 egg whites"); liquid stays fl oz.
//   • Prep production sheet stays COOKED (oz first, grams secondary) with
//     per-container detail + batch cook totals.
//
// Alternating meals — two sources, in priority order:
//   1. STRUCTURED (preferred): meals.rotation jsonb with type "day_parity"
//      ({ even: {food, amount, unit}, odd: {...} }) gives EXACT per-item
//      amounts for each parity; the alternating item resolves to the even
//      entry on even day-of-month dates and the odd entry on odd dates.
//      "weekly" rotation metadata is informational only (plan versions + the
//      auto-flip job handle it) and is ignored here.
//   2. STRING FALLBACK: an item's food written as "A OR B" (GroceryListSheet's
//      convention), optionally annotated "(even days)" / "(odd days)".
// Either way, parity alternatives are counted against the REAL calendar dates
// in the window (day-of-month parity), so "7 days from an odd start" correctly
// yields 4/3 splits. Un-annotated "A OR B" strings fall back to an even
// distribution.
// ============================================================================

import { PlanMeal, PlanItem, MealRotation, RotationEntry, kcalOf } from "./dailyTotals";

export interface RangeSpec {
  startISO: string; // YYYY-MM-DD (America/Chicago logical date)
  days: number;
}

export interface GroceryLine {
  food: string;
  qty: string;          // display quantity (raw)
  detail?: string;      // e.g. "M2 + M5 daily · 4 chicken days"
  unlimited?: boolean;
  group: "protein" | "carbs" | "fats" | "other" | "free";
}

export interface PrepAltGroup {
  label: string;              // "CHICKEN VERSION" | "" (no alternation)
  containers: number;
  items: { food: string; qty: string; free?: boolean }[];
  perContainer: { kcal: number; p: number; c: number; f: number };
  batch: string[];            // batch cook total lines
}

export interface PrepCard {
  mealName: string;
  timing: string | null;
  groups: PrepAltGroup[];
}

const MEAT_FISH = /beef|chicken|turkey|pork|steak|salmon|tilapia|cod|shrimp|bison|lamb|sirloin|mahi|halibut|snapper|fish|sardine/i;
const GRAIN = /\brice\b|pasta|quinoa|oats|oatmeal|cream of rice/i;
const POTATO = /potato/i;
const EGG_WHITE = /egg\s*white/i;
const FATS_RE = /oil|butter|almond|peanut|nut|avocado|seed|cheese/i;
const CARBS_RE = /rice|oat|potato|bread|bagel|tortilla|pasta|fruit|berr|banana|apple|cereal|granola|honey|cake|cracker/i;

function r2(n: number) { return Math.round(n * 100) / 100; }
export function fmtNum(n: number) { return String(r2(n)); }

export function lbOz(totalOz: number): string {
  const lb = Math.floor(totalOz / 16);
  const rem = Math.round((totalOz - lb * 16) * 10) / 10;
  if (lb < 1) return `${rem} oz`;
  return `${lb} lb${rem > 0 ? ` ${rem} oz` : ""}`;
}

function isCooked(it: PlanItem): boolean {
  return it.basis === "cooked" || /\bcooked\b/i.test(it.food || "") || /\bcooked\b/i.test(it.unit || "");
}
function cleanUnit(unit: string | null): string {
  return (unit || "").replace(/\s*(cooked|raw)\s*/gi, " ").replace(/\s+/g, " ").trim();
}

// "Chicken Breast (even days) OR Ground Beef (odd days)" → alternatives.
export function parseAlts(food: string): { name: string; parity: "even" | "odd" | null }[] | null {
  const parts = (food || "").split(/\s+OR\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return parts.map((p) => {
    const parity = /even\s*days?/i.test(p) ? "even" as const : /odd\s*days?/i.test(p) ? "odd" as const : null;
    return { name: p.replace(/\((even|odd)\s*days?\)/gi, "").trim(), parity };
  });
}

// Count even/odd day-of-month dates across the window (real calendar days).
export function parityCounts(range: RangeSpec): { even: number; odd: number } {
  const [y, m, d] = range.startISO.split("-").map(Number);
  let even = 0, odd = 0;
  for (let i = 0; i < range.days; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    if (dt.getUTCDate() % 2 === 0) even++; else odd++;
  }
  return { even, odd };
}

// Validated meal-level day_parity rotation metadata, or null. "weekly" and
// malformed payloads (missing even/odd food) return null → string fallback.
export function dayParityRotation(meal: PlanMeal): (MealRotation & { even: RotationEntry; odd: RotationEntry }) | null {
  const r = meal.rotation;
  if (!r || r.type !== "day_parity") return null;
  if (!r.even?.food || !r.odd?.food) return null;
  return r as MealRotation & { even: RotationEntry; odd: RotationEntry };
}

// The plan item a meal-level day_parity rotation resolves: the meal's
// alternating "A OR B" item if present, else an item whose food exactly
// matches one of the rotation alternatives (covers later-normalized names).
export function rotationTarget(
  meal: PlanMeal,
  rot: MealRotation & { even: RotationEntry; odd: RotationEntry }
): PlanItem | null {
  const items = meal.meal_items || [];
  return (
    items.find((it) => !it.is_unlimited && !!parseAlts(it.food)) ??
    items.find((it) => {
      const f = (it.food || "").trim().toLowerCase();
      return f === rot.even.food.trim().toLowerCase() || f === rot.odd.food.trim().toLowerCase();
    }) ??
    null
  );
}

// Resolve an alternating item to one rotation alternative (exact amount/unit
// from the metadata; missing fields inherit from the underlying item).
function resolveRotationEntry(it: PlanItem, e: RotationEntry): PlanItem {
  return { ...it, food: e.food, amount: e.amount ?? it.amount, unit: e.unit ?? it.unit };
}

// Days each alternative is eaten within the range.
export function altDayCounts(alts: { parity: "even" | "odd" | null }[], range: RangeSpec): number[] {
  const pc = parityCounts(range);
  const annotated = alts.every((a) => a.parity);
  if (annotated) return alts.map((a) => (a.parity === "even" ? pc.even : pc.odd));
  // Fallback: distribute evenly, first alternatives get the extra day(s).
  const n = range.days, k = alts.length;
  const base = Math.floor(n / k), extra = n % k;
  return alts.map((_, i) => base + (i < extra ? 1 : 0));
}

// Raw (grocery) conversion of a cooked amount.
function toRaw(food: string, amount: number, unit: string | null): { amount: number; unit: string; tag: string } {
  const u = cleanUnit(unit);
  if (MEAT_FISH.test(food)) return { amount: amount * (4 / 3), unit: u, tag: "raw" };
  if (POTATO.test(food)) return { amount: amount * 1.2, unit: u, tag: "raw" };
  if (GRAIN.test(food)) {
    const isVol = /cup|tbsp|tsp|fl oz|ml/i.test(u);
    return { amount: isVol ? amount / 3 : amount / 2.8, unit: u, tag: "dry" };
  }
  return { amount, unit: u, tag: "" };
}

function grocQty(food: string, total: number, unit: string | null, cooked: boolean, unlimited: boolean): string {
  if (unlimited && total <= 0) return "as needed";
  let amt = total, u = cleanUnit(unit), tag = "";
  if (cooked && total > 0) { const rw = toRaw(food, total, unit); amt = rw.amount; u = rw.unit; tag = rw.tag; }
  const un = u.toLowerCase();
  // Egg whites by count stay counts.
  if (EGG_WHITE.test(food) && (un === "" || /white|each|count/.test(un))) {
    return `${Math.round(amt)} egg whites`;
  }
  // fl oz liquids never get a lb conversion.
  if (un === "fl oz" || un === "floz") {
    return `${fmtNum(amt)} fl oz${amt >= 32 ? ` (${Math.ceil(amt / 32)} × 32 fl oz cartons)` : ""}`;
  }
  // Meats & fish in oz → lb + oz.
  if (un === "oz" && MEAT_FISH.test(food) && amt > 0) {
    return `${lbOz(amt)}${tag ? ` ${tag}` : ""} (${fmtNum(amt)} oz)`;
  }
  if (un === "g" && MEAT_FISH.test(food) && amt > 0) {
    const oz = amt / 28.35;
    return `${lbOz(oz)}${tag ? ` ${tag}` : ""} (${Math.round(amt)} g)`;
  }
  return `${fmtNum(amt)}${u ? " " + u : ""}${tag ? " " + tag : ""}${unlimited ? " + as needed" : ""}`;
}

function groupFor(food: string, unlimited: boolean): GroceryLine["group"] {
  if (unlimited) return "free";
  if (MEAT_FISH.test(food) || EGG_WHITE.test(food) || /egg|whey|protein|yogurt|oikos|cottage|tuna|shake/i.test(food)) return "protein";
  if (FATS_RE.test(food)) return "fats";
  if (CARBS_RE.test(food) || GRAIN.test(food) || POTATO.test(food)) return "carbs";
  return "other";
}

// ---------------------------------------------------------------------------
// Grocery list: every plan meal read day-by-day over the range.
// mealsPerDayCounts: for multi-option slots, how many days each meal is eaten
// (default: single-option meals eat every day, multi-option split evenly).
// ---------------------------------------------------------------------------
export function buildGroceryList(
  meals: PlanMeal[],
  range: RangeSpec,
  daysByMealId?: Record<string, number>
): GroceryLine[] {
  const byPos: Record<number, PlanMeal[]> = {};
  for (const m of [...meals].sort((a, b) => a.position - b.position)) (byPos[m.position] ||= []).push(m);

  interface Agg { food: string; unit: string | null; cooked: boolean; total: number; unlimited: boolean; sources: Set<string>; }
  const agg: Record<string, Agg> = {};

  const add = (food: string, unit: string | null, cooked: boolean, amount: number | null, unlimited: boolean, src: string) => {
    const key = food.toLowerCase() + "||" + (cleanUnit(unit) || "") + "||" + (cooked ? "c" : "r");
    if (!agg[key]) agg[key] = { food, unit, cooked, total: 0, unlimited: false, sources: new Set() };
    if (unlimited || amount == null) agg[key].unlimited = true;
    else agg[key].total += amount;
    agg[key].sources.add(src);
  };

  for (const pos of Object.keys(byPos).map(Number).sort((a, b) => a - b)) {
    const options = byPos[pos];
    for (const meal of options) {
      let days = daysByMealId?.[meal.id];
      if (days == null) {
        days = options.length === 1 ? range.days : Math.floor(range.days / options.length) + (options.indexOf(meal) < range.days % options.length ? 1 : 0);
      }
      if (days <= 0) continue;
      const label = meal.name.split("—")[0].trim() || `Meal ${pos}`;
      const rot = dayParityRotation(meal);
      const rotIt = rot ? rotationTarget(meal, rot) : null;
      for (const it of meal.meal_items || []) {
        // Structured day_parity metadata wins: exact per-parity amounts.
        if (rot && rotIt && it === rotIt && !it.is_unlimited) {
          const pc = parityCounts(range);
          const scale = days / range.days;
          ([["even", pc.even], ["odd", pc.odd]] as const).forEach(([k, days_k]) => {
            const res = resolveRotationEntry(it, rot[k]);
            const n = days_k * scale;
            if (n <= 0) return;
            if (res.amount == null) add(res.food, res.unit, isCooked(res), null, true, label);
            else add(res.food, res.unit, isCooked(res), (Number(res.amount) || 0) * n, false, `${label} · ${Math.round(n)}d`);
          });
          continue;
        }
        const alts = parseAlts(it.food);
        if (alts && it.amount != null && !it.is_unlimited) {
          const counts = altDayCounts(alts, range);
          const scale = days / range.days; // this meal's share of the window
          alts.forEach((alt, i) => {
            const n = counts[i] * scale;
            if (n > 0) add(alt.name, it.unit, isCooked(it), (Number(it.amount) || 0) * n, false, `${label} · ${Math.round(n)}d`);
          });
        } else {
          add(it.food, it.unit, isCooked(it), it.is_unlimited || it.amount == null ? null : (Number(it.amount) || 0) * days, it.is_unlimited, label);
        }
      }
    }
  }

  return Object.values(agg)
    .map((a) => ({
      food: a.food,
      qty: grocQty(a.food, a.total, a.unit, a.cooked, a.unlimited),
      detail: Array.from(a.sources).join(" · "),
      unlimited: a.unlimited && a.total <= 0,
      group: groupFor(a.food, a.unlimited && a.total <= 0),
    }))
    .sort((x, y) => {
      const order = { protein: 0, carbs: 1, fats: 2, other: 3, free: 4 } as const;
      return order[x.group] - order[y.group] || x.food.localeCompare(y.food);
    });
}

// ---------------------------------------------------------------------------
// Prep production sheet: per meal → containers, per-container detail (COOKED),
// batch cook totals. Alternating items split into versions with real day counts.
// ---------------------------------------------------------------------------
function prepQtyCooked(food: string, amount: number, unit: string | null): string {
  const u = cleanUnit(unit).toLowerCase();
  if (EGG_WHITE.test(food) && (u === "" || /white|each|count/.test(u))) return `${Math.round(amount)} egg whites`;
  if (u === "fl oz" || u === "floz") return `${fmtNum(amount)} fl oz liquid`;
  if (u === "oz" && amount > 0) return `${fmtNum(amount)} oz cooked (${Math.round(amount * 28.35)} g)`;
  if (u === "g" && amount > 0) return `${Math.round(amount)} g${MEAT_FISH.test(food) || GRAIN.test(food) ? " cooked" : ""} (${fmtNum(amount / 28.35)} oz)`;
  return `${fmtNum(amount)}${u ? " " + u : ""}`;
}

function batchLine(food: string, per: number, unit: string | null, containers: number): string | null {
  const u = cleanUnit(unit).toLowerCase();
  const total = per * containers;
  if (MEAT_FISH.test(food)) {
    const totOz = u === "g" ? total / 28.35 : total;
    const rawOz = totOz * (4 / 3);
    return `${food} — cook ${lbOz(totOz)} (${fmtNum(totOz)} oz) total (from ${lbOz(rawOz)} raw) → ${fmtNum(u === "g" ? per / 28.35 : per)} oz per container ×${containers}`;
  }
  if (GRAIN.test(food)) {
    const isVol = /cup|tbsp|tsp/.test(u);
    const dry = isVol ? total / 3 : total / 2.8;
    return `${food} — cook ${fmtNum(total)}${u ? " " + u : ""} total (from ${fmtNum(dry)}${u ? " " + u : ""} dry) → ${fmtNum(per)}${u ? " " + u : ""} per container ×${containers}`;
  }
  if (EGG_WHITE.test(food) && (u === "" || /white|each|count/.test(u))) {
    return `${food} — crack ${Math.round(total)} egg whites total → ${Math.round(per)} per container ×${containers}`;
  }
  if (u === "fl oz") {
    return `${food} — pour ${fmtNum(total)} fl oz liquid total → ${fmtNum(per)} fl oz per container ×${containers}`;
  }
  if (POTATO.test(food)) {
    return `${food} — cook ${fmtNum(total)}${u ? " " + u : ""} total → ${fmtNum(per)}${u ? " " + u : ""} per container ×${containers}`;
  }
  return null;
}

function itemsMacros(items: PlanItem[]): { kcal: number; p: number; c: number; f: number } {
  let p = 0, c = 0, f = 0;
  for (const it of items) { p += Number(it.protein) || 0; c += Number(it.carbs) || 0; f += Number(it.fats) || 0; }
  return { kcal: kcalOf(p, c, f), p, c, f };
}

export function buildPrepCards(
  meals: PlanMeal[],
  range: RangeSpec,
  freshMealIds?: Set<string>,
  daysByMealId?: Record<string, number>
): { cards: PrepCard[]; fresh: { mealName: string; timing: string | null; days: number }[] } {
  const cards: PrepCard[] = [];
  const fresh: { mealName: string; timing: string | null; days: number }[] = [];
  const byPos: Record<number, PlanMeal[]> = {};
  for (const m of [...meals].sort((a, b) => a.position - b.position)) (byPos[m.position] ||= []).push(m);

  for (const pos of Object.keys(byPos).map(Number).sort((a, b) => a - b)) {
    const options = byPos[pos];
    for (const meal of options) {
      let days = daysByMealId?.[meal.id];
      if (days == null) {
        days = options.length === 1 ? range.days : Math.floor(range.days / options.length) + (options.indexOf(meal) < range.days % options.length ? 1 : 0);
      }
      if (days <= 0) continue;
      if (freshMealIds?.has(meal.id)) { fresh.push({ mealName: meal.name, timing: meal.timing, days }); continue; }

      const altItem = (meal.meal_items || []).find((it) => parseAlts(it.food) && !it.is_unlimited && it.amount != null);
      const groups: PrepAltGroup[] = [];

      const buildGroup = (label: string, containers: number, resolveFood: (it: PlanItem) => PlanItem) => {
        if (containers <= 0) return;
        const resolved = (meal.meal_items || []).map(resolveFood);
        const mm = itemsMacros(resolved.filter((it) => !it.is_unlimited));
        const items = resolved.map((it) => ({
          food: it.food,
          qty: it.is_unlimited || it.amount == null ? "as desired" : prepQtyCooked(it.food, Number(it.amount) || 0, it.unit),
          free: it.is_unlimited,
        }));
        const batch = resolved
          .filter((it) => !it.is_unlimited && it.amount != null)
          .map((it) => batchLine(it.food, Number(it.amount) || 0, it.unit, containers))
          .filter((x): x is string => !!x);
        groups.push({ label, containers, items, perContainer: mm, batch });
      };

      const rot = dayParityRotation(meal);
      const rotIt = rot ? rotationTarget(meal, rot) : null;
      if (rot && rotIt) {
        // Structured metadata: exact per-parity amounts + real calendar counts.
        const pc = parityCounts(range);
        const entries: [RotationEntry, number][] = [[rot.even, pc.even], [rot.odd, pc.odd]];
        entries.forEach(([e, n]) => {
          buildGroup(`${e.food.toUpperCase()} VERSION`, Math.round((n * days) / range.days), (it) =>
            it === rotIt ? resolveRotationEntry(it, e) : it
          );
        });
      } else if (altItem) {
        const alts = parseAlts(altItem.food)!;
        const counts = altDayCounts(alts, range).map((n) => Math.round((n * days) / range.days));
        alts.forEach((alt, i) => {
          buildGroup(`${alt.name.toUpperCase()} VERSION`, counts[i], (it) =>
            it === altItem ? { ...it, food: alt.name } : it
          );
        });
      } else {
        buildGroup("", days, (it) => it);
      }
      cards.push({ mealName: meal.name, timing: meal.timing, groups });
    }
  }
  return { cards, fresh };
}
