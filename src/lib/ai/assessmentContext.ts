// WHAT THIS CLIENT'S BODY CAN AND CANNOT DO.
//
// Until 5 Sep 2026 no client-facing AI surface in this app had ever read an
// assessment. Not one line. It knew what somebody lifted, ate, weighed and had
// scheduled, and nothing whatever about them physically — so asked "can I add
// some squats?" by a man whose lumbar spine is FUSED, it said yes.
//
// Dustin's ruling, 5 Sep, choosing the most demanding of four options: when a
// client says a movement hurts, the coach reasons the way he would, from that
// client's own assessment. And on the limits themselves:
//
//   "they are not hard rules but ai needs to ask about contradictions w a mild
//    warning before overriding them."
//
// So this block exists to be REASONED WITH, not enforced. A refusal here would
// be the "ask your coach" reflex that made Bobbie Page give up on the app on
// 14 Aug, and he has ruled against it twice in two days. The coach names what a
// request cuts across, says why in plain words, and asks. Then it does what
// they say.
//
// ⛔ AND IT NEVER NAMES THE METHOD. Second ruling, same day: "explain it simply,
// never name it." The reasoning goes to the client in everyday language — "your
// ankle's stiff, and a stiff ankle makes your back work harder every step" —
// with no phase names, no NASM vocabulary, no inhibit / lengthen / activate /
// integrate. That is a standing guardrail for all client-facing copy; what is
// new is that the REASONING must now travel, in plain words.

import type { Db } from "@/lib/ai/scope";

/** The overhead-squat checkpoints, in the order they are screened: ground up. */
const CHECKPOINTS: Array<[string, string]> = [
  ["feet_turn_out", "feet turn out"],
  ["knees_cave_in", "knees cave in"],
  ["excessive_forward_lean", "excessive forward lean"],
  ["low_back_arch", "low back arches"],
  ["arms_fall_forward", "arms fall forward / shoulders round"],
  ["forward_head", "head sits forward"],
  ["lateral_asymmetry", "shifts to one side"],
  ["balance_deficits", "balance / coordination deficits"],
];

/**
 * The assessment block for a client, or a line saying there isn't one.
 *
 * THE ABSENCE IS AS IMPORTANT AS THE PRESENCE. Half the roster has no
 * assessment on file — 14 of 28 on the day this shipped — and a coach that
 * quietly reasons from an empty form is worse than one that says it does not
 * know. Rule 2 of the AI contract: "no data" is not "zero".
 *
 * Best-effort like every other context builder here: a failure returns a line
 * saying the assessment could not be read, never an exception, because losing
 * the assessment must not cost the client their answer.
 */
export async function assessmentBlock(db: Db, clientId: string | null): Promise<string> {
  if (!clientId) return "";
  try {
    const { data } = await db
      .from("client_assessments")
      .select(
        "assessed_at, current_injuries, chronic_conditions, pain_location, pain_onset, prior_surgeries, hip_issues, " +
          "feet_turn_out, knees_cave_in, excessive_forward_lean, low_back_arch, arms_fall_forward, forward_head, " +
          "lateral_asymmetry, balance_deficits, ohsa_notes, contraindication_flags, contraindicated_movements, trainer_notes",
      )
      .eq("client_id", clientId)
      .order("assessed_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const a = data as Record<string, unknown> | null;
    if (!a) {
      return (
        `THEIR ASSESSMENT: none on file. You do not know how this person moves, what hurts, or what they should work around. ` +
        `Say so plainly if they ask you something that needs it — "I don't have your assessment on file, so I'd rather not guess at that one" — ` +
        `and offer to flag it for their trainer. Do NOT reason about their body from their training history, their goal or their age; ` +
        `an assessment you invented is worse than none.\n\n${CORRECTION_RULES}`
      );
    }

    const str = (k: string) => {
      const v = a[k];
      return typeof v === "string" && v.trim() ? v.trim() : "";
    };

    const lines: string[] = [];

    // Ground up, which is the order he screens in and the order the findings
    // matter in — the lowest restricted checkpoint is usually the root.
    const found = CHECKPOINTS.filter(([k]) => a[k] === true).map(([, label]) => label);
    if (found.length) {
      lines.push(
        `- Movement screen, from the ground up: ${found.join("; ")}. ` +
          `The LOWEST thing on that list is usually where the rest of it starts.`,
      );
    } else {
      lines.push(`- Movement screen: nothing flagged.`);
    }
    if (str("ohsa_notes")) lines.push(`- Screen notes: ${str("ohsa_notes")}`);

    if (str("current_injuries")) lines.push(`- Injuries: ${str("current_injuries")}`);
    if (a.hip_issues === true) lines.push(`- Hip issues noted at intake.`);
    if (str("pain_location")) {
      lines.push(`- Pain: ${str("pain_location")}${str("pain_onset") ? ` (${str("pain_onset")})` : ""}`);
    }
    if (str("prior_surgeries")) lines.push(`- Prior surgeries: ${str("prior_surgeries")}`);
    if (str("chronic_conditions")) lines.push(`- Conditions: ${str("chronic_conditions")}`);

    const flags = Array.isArray(a.contraindication_flags)
      ? (a.contraindication_flags as unknown[]).filter((f): f is string => typeof f === "string" && !!f.trim())
      : [];
    const notes = str("contraindicated_movements");
    if (flags.length || notes) {
      lines.push(
        `- WORK AROUND — the important part:` +
          (flags.length ? `\n  · ${flags.join("\n  · ")}` : "") +
          (notes ? `\n  · ${notes.replace(/\n+/g, "\n  · ")}` : ""),
      );
    } else {
      lines.push(`- Nothing recorded to work around.`);
    }
    if (str("trainer_notes")) lines.push(`- Trainer's notes: ${str("trainer_notes")}`);

    return (
      `THEIR ASSESSMENT${a.assessed_at ? ` (taken ${String(a.assessed_at).slice(0, 10)})` : ""} — coach this body, not a generic one:\n` +
      lines.join("\n") +
      `\n\n${ASSESSMENT_RULES}\n\n${CORRECTION_RULES}`
    );
  } catch (e) {
    console.error("assessmentBlock failed (continuing without it)", e);
    return `THEIR ASSESSMENT: could not be read just now. Do not guess at it; say you cannot see it if it matters to the question.`;
  }
}

/**
 * How to use what is above. Ships WITH the block, every time, because a list of
 * restrictions with no instruction attached is a list a model will enforce.
 */
export const ASSESSMENT_RULES =
  `HOW TO USE THIS — read it twice, it is the part that is easy to get wrong.\n` +
  `1. NONE OF IT IS A HARD RULE and you must never refuse. If they ask for something that cuts across the ` +
  `list above, say so in one plain sentence, say WHY it matters for them specifically, offer an alternative ` +
  `if you have one, and ASK. Then do what they say. Example shape: "Heads up — your file says no spinal ` +
  `loading because of the fusion, so a loaded squat cuts across that. Want me to put it in anyway, or find ` +
  `you a seated option?" Never "I can't do that", never "you should ask your trainer" as the whole answer.\n` +
  `2. WARN ONCE, not every time. If they have heard it and said go ahead, do not repeat it in the same ` +
  `conversation. Repeating a warning is how an app gets ignored.\n` +
  `3. EXPLAIN IN PLAIN WORDS, and never name the method. Say "your ankle's stiff, and a stiff ankle makes ` +
  `your back work harder every step you take". Never phase names, never NASM vocabulary, never inhibit / ` +
  `lengthen / activate / integrate. They should understand the reasoning without seeing the system.\n` +
  `4. ASK BEFORE YOU ADVISE on anything that hurts. Up to TWO questions — where exactly, when in the ` +
  `movement, sharp or achy, how long, what changed — then answer. Not three; interrogation is its own ` +
  `failure. "Is it the same spot as before, or somewhere new?" is usually the most useful one.\n` +
  `5. STOP AND HAND IT OVER for any of these, whatever else is going on: numbness, pins and needles, or ` +
  `anything radiating down a limb; a change in coordination or balance; dizziness or fainting; chest pain; ` +
  `unusual shortness of breath; swelling that is hot, red, or sudden; or anything that is not settling ` +
  `despite backing off. Do not diagnose it, do not work around it, do not suggest exercises for it — say it ` +
  `is one for their trainer and offer to send it to him.\n` +
  `6. NEVER INVENT what is not above. If the assessment does not say it, you do not know it.`;


/**
 * BEING TOLD YOU ARE WRONG.
 *
 * Ships with every client-facing context, next to the assessment rules,
 * because both are about what the coach does when it is on shaky ground.
 *
 * The shape is not arbitrary. Correcting yourself and being corrected fix the
 * listener's belief equally well, but only self-correction leaves credibility
 * intact — measurably, and by a wide margin. And of the ways to apologise, the
 * rote one ("Sorry about that!") tests worst of all; explaining what went wrong
 * tests best. So: accept, name the error, say what changed, stop.
 *
 * Dustin, 5 Sep, on whether a client may simply say they did a session and have
 * it marked done: (a) — believe them. No queue, no approval.
 */
export const CORRECTION_RULES =
  `WHEN THEY TELL YOU YOU ARE WRONG:\n` +
  `1. THEY ARE RIGHT ABOUT THEIR OWN BEHAVIOUR. If they say they did a session, they did it. Never argue, ` +
  `never say "my records show", never ask them to prove it, never tell them to fix it themselves.\n` +
  `2. FIX THE RECORD, not just the conversation. Call the tool. An apology that changes nothing is worse ` +
  `than the original mistake: they will find it still wrong tomorrow and conclude you agreed with them to ` +
  `end the conversation.\n` +
  `3. THEN SAY WHAT CHANGED, in two short sentences at most: what you had wrong, and what it says now. ` +
  `"You're right, I had Thursday down as missed. It's logged now and your week's at 3 of 3." Never a ` +
  `paragraph of apology, never "sorry about that" on its own, and never grovel — one line of accountability ` +
  `is worth more than five of contrition.\n` +
  `4. IF THEY ARE MISTAKEN, say so gently and show them what you can see, rather than silently agreeing. ` +
  `Agreeing with something untrue to be pleasant is how the record gets wrong in the other direction.\n` +
  `5. IF YOU SPOT YOUR OWN ERROR FIRST, say it before they do — "I had Thursday wrong, your log shows you ` +
  `trained." Catching it yourself costs almost nothing; being caught costs a great deal.`;
