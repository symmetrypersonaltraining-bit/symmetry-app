// Two guards on the copy the weekly sweep publishes.
//
// Extracted so the tests exercise THESE functions rather than a reconstruction
// of them. A test that reimplements the rule it is checking cannot catch a
// change to the rule.

/**
 * A NUMBER THAT WAS TRUE WHEN WRITTEN AND FALSE WHEN READ IS STILL FALSE.
 *
 * The weekly sweep runs late on a Saturday for the week beginning the next day,
 * so it passes audience "nextWeek" and weeklyNumbersBlock hands the model
 * windows already relabelled "THE WEEK BEFORE LAST" and "LAST WEEK", with an
 * explicit instruction never to call either of them "this week".
 *
 * The model said it anyway. Dustin's programming question on 1 Sep opened
 * "You completed 8 of 9 sessions last week but are sitting at 5 of 8 this week"
 * — 5 of 8 is what he did the week BEFORE, and this week he had trained twice
 * out of three. It asked him to explain a shortfall that had not happened.
 *
 * An instruction with nothing enforcing it is a hope. This is the enforcement.
 */
export const CLAIMS_THIS_WEEK = /\b(this|current)\s+week\b|\bso far this week\b|\bweek so far\b/i;

/**
 * Trim to a length without cutting a word in half.
 *
 * `.slice(0, 200)` chopped that same question at "actually fitting your
 * schedule ri". A sentence that stops mid-word reads as a broken app, and a
 * question the client cannot finish reading is one they cannot answer.
 *
 * Prefers to end on a sentence, then on a word, and only cuts blind when the
 * limit lands so early in the text that neither is available.
 */
export function trimToWord(text: string, max: number): string {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (lastStop > max * 0.6) return cut.slice(0, lastStop + 1).trim();
  if (lastSpace > max * 0.6) return cut.slice(0, lastSpace).trim() + "…";
  return cut.trim() + "…";
}
