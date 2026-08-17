// The logger has to show the WHOLE movement name.
//
// Dustin, 17 Aug: "I need you to resize exercise names in the logger where we
// can see the full name. do not mess up anything on layout or spacing in the
// app we've finally perfected. we had this right and at some point it got
// changed back. I have to see the full name of every movement from logger
// screen."
//
// He is right that it got changed back, and it is in the history: commit
// 0a512b4 on 4 Aug added `WebkitLineClamp: 2` to the <h2>. Before that the
// heading had no clamp and wrapped as far as it needed. His screenshot shows
// the consequence — "Cable Rope Tricep…" on a 27-character name, because the
// title column is what is left after a 60px video thumbnail and three 36px
// tool buttons.
//
// Simply deleting the clamp is not enough, and would break the other half of
// what he asked for. Measured against the live database: 627 distinct
// programmed movements, of which 111 are over 30 characters and 29 are over 40.
// The longest is 55 — "Side-Lying Ribcage Breathing Expansion over Foam
// Roller". At a fixed 20px that is four lines, and the header would shove the
// Track chips and the whole set grid down the screen on every corrective day.
//
// So: never truncate, and step the size down as the name gets longer, so the
// heading stays about the same height instead of growing.
//
// THE COMMON CASE IS DELIBERATELY UNTOUCHED. 317 of the 627 names are 22
// characters or fewer and keep `text-xl` exactly as it is today. Half the
// library looks identical to the screen he says is finally right; only the
// names that were being cut off change at all.

/** Tailwind size class for the logger's exercise heading. */
export type TitleSize = "text-xl" | "text-lg" | "text-base" | "text-sm";

/**
 * The ladder, in order. `max` is the longest name that still gets this size.
 *
 * Breakpoints come from the usable title width in his screenshot — roughly
 * 200 CSS px once the thumbnail and the three buttons are taken out — and the
 * rule that a name should land in at most two lines. They are approximate by
 * nature: this is a heuristic about character counts, not a text measurement,
 * and a name of unusually wide characters can still take a third line. That is
 * the accepted trade. A third line is a bigger heading; a clamp is a name the
 * client cannot read, and he has now asked for it twice.
 */
export const TITLE_LADDER: ReadonlyArray<{ max: number; size: TitleSize }> = [
  { max: 22, size: "text-xl" },   // 317 of 627 movements — unchanged
  { max: 34, size: "text-lg" },   // "Cable Rope Tricep Extension" (27) lands here
  { max: 46, size: "text-base" },
  { max: Infinity, size: "text-sm" }, // "Side-Lying Ribcage Breathing…" (55)
];

/**
 * Which size class this movement's name should use.
 *
 * Never returns a truncating class and never returns null — every name gets a
 * size, because a name with no size is a name that does not render.
 */
export function exerciseTitleSize(name: string | null | undefined): TitleSize {
  const len = (name ?? "").trim().length;
  for (const step of TITLE_LADDER) {
    if (len <= step.max) return step.size;
  }
  // Unreachable while the ladder ends at Infinity, and deliberately not thrown:
  // a heading is not worth a crash mid-set.
  return "text-sm";
}
