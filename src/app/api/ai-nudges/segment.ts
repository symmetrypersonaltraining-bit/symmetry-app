// Nudge segmentation — pure, so the rules that decide who gets messaged in
// Dustin's name can actually be tested. No DB, no network, no Next runtime.
//
// Extracted from the route on 10 Aug when the nutrition rule changed: these
// messages land in a client's inbox looking like Dustin wrote them, and the
// old rule targeted people who had never once logged a meal.

/** Days of meal logging inside 30 that count as "this person uses nutrition". */
export const NUTRITION_HABIT_DAYS = 8;
/** Days of silence after that habit before it counts as having stopped. */
export const NUTRITION_LAPSE_DAYS = 4;
/**
 * Nudges per lapse, not per week. "2 times reminding is enough dont bug them
 * with it." Counted since their LAST meal log, so it resets the moment they
 * log again — two reminders per time they fall off, never a running tally.
 */
export const NUTRITION_MAX_PER_LAPSE = 2;

export type Tone = "warm" | "push" | "direct" | "gentle";
export type Seg = "thriving" | "overtraining" | "nutrition_gap" | "slipping" | "quiet" | "escalate" | "never_started";

export interface Row {
  id: string;
  name: string | null;
  goal: string | null;
  w7: number;
  w30: number;
  daysSinceWorkout: number | null;
  mealDays7: number;
  mealDays30: number;
  daysSinceMeal: number | null;
  everTrained: boolean;
  everLoggedMeal: boolean;
}

export function isRehab(goal: string | null): boolean {
  const g = (goal || "").toLowerCase();
  return g.includes("rehab") || g.includes("pain") || g.includes("injur");
}

export function segment(r: Row): { seg: Seg; tone: Tone } {
  if (isRehab(r.goal)) {
    // Rehab clients never get the hard track, whatever the numbers say.
    if (r.daysSinceWorkout != null && r.daysSinceWorkout >= 10) return { seg: "escalate", tone: "gentle" };
    if (r.daysSinceWorkout != null && r.daysSinceWorkout >= 3) return { seg: "quiet", tone: "gentle" };
    return { seg: "thriving", tone: "gentle" };
  }
  if (!r.everTrained) return { seg: "never_started", tone: "warm" };
  if (r.daysSinceWorkout != null && r.daysSinceWorkout >= 10) return { seg: "escalate", tone: "direct" };
  if (r.w7 >= 10) return { seg: "overtraining", tone: "warm" };
  if (r.daysSinceWorkout != null && r.daysSinceWorkout >= 5) return { seg: "quiet", tone: "warm" };
  if (r.w7 <= 3 && r.w30 <= 10) return { seg: "slipping", tone: "push" };
  // Nutrition nudges go to people who HAD a habit and stopped. Nobody else.
  //
  // Dustin, 10 Aug: "only bug people about nutrition that are consistently
  // logging then suddenly stop... some clients dont use the nutrition and
  // that's fine."
  //
  // The old rule fired on `daysSinceMeal == null`, which is precisely the
  // client who has NEVER logged a meal — so the people least interested in
  // nutrition were the ones being chased about it. NUTRITION_HABIT_DAYS of
  // logging inside 30 days is the evidence of a real habit; without it this
  // segment never fires, and not using the food logger is simply allowed.
  if (
    r.w7 >= 4 &&
    r.everLoggedMeal &&
    r.mealDays30 >= NUTRITION_HABIT_DAYS &&
    r.daysSinceMeal != null &&
    r.daysSinceMeal >= NUTRITION_LAPSE_DAYS
  ) {
    return { seg: "nutrition_gap", tone: "push" };
  }
  return { seg: "thriving", tone: "warm" };
}


/** Test seam — the same function the route uses. */
export const segmentForTest = segment;
