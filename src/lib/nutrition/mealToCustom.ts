// Turn a PLAN meal (plus that day's edits) into a flat CustomItem[].
//
// This is what "Copy to slot…" and "Save to My Meals" both hand off. Extracted
// from NutritionV3Client so it can be unit-tested, because the version living
// inline there ignored item_overrides entirely (feedback 4a7256d2, 2026-07-31):
// a client who stepped their rice down to 1/2 cup and then copied the meal —
// or saved it to their library — got the ORIGINAL 1 cup back, while the card
// they were looking at showed the halved macros. planMealMacros has always
// honoured the overrides; this path didn't, so the two disagreed.
//
// The rules here mirror planMealMacros exactly, so a copied/saved meal always
// totals the same as the meal it came from:
//   • { [itemId]: { amount } }  → scale = amount / originalAmount
//   • amount 0                  → the item was removed; it is dropped entirely
//   • __added: [...]            → foods added on the day, carried as items
//                                 (servings becomes the item's `fac`)
// Untouched items pass through at scale 1.

import { kcalOf, type AddedFood, type CustomItem, type ItemOverrides, type PlanMeal } from "./dailyTotals";

export function planItemsToCustom(meal: PlanMeal | null | undefined, overrides?: ItemOverrides | null): CustomItem[] {
  const out: CustomItem[] = [];
  const ov = overrides || null;
  // Same guard planMealMacros uses: only per-item keys count, never the __meta
  // ones, so a log carrying nothing but __ord doesn't look like an edit.
  const hasOv = !!(ov && Object.keys(ov).some((k) => !k.startsWith("__")));

  for (const item of meal?.meal_items || []) {
    let amount = item.amount;
    let scale = 1;
    if (hasOv) {
      const oAmt = (ov![item.id] as { amount?: number } | undefined)?.amount;
      if (oAmt === 0) continue; // removed today — don't carry it forward
      if (oAmt != null) {
        amount = oAmt;
        if (item.amount) scale = oAmt / item.amount;
      }
    }
    const p = (Number(item.protein) || 0) * scale;
    const c = (Number(item.carbs) || 0) * scale;
    const f = (Number(item.fats) || 0) * scale;
    out.push({
      n: item.food,
      a: amount != null ? `${amount}${item.unit ? " " + item.unit : ""}` : null,
      p, c, f, k: kcalOf(p, c, f),
      free: item.is_unlimited,
      fac: 1,
    });
  }

  for (const ad of (ov?.__added || []) as AddedFood[]) {
    const sv = Number(ad.servings) || 1;
    const p = Number(ad.p) || 0;
    const c = Number(ad.c) || 0;
    const f = Number(ad.f) || 0;
    out.push({
      n: ad.name,
      a: sv === 1 ? "1 serving" : `${sv} servings`,
      p, c, f, k: kcalOf(p, c, f),
      food_id: ad.food_id ?? null,
      fac: sv,
    });
  }

  return out;
}
