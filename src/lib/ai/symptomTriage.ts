// SORE IS NOT NUMB, AND THE COACH HAS TO KNOW THE DIFFERENCE.
//
// `trainingNoteRouting.ts` has carried a symptom vocabulary since 15 Aug and it
// works — it is what decides whether a client's note buzzes Dustin's phone, and
// it is why Claudine's "left knee has been feeling uncomfortable" reached him.
// But it is a ONE-tier list, because for routing one tier is all that is
// needed: sore and numb both mean send it to him.
//
// For a coach talking to a client they are opposites. Sore legs are expected
// and get coached. A numb hand is a refer-out — do not diagnose it, do not work
// around it, do not suggest exercises for it.
//
// So the vocabulary is two-tier now, and it lives in `symptom_flags` rather
// than in a prompt. A safety list a model is asked to remember is a list it
// will eventually forget one item from, silently, on a turn nobody is watching.
// In a table it is testable, versionable, and fires the same way every time.
//
// The MATCHING RULE is lifted deliberately from isSymptomNote: a plain word
// matches on word boundaries, anything with a space or punctuation matches as a
// substring. Two different answers to "does this message mention pain" is how
// the phone buzzes for something the coach did not notice, or the reverse.

import { createAdminClient } from "@/lib/supabase/admin";
// The coach's name is never baked in: a client of another trainer being told to
// send it to Dustin is the app not knowing who trains them.
import { COACH_FIRST_NAME } from "@/lib/trainer";

export type SymptomTier = "none" | "ordinary" | "red_flag";

export interface Triage {
  tier: SymptomTier;
  /** The phrases that matched, for the model to quote back rather than guess. */
  matched: string[];
}

interface FlagRow { phrase: string; tier: "ordinary" | "red_flag" }

/**
 * Cached for the lifetime of the lambda. The list changes when Dustin changes
 * it, which is rarely, and re-reading it on every turn of every conversation
 * would put a query in front of every answer for no benefit.
 */
let CACHE: { rows: FlagRow[]; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

/**
 * THE FLOOR. Compiled in, and used when the table cannot be read.
 *
 * Found by running the triage with no database reachable: every message came
 * back "none", including "my hand went numb". A safety gate whose failure mode
 * is SILENTLY OFF is worse than no gate, because everything downstream —
 * the prompt, the escalation, the urgent push — behaves as though the message
 * were about a sore quad.
 *
 * So the table is where the list is EDITED, and this is the list that cannot go
 * missing. Anything Dustin adds lives only in the table; nothing he would want
 * enforced on the worst day of the year lives only there.
 */
const RED_FLOOR = [
  "numb", "numbness", "tingling", "pins and needles",
  "radiating", "shooting down", "down my leg", "down my arm",
  "dizzy", "dizziness", "lightheaded", "light headed",
  "faint", "fainted", "passed out", "blacked out",
  "chest pain", "chest tightness",
  "short of breath", "shortness of breath", "can't breathe", "cant breathe",
  "swollen", "swelling", "hot to touch",
  "gave out", "giving out", "gave way",
  "lost my balance", "slurred",
];

export async function loadSymptomFlags(): Promise<FlagRow[]> {
  if (CACHE && Date.now() - CACHE.at < TTL_MS) return CACHE.rows;
  try {
    const db = createAdminClient();
    const { data } = await db.from("symptom_flags").select("phrase, tier").eq("active", true);
    const rows = ((data as FlagRow[]) || []).filter((r) => r?.phrase && r?.tier);
    // Never cache an empty read. A transient failure would otherwise disarm the
    // red-flag list for ten minutes, which is exactly when it matters.
    if (rows.length) CACHE = { rows, at: Date.now() };
    return rows.length ? rows : floor();
  } catch (e) {
    console.error("symptom flags could not be read — falling back to the compiled red list", e);
    return floor();
  }
}

/** The compiled list, in the shape the matcher expects. */
function floor(): FlagRow[] {
  return RED_FLOOR.map((phrase) => ({ phrase, tier: "red_flag" as const }));
}

/** The same rule isSymptomNote uses. See the header for why it must stay so. */
function mentions(text: string, phrase: string): boolean {
  return phrase.includes(" ") || !/^[a-z'-]+$/.test(phrase)
    ? text.includes(phrase)
    : new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(text);
}

/**
 * What is in this message, if anything.
 *
 * Red beats ordinary: a message saying "my knee is sore and my foot went numb"
 * is a red flag with a sore knee in it, not a sore knee with a detail.
 */
export async function triageSymptoms(message: string): Promise<Triage> {
  const t = (message || "").trim().toLowerCase();
  if (!t) return { tier: "none", matched: [] };

  const rows = await loadSymptomFlags();
  const red = rows.filter((r) => r.tier === "red_flag" && mentions(t, r.phrase)).map((r) => r.phrase);
  if (red.length) return { tier: "red_flag", matched: red };

  const ord = rows.filter((r) => r.tier === "ordinary" && mentions(t, r.phrase)).map((r) => r.phrase);
  return ord.length ? { tier: "ordinary", matched: ord } : { tier: "none", matched: [] };
}

/**
 * What to put in front of the model for this turn.
 *
 * Returned as its own block rather than folded into the assessment rules,
 * because it is about THIS message rather than about this person, and it has to
 * arrive last — after everything else the model has read — so it is the
 * instruction still in view when it starts writing.
 */
export function triageBlock(t: Triage, coachFirstName: string = COACH_FIRST_NAME): string {
  if (t.tier === "none") return "";
  const quoted = t.matched.map((m) => `"${m}"`).join(", ");

  if (t.tier === "red_flag") {
    return (
      `⛔ STOP — THIS MESSAGE CONTAINS A REFER-OUT SYMPTOM (${quoted}).\n` +
      `This is the one category you do not coach, do not work around, and do not offer exercises for. ` +
      `Not a modification, not a lighter version, not "try it and see". Do not diagnose it and do not ` +
      `speculate about what it might be — you do not know, and a guess here is the worst thing you can say.\n` +
      `What to do instead, in this order: acknowledge it plainly and without alarming them; say clearly ` +
      `that this one is for their trainer rather than for you, and why in one short sentence; tell them not ` +
      `to train through it in the meantime; and OFFER to send it to him — "want me to send this to ` +
      `${coachFirstName} now?" — then let them choose. Do not send it yourself; they send it.\n` +
      `If they push for advice anyway, hold the line kindly. "I'd rather he looked at that one" is a ` +
      `complete answer.`
    );
  }

  return (
    `THIS MESSAGE MENTIONS A SYMPTOM (${quoted}) — ASK BEFORE YOU ADVISE.\n` +
    `If this is the FIRST time they have raised it in this conversation, your reply is a QUESTION, not an ` +
    `answer. Up to two, and the two that earn their place are: exactly where, and whether it is the same ` +
    `spot as before or somewhere new. Sharp, achy, when in the movement, and how long are the next best. ` +
    `Not three; interrogation is its own failure.\n` +
    `Once they have answered, reason from their assessment and give them something to do — that is the ` +
    `whole point of asking. Do not ask and then hand it over anyway.\n` +
    `If they have ALREADY told you the detail, do not ask again. Repeating a question they just answered is ` +
    `worse than not asking at all.`
  );
}
