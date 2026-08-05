// Which way is "better" on this movement?
//
// Dustin, 2026-08-05, on Tim Yancey's profile: "prs are not trackjng here, he
// just went uo on assisted dips".
//
// He had. Tim's assisted dip, by session:
//
//     Jul  4   140x10, 120x10, 20x10
//     Jul 22   130x20, 120x20
//     Aug  5   120x20, 110x20      <- the one Dustin was pointing at
//
// On an assisted dip or pull-up machine the stack counterweights the lifter.
// 110 lb of assistance for 20 reps is a great deal stronger than 140 lb for 10.
// Every "best" in this app was MAX(weight_lbs), so it read Tim's best as the
// 140 from 4 July, and had been reporting the lift as unmoved for four weeks
// while he took 30 lb off the stack and doubled the reps. His PRs could never
// fire at all, and the plateau card was flagging progress as a stall.
//
// This module is the ONE place that answers the question. Four separate
// comparisons used to each assume bigger-is-better independently; that is
// precisely the shape of thing that gets fixed in three of them and missed in
// the fourth.
//
// The flag lives on the exercise (exercises.load_is_assistance) so it is a
// property of the movement and can be corrected by hand — "assisted" is not
// always in the name, and a machine can be rigged either way. The name test
// below is only the fallback for call sites that have a name and no row.

/** Movements whose load counterweights the lifter: less is stronger. */
export function looksLikeAssistance(name: string | null | undefined): boolean {
  const n = (name || "").toLowerCase();
  // Word-boundaried: "assisted dip" yes, "assistance band row" no — a band's
  // resistance goes the normal way round.
  return /(^|[^a-z])assisted([^a-z]|$)/.test(n) || /counter ?balance/.test(n);
}

/**
 * Is `candidate` a better effort than `incumbent` on this movement?
 *
 * Equal is NOT better — a personal record has to actually beat something, or
 * repeating last week's numbers would fire a celebration every session.
 */
export function isBetterLoad(candidate: number, incumbent: number, assistance: boolean): boolean {
  return assistance ? candidate < incumbent : candidate > incumbent;
}

/** The better of two loads on this movement. */
export function bestLoad(a: number, b: number, assistance: boolean): number {
  return isBetterLoad(a, b, assistance) ? a : b;
}

/**
 * Sort comparator putting the most impressive lift first.
 *
 * Used to pick which PR headlines the celebration screen. On an assisted
 * movement the smallest number is the achievement, so a single ordering rule
 * cannot serve both — hence a comparator that takes the flag.
 */
export function compareLoads(
  a: { weight: number; assistance?: boolean },
  b: { weight: number; assistance?: boolean },
): number {
  // Real load first (a 225 lb squat outranks shedding 10 lb of assistance),
  // then by how impressive each is within its own kind.
  if (!!a.assistance !== !!b.assistance) return a.assistance ? 1 : -1;
  return a.assistance ? a.weight - b.weight : b.weight - a.weight;
}

/**
 * How to say it out loud.
 *
 * "120 lb" on an assisted dip is meaningless without the direction, and
 * "previous best 140 lb" reads like he went backwards. Everywhere a load is
 * shown for one of these it says what the number is.
 */
export function loadLabel(weight: number, assistance: boolean): string {
  return assistance ? `${weight} lb assist` : `${weight} lb`;
}
