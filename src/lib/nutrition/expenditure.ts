/**
 * WHAT SOMEBODY ACTUALLY BURNS IN A DAY — worked out here, in code.
 *
 * Dustin, 11 Sep 2026: *"For the build my own plan, when I have AI set the
 * numbers, where is it getting my total calorie expenditure from? Because I
 * never put my height in the test client app, and it needs my height to be
 * able to figure out that number accurately. So something is missing."*
 *
 * He was right, and the answer was: nowhere. There was no expenditure
 * calculation in this app at all. The consult handed the model a weight, a body
 * fat and a goal, and the model wrote sentences like *"approximately 500-600
 * kcal below estimated TDEE"* — having estimated that TDEE from nothing. No
 * height reached it (the column did not exist until the same afternoon), no
 * age, no sex.
 *
 * So: *"set up the TDEE calculation in here in the code… If those numbers are
 * not already in my profile, it needs to ask for them and put them in my
 * profile for future use, and then it needs to get an accurate number to build
 * the plan off of that."*
 *
 * ── WHY THE MODEL MUST NOT DO THIS ─────────────────────────────────────────
 *
 * It is arithmetic with published coefficients. A model asked for arithmetic
 * produces a plausible number, and a plausible number is the exact failure
 * this whole screen is being rebuilt around: *"the only thing worse than not
 * tracking it at all is tracking it and then the app telling you what to
 * adjust based on bad numbers."* Two clients with identical stats got
 * different targets on different days. Now the same inputs give the same
 * answer, every time, and the model is handed the number and told not to
 * recompute it.
 *
 * ── THESE ARE ESTIMATES AND THE APP SAYS SO ────────────────────────────────
 *
 * Every TDEE formula is a population average; a real person can sit 15% either
 * side. That is not a reason to guess instead — it is a reason to start from
 * the best published estimate, say plainly that it is one, and let the logged
 * data correct it. Nothing here pretends to more precision than it has.
 */

/** Which of the four the calculation cannot proceed without. */
export type MissingInput = "sex" | "age" | "height" | "weight";

export interface BodyInputs {
  sex: "male" | "female";
  ageYears: number;
  heightIn: number;
  weightLb: number;
  /** Optional, and when present it changes which formula is used. */
  bodyFatPct?: number | null;
}

/** How the day is spent OUTSIDE training — the consult's third question. */
export type Occupation = "desk" | "mixed" | "feet";

/** The consult's first two questions. */
export type Goal = "lose" | "recomp" | "build";
export type Pace = "steady" | "aggressive" | "slow";

const LB_PER_KG = 2.20462;
const IN_PER_CM = 2.54;

/**
 * What is missing, in the order it should be asked for.
 *
 * Age comes from a date of birth, height and sex from the client record, and
 * weight from the newest weigh-in. Any of them absent and the honest move is to
 * stop and ask rather than to assume a default — a wrong sex alone moves the
 * answer by about 160 kcal a day, and a defaulted one is invisible.
 */
export function missingForExpenditure(i: Partial<BodyInputs>): MissingInput[] {
  const out: MissingInput[] = [];
  if (i.sex !== "male" && i.sex !== "female") out.push("sex");
  if (!Number.isFinite(i.ageYears) || (i.ageYears as number) <= 0) out.push("age");
  if (!Number.isFinite(i.heightIn) || (i.heightIn as number) <= 0) out.push("height");
  if (!Number.isFinite(i.weightLb) || (i.weightLb as number) <= 0) out.push("weight");
  return out;
}

/** Whole years from a "YYYY-MM-DD" date of birth, as of a Central date. */
export function ageFrom(dob: string | null | undefined, today: string): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age > 0 && age < 120 ? age : null;
}

export interface BmrResult {
  value: number;
  /** Which formula ran, so the client can be told. */
  basis: "katch-mcardle" | "mifflin-st-jeor";
}

/**
 * Resting burn.
 *
 * **Katch-McArdle when body fat is known**, because it works from lean mass and
 * is the better estimate for anyone whose composition is away from average —
 * which is most people who own a body-fat number. `370 + 21.6 × lean kg`.
 *
 * **Mifflin-St Jeor otherwise**: `10×kg + 6.25×cm − 5×age`, `+5` male, `−161`
 * female. It is the one with the best-validated error of the general formulas,
 * which is why it is the fallback rather than Harris-Benedict.
 */
export function bmrFor(i: BodyInputs): BmrResult {
  const kg = i.weightLb / LB_PER_KG;
  const bf = i.bodyFatPct;
  if (bf != null && Number.isFinite(bf) && bf > 0 && bf < 70) {
    const leanKg = kg * (1 - bf / 100);
    return { value: Math.round(370 + 21.6 * leanKg), basis: "katch-mcardle" };
  }
  const cm = i.heightIn * IN_PER_CM;
  const base = 10 * kg + 6.25 * cm - 5 * i.ageYears;
  return { value: Math.round(base + (i.sex === "male" ? 5 : -161)), basis: "mifflin-st-jeor" };
}

/**
 * Everything on top of resting: how the day is spent, plus training.
 *
 * Split in two deliberately. The usual single "activity level" dropdown makes
 * somebody choose between "my job" and "my training" when they have both, and
 * that is precisely the person on this roster — a desk job and five sessions a
 * week is not the same as being on your feet all day and never training, and
 * one dropdown cannot say it.
 *
 * Occupation is the NEAT floor; each training day adds on top of it.
 */
export const OCCUPATION_FACTOR: Record<Occupation, number> = {
  desk: 1.2,   // sedentary baseline
  mixed: 1.35, // some standing and walking
  feet: 1.5,   // on their feet all day
};

/** Per training day per week. Four sessions is +0.10 — about a 7% day. */
export const PER_TRAINING_DAY = 0.025;

export function activityFactor(occupation: Occupation, trainingDaysPerWeek: number): number {
  const days = Math.min(7, Math.max(0, Math.round(trainingDaysPerWeek || 0)));
  const f = OCCUPATION_FACTOR[occupation] + days * PER_TRAINING_DAY;
  // A factor above 2.0 belongs to an athlete in a training camp, not to anyone
  // filling in three chips on a phone.
  return Math.round(Math.min(2, f) * 1000) / 1000;
}

export interface Expenditure {
  bmr: number;
  bmrBasis: BmrResult["basis"];
  factor: number;
  tdee: number;
}

export function expenditureFor(i: BodyInputs, occupation: Occupation, trainingDaysPerWeek: number): Expenditure {
  const b = bmrFor(i);
  const factor = activityFactor(occupation, trainingDaysPerWeek);
  return { bmr: b.value, bmrBasis: b.basis, factor, tdee: Math.round(b.value * factor) };
}

/**
 * The calorie move for the goal, as a share of expenditure rather than a flat
 * number: 500 off a 3,600 kcal day is a nudge, and off a 1,700 kcal day it is
 * a crash. A percentage is the same instruction to both.
 */
export const GOAL_SHIFT: Record<Goal, Record<Pace, number>> = {
  lose:   { slow: -0.10, steady: -0.18, aggressive: -0.25 },
  recomp: { slow: -0.03, steady: -0.05, aggressive: -0.08 },
  build:  { slow: 0.05, steady: 0.10, aggressive: 0.15 },
};

/** Nobody is sent below this, whatever the arithmetic says. */
export const FLOOR_KCAL = { male: 1500, female: 1200 } as const;

export interface Recommendation {
  targets: { kcal: number; p: number; c: number; f: number };
  expenditure: Expenditure;
  /** Plain sentences built from the real numbers — not a model's prose. */
  reasoning: string;
  /** True when the floor caught the arithmetic. */
  flooredAt?: number;
}

/**
 * The whole recommendation, from real inputs, with the reasoning written from
 * the same numbers it used.
 *
 * PROTEIN is set on lean mass when body fat is known (1.0 g/lb lean, the figure
 * that holds muscle in a deficit) and on total bodyweight otherwise, at the
 * 0.8-1.2 g/lb the prompt has always asked for. FAT holds at 25% of calories,
 * never below 0.3 g/lb — a floor, because very low fat is where hormones and
 * adherence both go. CARBS take what is left, which is the only one of the
 * three that should be a remainder.
 */
export function recommendTargets(
  i: BodyInputs, occupation: Occupation, trainingDaysPerWeek: number, goal: Goal, pace: Pace,
): Recommendation {
  const expenditure = expenditureFor(i, occupation, trainingDaysPerWeek);
  const shift = GOAL_SHIFT[goal][pace];
  const raw = Math.round(expenditure.tdee * (1 + shift));
  const floor = FLOOR_KCAL[i.sex];
  const kcal = Math.max(floor, raw);

  const bf = i.bodyFatPct;
  const leanLb = bf != null && bf > 0 && bf < 70 ? i.weightLb * (1 - bf / 100) : null;
  const p = Math.round(leanLb != null ? leanLb * 1.0 : i.weightLb * 0.9);

  const fatFromPct = (kcal * 0.25) / 9;
  const fatFloor = i.weightLb * 0.3;
  const f = Math.round(Math.max(fatFromPct, fatFloor));

  const left = kcal - p * 4 - f * 9;
  const c = Math.max(0, Math.round(left / 4));

  const pct = Math.round(Math.abs(shift) * 100);
  const dir = shift < 0 ? "below" : shift > 0 ? "above" : "at";
  const bits = [
    `Resting burn is about ${expenditure.bmr} kcal (${expenditure.bmrBasis === "katch-mcardle" ? "from your lean mass" : "from your height, weight, age and sex"}).`,
    `With ${occupation === "desk" ? "a desk job" : occupation === "feet" ? "being on your feet all day" : "a mix of sitting and moving"} and ${Math.round(trainingDaysPerWeek || 0)} training ${Math.round(trainingDaysPerWeek || 0) === 1 ? "day" : "days"} a week, that comes to roughly ${expenditure.tdee} kcal a day.`,
    shift === 0
      ? `Targets are set at maintenance.`
      : `Your target is ${pct}% ${dir} that, at ${kcal} kcal.`,
    `Protein ${p} g${leanLb != null ? " (1 g per lb of lean mass)" : " (0.9 g per lb of bodyweight)"}, fat ${f} g, carbs ${c} g with what is left.`,
    `These are estimates from published formulas — your own logged intake will tell us more than any formula can, so we adjust from what actually happens.`,
  ];
  if (kcal > raw) bits.splice(3, 0, `The arithmetic came to ${raw} kcal, which is below the ${floor} kcal floor, so the target is the floor.`);

  return {
    targets: { kcal, p, c, f },
    expenditure,
    reasoning: bits.join(" "),
    ...(kcal > raw ? { flooredAt: floor } : {}),
  };
}

/**
 * The consult's three chips, as the calculation's inputs.
 *
 * The chip TEXT is the wire format — it is what the sheet sends and what is
 * stored in the answers blob — so the mapping lives here beside the formulas
 * rather than in the route, and it is tested. An unrecognised chip falls to
 * the middle option rather than throwing: a plan with a slightly wrong
 * activity factor beats no plan at all, and the number is shown to the client
 * either way.
 */
export function parseConsultAnswers(a: Record<string, unknown> | null | undefined): {
  goal: Goal; pace: Pace; occupation: Occupation;
} {
  const t = (k: string) => String(a?.[k] ?? "").toLowerCase();
  const g = t("goal");
  const p = t("pace");
  const o = t("activity");
  return {
    goal: g.includes("lose") ? "lose" : g.includes("build") ? "build" : "recomp",
    pace: p.includes("aggressive") ? "aggressive" : p.includes("slow") ? "slow" : "steady",
    occupation: o.includes("desk") ? "desk" : o.includes("feet") ? "feet" : "mixed",
  };
}

/** What to call each missing input when asking a person for it. */
export const MISSING_LABEL: Record<MissingInput, string> = {
  sex: "sex", age: "date of birth", height: "height", weight: "current weight",
};
