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
  | "quiet"        // long silence, no judgement — see LapseTier
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
  // `quiet` deliberately does NOT use the disappointed face. Someone who never
  // logged has done nothing to disappoint anyone.
  quiet: "thinking",
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

/**
 * WHOSE face.
 *
 * This art is not a robot — /public/bots is a cartoon of Dustin, and the mood
 * set exists precisely so the picture carries part of the message. Shown to
 * another trainer's clients it is a stranger's cartoon telling them how their
 * week went, which is the same problem as his photograph appearing on their
 * celebration screen, only more often.
 *
 * Three of Stephanie's twenty faces (`flex`, `cool`, `hydrate`) carry another
 * gym's logo on the vest. That is deliberate — Dustin, 21 Aug: "leave them
 * better bodies logo was intentional" — not a sheet that needs regenerating.
 *
 * `set` names a folder under /public/bots and comes from `trainers.bot_set`.
 * Empty or missing means the original set, so the owner is unchanged and a
 * trainer added tomorrow degrades to it rather than to a broken image.
 *
 * The group chat used to be the one exception — it did not pass a set, because
 * the room was shared and two different bots posting the same kind of message
 * would read as two different bots. The rooms were split per trainer on
 * 21 Aug, so the reason is gone: a group room now has exactly one coach, and
 * their bot is the one that belongs in it.
 */
/**
 * A set a trainer uploaded, rather than one that ships in /public/bots.
 *
 * Dustin's and Stephanie's sets are folders in the repo. A trainer joining
 * next week cannot commit to the repo, so theirs go to storage instead and
 * their `bot_set` is stamped `u-<their id>`. The prefix is what tells these
 * two cases apart — deliberately a prefix rather than a second column, so
 * everything that already passes a set name around keeps working untouched.
 */
const UPLOADED_PREFIX = "u-";

function setDir(set?: string | null): string {
  if (!set) return "/bots/";
  if (!set.startsWith(UPLOADED_PREFIX)) return `/bots/${set}/`;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  // No Supabase URL at build time (a prerender, a test) — fall back to the
  // stock set rather than emitting a broken host-relative path.
  if (!base) return "/bots/";
  return `${base}/storage/v1/object/public/assets/bots/${set}/`;
}

/**
 * A trainer's uploaded library: slug -> the public URLs they have put there.
 *
 * Empty or missing for a trainer who has uploaded nothing, which is every
 * trainer on their first day.
 */
export type FaceLibrary = Record<string, string[]>;

/**
 * THE FALLBACK THAT WAS PROMISED AND NEVER EXISTED.
 *
 * The upload screen says "Anything you have not uploaded falls back to the
 * standard set" and the walkthrough says "five tonight and the rest at the
 * weekend is completely fine". Neither was true: `setDir` picked ONE directory
 * for the whole set, so an uploaded set missing `hydrate.webp` did not fall
 * back to anything — it emitted a URL for a file that is not there and rendered
 * a broken image. A trainer following the advice in the app would have seen
 * exactly that, on their own clients' screens, with nothing to explain it.
 *
 * Resolving per SLUG rather than per set is what makes the promise true. A slug
 * the trainer has uploaded comes from their library; one they have not comes
 * from the stock set.
 */
function stockDir(set?: string | null): string {
  // A `u-` set has no stock files of its own — its fallback is the original.
  if (set && !set.startsWith(UPLOADED_PREFIX)) return `/bots/${set}/`;
  return "/bots/";
}

/**
 * Pick one of N. Stable for a given seed, so a face does not flicker between
 * renders of the same card, and different across seeds, so a trainer who
 * uploads five neutrals sees all five rather than always the first.
 *
 * Deliberately not Math.random(): a face that changes on every re-render is
 * distracting, and on a server-rendered card it would also mismatch hydration.
 */
function pick(list: string[], seed?: string | number | null): string {
  if (list.length === 1) return list[0];
  const s = String(seed ?? "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return list[Math.abs(h) % list.length];
}

export function faceSrc(
  mood: Mood | null | undefined,
  set?: string | null,
  lib?: FaceLibrary | null,
  seed?: string | number | null,
): string {
  const slug = mood ? ART[mood] : ART.neutral;
  if (!slug) return FALLBACK_FACE;

  // The trainer's own library first, when it has something for THIS slug.
  const mine = lib?.[slug];
  if (mine && mine.length) return pick(mine, `${slug}:${seed ?? ""}`);

  // Then the set folder, then the stock set. Per slug, not per set.
  const dir = setDir(set);
  const stock = stockDir(set);
  // An uploaded set with no library row for this slug has nothing at that path
  // — fall through to the stock file rather than emitting a 404.
  if (set && set.startsWith(UPLOADED_PREFIX)) return `${stock}${slug}.webp`;
  return `${dir}${slug}.webp`;
}

/** The storage folder name for a trainer's own uploaded set. */
export function uploadedSetName(trainerId: string): string {
  return UPLOADED_PREFIX + trainerId;
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
/**
 * The rungs. Narrow enough that callers can switch on it exhaustively.
 *
 * `quiet` was added 13 Aug for a case the other two deliberately miss. Robert
 * had been silent 25 days and the ladder said nothing, because he never logged
 * regularly enough to have "fallen off" — correct by the rule, wrong about the
 * person. Dustin: "Robert could definitely get a little nudge."
 *
 * So it is a different question, and it says so. concerned/stern are about
 * LOGGING going quiet. `quiet` is about the CLIENT going quiet — no session, no
 * meal, nothing, for weeks — and it never mentions logging at all, because for
 * someone who never logged that would be a complaint about a habit they never
 * had.
 */
export type LapseTier = "concerned" | "stern" | "quiet";

/**
 * Silent this long and somebody should say hello, whatever their logging
 * history. Deliberately much longer than either logging rung: three weeks of
 * nothing at all is not a slip, and anything shorter would catch people who are
 * simply light users.
 */
export const QUIET_DAYS = 21;

export function lapseMood({ daysSinceLog, priorLoggedDays28 }: LapseInput): LapseTier | null {
  // Never established a habit — nothing to have fallen off of. But total
  // silence for weeks is its own thing, and gets its own, gentler screen that
  // does not mention logging.
  if (priorLoggedDays28 < 8) return daysSinceLog >= QUIET_DAYS ? "quiet" : null;

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
