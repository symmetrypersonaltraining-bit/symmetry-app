/**
 * MACROS AND CALORIES THAT FOLLOW EACH OTHER.
 *
 * Dustin, 11 Sep 2026: *"We need to be able to change the macros and the
 * calories, and they all need to follow each other. If I lower my carbs by
 * grams, it needs to drop the calories down — or it may make more sense to set
 * the macros by percentages and then give a number in grams at each percentage
 * based off of the calories right next to it."*
 *
 * Both, and they stay in step. Three ways in — grams, calories, percentage —
 * and every one of them leaves a set of numbers that agree.
 *
 * ── GRAMS ARE THE TRUTH ────────────────────────────────────────────────────
 *
 * `macro_targets` stores grams, `planTargetDrift` compares grams, and the plan
 * is built to grams. So calories here are ALWAYS `kcalOf(p, c, f)` — never a
 * number carried alongside them that could disagree.
 *
 * That is the whole reason this module exists rather than a second kcal field.
 * Two sources of truth for calories is the bug class this app keeps paying for:
 * a target whose calories and macros disagree is one the model cannot hit,
 * because nothing can.
 *
 * So typing in a calorie box is a REQUEST, not a value. It rescales the grams
 * to land as close as integers allow and the calorie figure then shows what
 * those grams actually come to. Ask for 2,200 and get 2,199 — that is honest,
 * and it is 0.05% out.
 */

import { kcalOf } from "./dailyTotals";

export interface MacroTargets {
  kcal: number;
  p: number;
  c: number;
  f: number;
}

/** Calories per gram, and the reason percentages are not all the same divisor. */
export const CALS_PER_G = { p: 4, c: 4, f: 9 } as const;
export type MacroKey = keyof typeof CALS_PER_G;

/** Grams in, a consistent set out. The only way a MacroTargets should be made. */
export function fromGrams(p: number, c: number, f: number): MacroTargets {
  const g = { p: Math.max(0, Math.round(p)), c: Math.max(0, Math.round(c)), f: Math.max(0, Math.round(f)) };
  return { ...g, kcal: Math.round(kcalOf(g.p, g.c, g.f)) };
}

/** What share of the calories each macro is. Empty targets read as zeros. */
export function pctOf(t: MacroTargets): Record<MacroKey, number> {
  const total = kcalOf(t.p, t.c, t.f);
  if (total <= 0) return { p: 0, c: 0, f: 0 };
  return {
    p: Math.round((t.p * CALS_PER_G.p * 100) / total),
    c: Math.round((t.c * CALS_PER_G.c * 100) / total),
    f: Math.round((t.f * CALS_PER_G.f * 100) / total),
  };
}

/** One macro's grams changed; the other two are left exactly as they were. */
export function setGrams(t: MacroTargets, field: MacroKey, grams: number): MacroTargets {
  const next = { ...t, [field]: Math.max(0, Math.round(grams)) };
  return fromGrams(next.p, next.c, next.f);
}

/**
 * A calorie number asked for; the split is kept and the grams are rescaled.
 *
 * Keeping the SPLIT is what makes this feel right: "same diet, less of it" is
 * what someone means when they drop 2,400 to 2,200, not "same protein, fewer
 * carbs". Protein-first would be a different, defensible choice — and it is
 * not the one he described.
 */
export function setKcal(t: MacroTargets, kcal: number): MacroTargets {
  const want = Math.max(0, Math.round(kcal));
  const current = kcalOf(t.p, t.c, t.f);
  // Nothing to keep the shape of. A bare calorie number with no macros is not
  // a target, so leave the grams alone rather than inventing a split.
  if (current <= 0 || want <= 0) return { ...t, kcal: want };
  const r = want / current;
  return fromGrams(t.p * r, t.c * r, t.f * r);
}

/**
 * One macro set to a percentage of the CURRENT calories. The other two keep
 * their ratio to each other and absorb what is left.
 *
 * "Carbs to 40%" has to mean the calories stay put — otherwise the number he
 * just typed is not the thing that changed. The other two share the remaining
 * 60% in the proportion they already had, which is the only redistribution
 * that does not silently make a second decision for him.
 */
export function setPct(t: MacroTargets, field: MacroKey, pct: number): MacroTargets {
  const total = kcalOf(t.p, t.c, t.f);
  if (total <= 0) return t;
  const share = Math.min(100, Math.max(0, pct));
  const mine = (total * share) / 100 / CALS_PER_G[field];

  const others = (["p", "c", "f"] as MacroKey[]).filter((k) => k !== field);
  const otherCals = others.reduce((a, k) => a + t[k] * CALS_PER_G[k], 0);
  const leftCals = total * (1 - share / 100);

  const next = { ...t, [field]: mine } as MacroTargets;
  if (otherCals <= 0) {
    // Both others are zero, so there is no ratio to keep. Split what is left
    // evenly rather than picking a favourite.
    for (const k of others) next[k] = leftCals / 2 / CALS_PER_G[k];
  } else {
    for (const k of others) next[k] = ((t[k] * CALS_PER_G[k]) / otherCals) * leftCals / CALS_PER_G[k];
  }
  return fromGrams(next.p, next.c, next.f);
}

/**
 * The grams a percentage of these calories comes to — the number that sits
 * beside the percentage box, which is exactly what he asked for.
 */
export function gramsAtPct(kcal: number, field: MacroKey, pct: number): number {
  return Math.round((kcal * pct) / 100 / CALS_PER_G[field]);
}
