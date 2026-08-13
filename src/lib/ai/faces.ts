// The AI's face, and the rule for which one it wears.
//
// Dustin, 2026-08-12: "this is where we need to make sure we get incredibly
// advanced on how the ai is designed. if it's fussing at them use a mad icon,
// if its a good thing use happy, if it's a PR use a muscle one, etc."
//
// The point is that the picture is part of the message. A client who has missed
// three days and opens the app to a grinning cartoon has been told the app is
// not paying attention. The same words under a concerned face read as somebody
// noticing. That is the whole feature — the copy is already personal, the face
// is what makes it land before a word is read.
//
// One registry, deliberately. Every surface that shows the AI resolves through
// here, so the day the artwork is redrawn there is exactly one place to change,
// and a mood that has no art degrades to the old cartoon rather than a broken
// image. Callers name a MOOD, never a filename.

export type Mood =
  // — the everyday face —
  | "neutral"      // default; the AI is just talking
  | "thinking"     // working on it, generating, loading
  | "explaining"   // walking someone through the app
  | "plan"         // programme / weekly focus / anything scheduled
  // — good news —
  | "happy"        // logged the day, nice week, small win
  | "hype"         // big win, goal hit, streak milestone
  | "pr"           // a personal record specifically
  | "flex"         // strength progress
  | "cool"         // streak running, everything on rails
  | "streak"       // on fire — long streak
  // — nudges, in ascending temperature —
  | "concerned"    // missed a day or two; gentle
  | "stern"        // a real lapse; direct
  | "callout"      // pointed. Reserved — see TEMPERATURE below.
  // — topical —
  | "nutrition"    // meals, macros
  | "hydrate"      // water, shakes
  | "lifting"      // workout in progress
  | "rest"         // rest day, deload, recovery
  | "tips"         // app tips, what's new
  | "messages"     // inbox, replies
  | "confident";   // signed-off, approved, all clear

/** Mood → asset. Every value must exist in /public/bots. */
const ART: Record<Mood, string> = {
  neutral: "neutral",
  thinking: "thinking",
  explaining: "explaining",
  plan: "plan",
  happy: "happy",
  hype: "hype",
  pr: "pr",
  flex: "flex",
  cool: "cool",
  streak: "streak",
  concerned: "concerned",
  stern: "stern",
  callout: "callout",
  nutrition: "nutrition",
  hydrate: "hydrate",
  lifting: "lifting",
  rest: "rest",
  tips: "tips",
  messages: "messages",
  confident: "confident",
};

/** The cartoon that shipped before the sticker set. Any gap falls back here. */
export const FALLBACK_FACE = "/coachbot.png";

export function faceSrc(mood: Mood | null | undefined): string {
  if (!mood) return `/bots/${ART.neutral}.webp`;
  const slug = ART[mood];
  return slug ? `/bots/${slug}.webp` : FALLBACK_FACE;
}

export const ALL_MOODS = Object.keys(ART) as Mood[];

// ─────────────────────────────────────────────────────────────────────────────
// TEMPERATURE
//
// The nudge faces escalate, and they escalate SLOWLY. Dustin, 2026-08-12:
// "I have several clients that don't do it at all. I don't want the AI to keep
// pestering them about that... try to keep it only to people that were logging
// consistently and fell off, not ones that have never logged before at all."
//
// So the face is a function of the drop from THEIR normal, not of an absolute
// count of missed days. Someone who logs twice a week and logs twice a week is
// not lapsed. `callout` is the loudest face in the set and is deliberately not
// reachable from missed logging at all — it is for a client who is actively
// ignoring something they asked for, and today nothing calls it.
// ─────────────────────────────────────────────────────────────────────────────

export type LapseInput = {
  /** Consecutive days with no log of any kind. */
  daysSinceLog: number;
  /** Days logged in the 28 before the lapse started. Their normal. */
  priorLoggedDays28: number;
};

/**
 * The face for a missed-logging nudge, or null for "say nothing".
 *
 * null is the common answer and that is intentional. A client who has never
 * really logged gets no lapse nudge at all here — they belong in the occasional
 * gentle prompt, not the escalation ladder.
 */
/** The only two rungs. Narrower than Mood so callers can switch on it exhaustively. */
export type LapseTier = "concerned" | "stern";

export function lapseMood({ daysSinceLog, priorLoggedDays28 }: LapseInput): LapseTier | null {
  // Never established a habit — nothing to have fallen off of.
  if (priorLoggedDays28 < 8) return null;

  const wasDaily = priorLoggedDays28 >= 20;
  // Someone who logs most days is "late" sooner than someone who logs twice a
  // week; three days off is unremarkable for the latter and a real gap for the
  // former.
  const gentleAt = wasDaily ? 3 : 6;
  const firmAt = wasDaily ? 7 : 12;

  if (daysSinceLog >= firmAt) return "stern";
  if (daysSinceLog >= gentleAt) return "concerned";
  return null;
}

/**
 * The face for a good-news moment. Ordered most specific first — a PR on the
 * day someone also closes a streak should show the PR.
 */
export function winMood(w: {
  isPr?: boolean;
  streakDays?: number;
  hitGoal?: boolean;
  fullDayLogged?: boolean;
}): Mood {
  if (w.isPr) return "pr";
  if ((w.streakDays ?? 0) >= 30) return "streak";
  if (w.hitGoal) return "hype";
  if ((w.streakDays ?? 0) >= 7) return "cool";
  if (w.fullDayLogged) return "happy";
  return "happy";
}

/** The face for an AI surface, by where it is mounted. */
export function surfaceMood(surface: string): Mood {
  switch (surface) {
    case "nutrition": return "nutrition";
    case "workout":
    case "logger": return "lifting";
    case "progress": return "flex";
    case "messages": return "messages";
    case "home": return "plan";
    case "settings":
    case "help": return "explaining";
    default: return "neutral";
  }
}
