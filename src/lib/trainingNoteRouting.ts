/**
 * Does this movement note need Dustin, or is it just for the record?
 *
 * Dustin, 15 Aug: "filter the ai stuff. if I need to deal w it send to me, if
 * not, send to ai feedback."
 *
 * ── The problem this solves ───────────────────────────────────────────────
 *
 * Every note a client typed on a movement fired a push, an email and an unread
 * badge — identical to a real message. On 15 Aug Jennifer sent four in ninety
 * minutes: "22.5 at PF", "12.5 at PF", "I used a bar at PF". Load bookkeeping.
 * Nothing to answer, three interruptions.
 *
 * But the same channel carried Claudine's "left knee has been feeling
 * uncomfortable" on 12 Aug — a symptom, on a corrective client, which is
 * exactly the signal that drives a regression decision. Silencing the channel
 * wholesale would have buried it.
 *
 * ── The rule, and why it leans this way ───────────────────────────────────
 *
 * Modelled on `isSubstantive` in /api/program-feedback, which settled the same
 * argument in Dustin's favour once already: the cost of delivering something
 * routine is one line he skims. The cost of swallowing a symptom is a client
 * who said their knee hurt and heard nothing back.
 *
 * So the default is DELIVER. A note is held back only when it is recognisably
 * pure bookkeeping and carries nothing else. Anything ambiguous goes to him.
 *
 * Every note is written to `exercise_notes` either way — that is what the
 * programming AI reads, and it happens before this function is consulted.
 * Nothing is ever lost here; the only question is whether his phone buzzes.
 */

/** Words that mean a body is complaining. Any one of these forces delivery. */
const SYMPTOM = [
  "pain", "painful", "hurt", "hurts", "hurting", "sore", "soreness", "ache",
  "aches", "aching", "achy", "tight", "tightness", "pull", "pulled", "strain",
  "strained", "tweak", "tweaked", "twinge", "spasm", "cramp", "cramping",
  "numb", "numbness", "tingle", "tingling", "sharp", "burning", "swollen",
  "swelling", "inflamed", "unstable", "gave out", "giving out", "locked up",
  "bother", "bothers", "bothered", "bothering", "irritated", "irritating",
  "uncomfortable", "discomfort", "flare", "flared", "flare-up", "injury",
  "injured", "re-injure", "reinjured", "dizzy", "lightheaded", "nauseous",
  "can't", "cant", "couldn't", "couldnt", "unable", "had to stop", "stopped",
  "skipped", "quit", "gave up", "worse", "worsening", "bad", "struggling",
  "struggled", "failed", "failure", "dropped", "form broke", "no good",
];

/** Words that mean they are talking to him, or about the app, not the weight. */
const NEEDS_HIM = [
  "?", "question", "should i", "can i", "could you", "can you", "let me know",
  "not sure", "unsure", "confused", "confusing", "help", "advice", "wondering",
  "doesn't help", "doesnt help", "not helpful", "wrong", "broken", "bug",
  "doesn't work", "doesnt work", "won't", "wont let", "missing", "video",
  "next time", "next week", "change", "swap", "replace", "instead of you",
];

/**
 * Bookkeeping shapes: a load, a machine substitution, a gym name. These are
 * what the AI wants when it writes the next block, and what he does not want
 * at 1pm on a Saturday.
 */
/**
 * Bookkeeping shapes: a load, a machine substitution, a gym name. These are
 * what the AI wants when it writes the next block, and what he does not want at
 * 1pm on a Saturday.
 *
 * TWO RULES LEARNED THE HARD WAY, both from tests that failed on the first run:
 *
 *  · NO COMMAS. "used the machine instead, knee was bothering me" matched the
 *    substitution pattern, because `[^?]*$` happily swallowed the second clause
 *    along with the symptom in it. A comma means there is a second thing being
 *    said, and the second thing is where the trouble usually is.
 *  · A LOAD MUST HAVE A DIGIT. The load pattern's leading group was optional,
 *    so it matched any short lowercase string — "asdf" routed as bookkeeping.
 *    An unrecognised note going quiet is the one failure mode this file exists
 *    to prevent.
 */
const BOOKKEEPING = [
  // A load or a duration, however it is phrased around the number: "22.5 at
  // PF", "110 lb assist", "PF chin up 60 lbs", "1 mile", "went up to 110".
  //
  // Anchoring the number at the START was wrong — "PF chin up 60 lbs" is the
  // gym first and the weight last, and that is Jennifer's normal phrasing. So
  // the rule is the shape of the whole note instead: SHORT, contains a DIGIT,
  // one clause. Every symptom, question and long-prose check has already run
  // above, so what reaches here and looks like this is a number being recorded.
  /^(?=[^,]*$)(?=.*\d)[a-z0-9 .'@:/x×+-]{1,44}$/i,
  // "used a bar", "used the hip thrust machine instead", "did stair master".
  // No comma, and short — one clause, not a paragraph with a clause in front.
  /^(?=[^,]*$)(i )?(used|did|ran|walked|swapped|subbed|substituted|switched)\b[a-z0-9 .'()/-]{0,44}$/i,
  // "machine instead", "dumbbells instead", "stair master again!"
  /^(?=[^,]*$)[a-z0-9 .'-]{0,40}(instead|again)!?$/i,
];

export type NoteRoute = "deliver" | "record-only";

/**
 * Where a movement note goes.
 *
 * `deliver`     → his inbox, as before: push, email, unread badge.
 * `record-only` → `exercise_notes` only. The AI still reads it; he is not
 *                 interrupted for it.
 */
export function routeTrainingNote(note: string): NoteRoute {
  const raw = (note || "").trim();
  if (!raw) return "record-only";

  const t = raw.toLowerCase();

  // A question mark is the clearest possible signal that somebody is waiting
  // for an answer. Checked before anything else and never overridden.
  if (t.includes("?")) return "deliver";

  const hasWord = (list: string[]) =>
    list.some((w) =>
      w.includes(" ") || !/^[a-z']+$/.test(w)
        ? t.includes(w)
        : // Whole word only. Without this, "band" matches "abandoned" and, more
          // to the point, "cant" matches "decant" and "sore" matches "soreness"
          // twice — harmless — but "bad" matches "badminton", which is not.
          new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i").test(t)
    );

  if (hasWord(SYMPTOM)) return "deliver";
  if (hasWord(NEEDS_HIM)) return "deliver";

  // Long notes are prose, and prose is somebody explaining something. The
  // bookkeeping we are filtering is short by nature — the longest real example
  // in the first three weeks was 38 characters.
  if (raw.length > 80) return "deliver";

  if (BOOKKEEPING.some((re) => re.test(raw))) return "record-only";

  // Unrecognised. Deliver it — see the header: ambiguity goes to him.
  return "deliver";
}
