/**
 * THE COACH MAY NOT SAY IT DID SOMETHING IT DID NOT DO.
 *
 * Dustin, 13 Sep 2026, 3:12pm Central. He asked the ✦ Coach:
 *
 *   him: "log a 3 mile hike for my cardio today"
 *   it:  "On it — logging a 3-mile hike for your cardio today. Done. Good way
 *         to kick off the week, Dustin — get that first session in the books…"
 *
 * It wrote NOTHING. No cardio_logs row, no offplan_workout_logs row, nothing on
 * the schedule, no ai_action_log entry. Three hours later he opened the Workout
 * tab, saw "Rest day", and reported it as the hike not showing up. The hike had
 * never existed. The word "Done" was manufactured.
 *
 * ── WHY THE PROMPT DID NOT STOP IT ───────────────────────────────────────────
 *
 * It was already forbidden, twice over. The nutrition extractor's own prompt
 * says training "is handled by another part of the same coach… respond intent
 * 'none' with params {"clarify":false} and an EMPTY reply". The model wrote the
 * sentence anyway.
 *
 * This is the same lesson as weekly-copy-guards.ts, in the same codebase, six
 * weeks apart: *an instruction with nothing enforcing it is a hope.* The reply
 * is the one place a model can do damage without touching the database, because
 * the client believes it and stops checking.
 *
 * ── WHY THIS IS SAFE TO APPLY BLUNTLY ────────────────────────────────────────
 *
 * The guard runs ONLY on the `intent: "none"` return paths of
 * /api/nutrition-ai/act — the paths that are, by construction, the ones where
 * nothing was written. A tool that actually ran returns earlier, with its own
 * text, and never reaches here. So on this path a first-person completion claim
 * is not "probably wrong": it is false by definition, every time.
 *
 * That is what lets the patterns be simple. They do not have to judge whether a
 * claim is true — they only have to recognise a claim.
 *
 * Second person is deliberately untouched. "You logged five meals yesterday" is
 * about the CLIENT and is usually the most useful sentence in the reply.
 */

/** The honest sentence that replaces whatever was stripped. */
export const NOTHING_HAPPENED =
  "I haven't made that change — nothing was logged, moved or saved.";

/**
 * A sentence in which the assistant claims to have completed an action.
 *
 * Four shapes, all first-person or bare-completion:
 *   1. "I've logged it", "I added that", "I moved your session"
 *   2. "Done.", "All set.", "On it — …"
 *   3. "That's logged", "it's on your schedule now"
 *   4. "Logged it.", "Added that."
 */
export const CLAIMS_AN_ACTION = new RegExp(
  [
    // 1. I / I've / I have + a write verb
    String.raw`\bI(?:'ve| have| just| already)?\s+(?:(?:went|gone|go)\s+ahead\s+and\s+)?(?:logged|added|recorded|saved|moved|swapped|scheduled|rescheduled|updated|marked|booked|set up|put)\b`,
    // 2. bare completion tokens, at the start of a sentence
    String.raw`^\s*(?:done|all set|all done|on it|consider it done|got it[—,-]\s*done)\b`,
    // 3. "that's logged" / "it's in your schedule"
    String.raw`\b(?:that(?:'s| is)|it(?:'s| is))\s+(?:now\s+)?(?:logged|added|recorded|saved|in|on your (?:schedule|calendar|log))\b`,
    // 4. imperative-looking past tense with no subject
    String.raw`^\s*(?:logged|added|recorded|saved|moved|swapped)\s+(?:it|that|your)\b`,
  ].join("|"),
  "i",
);

/** Split on sentence ends, keeping the delimiter so rejoining reads naturally. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

export interface ClaimCheck {
  /** The reply as it should actually be sent. */
  text: string;
  /** The sentences removed, for the log. Empty when the reply was honest. */
  stripped: string[];
}

/**
 * Remove any sentence claiming an action happened, and say so plainly.
 *
 * Returns the reply unchanged when it claims nothing — the overwhelmingly
 * common case, and the one that must stay bit-for-bit identical so that fixing
 * this does not quietly reword every honest answer the coach gives.
 */
export function stripFalseClaims(reply: string): ClaimCheck {
  const text = (reply || "").trim();
  if (!text) return { text, stripped: [] };

  const kept: string[] = [];
  const stripped: string[] = [];
  for (const s of sentences(text)) {
    if (CLAIMS_AN_ACTION.test(s)) stripped.push(s.trim());
    else kept.push(s.trim());
  }

  if (!stripped.length) return { text, stripped: [] };

  // The honest line goes FIRST. A correction buried under three sentences of
  // coaching is a correction the client scrolls past — and the thing being
  // corrected is the thing they were about to rely on.
  const rest = kept.join(" ").trim();
  return { text: rest ? `${NOTHING_HAPPENED} ${rest}` : NOTHING_HAPPENED, stripped };
}
