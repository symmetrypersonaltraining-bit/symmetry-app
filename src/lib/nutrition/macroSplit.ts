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
export function setKcal(t: MacroTargets, kcal: number, from: MacroTargets = t): MacroTargets {
  const want = Math.max(0, Math.round(kcal));
  // ── ALWAYS RESCALE FROM `from`, NEVER FROM THE LAST KEYSTROKE ────────────
  //
  // Dustin, 11 Sep: *"If I change the calories, it immediately zeros out all
  // of the protein, carbs, and fat."* He was right and this was the bug.
  //
  // Typing 2000 into a 2,135 kcal target sends FOUR values through here — 2,
  // 20, 200, 2000. The first scales every macro by 2/2135, which rounds all
  // three to zero; from then on there is no split left to keep and every
  // later keystroke just sets a calorie number onto three zeros.
  //
  // `from` is the target as it stood when the field was focused, so the split
  // being kept is always a real one. It is the same rule the draft's item
  // amounts already used — scale from the original, never compound — and not
  // applying it here too was the oversight.
  const base = from;
  const current = kcalOf(base.p, base.c, base.f);
  // Nothing to keep the shape of. A bare calorie number with no macros is not
  // a target, so leave the grams alone rather than inventing a split.
  if (current <= 0 || want <= 0) return { ...t, kcal: want };
  const r = want / current;
  return fromGrams(base.p * r, base.c * r, base.f * r);
}

/**
 * A WHOLE SPLIT AT ONCE — and only once it adds up.
 *
 * Dustin, 11 Sep 2026: *"if I change protein, it needs to make the other two
 * carbs and fat needs to be red or some type of warning that they don't match
 * up to a hundred percent until I adjust them manually… when I change one, it
 * should not change the others."*
 *
 * The old `setPct` moved the other two to absorb the difference, which kept
 * the numbers valid at every keystroke and made a custom split impossible to
 * type: set protein to 30 and carbs moved on its own before you reached it.
 *
 * So percentages are now entered as a set. The editor holds the three boxes
 * while they are being typed, colours them until they total 100, and calls
 * this only when they do. Nothing is derived from a split that does not add
 * up, which is what keeps grams the single truth — see the header.
 */
export function fromPct(kcal: number, pct: Record<MacroKey, number>): MacroTargets {
  const g = (k: MacroKey) => (Math.max(0, kcal) * Math.max(0, pct[k])) / 100 / CALS_PER_G[k];
  return fromGrams(g("p"), g("c"), g("f"));
}

/** Whether a set of three percentages is a split at all. */
export function splitAddsUp(pct: Record<MacroKey, number>): boolean {
  return pct.p + pct.c + pct.f === 100;
}

/**
 * The grams a percentage of these calories comes to — the number that sits
 * beside the percentage box, which is exactly what he asked for.
 */
export function gramsAtPct(kcal: number, field: MacroKey, pct: number): number {
  return Math.round((kcal * pct) / 100 / CALS_PER_G[field]);
}
