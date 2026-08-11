import { COACH_FIRST_NAME } from "./trainer";
/**
 * fun — personality copy. 2026-07-25.
 *
 * Loading lines, empty states and small moments. Pure data + pure functions,
 * no side effects, so it is safe to import anywhere including server
 * components.
 *
 * Tone rules (these matter — the app talks to people mid-workout):
 *  - Dry and warm, never zany. Gym humour, not startup humour.
 *  - Never about body weight, body fat or appearance.
 *  - Never guilt-trips someone for missing a session.
 *  - Short enough to read in the half second a loader is on screen.
 */

const LOADING: string[] = [
  "Racking the plates…",
  "Chalking up…",
  "Loading the bar…",
  "Counting to three, slowly…",
  "Arguing with gravity…",
  "Finding your last set…",
  "Warming up the numbers…",
  "Checking the logbook…",
  "Tightening the collars…",
  "Resetting the clock…",
  "Doing the math you skipped…",
  "Consulting the spreadsheet…",
  "Adding it all up…",
  "Wiping down the bench…",
  "Cueing the good playlist…",
];

const EMPTY: Record<string, { title: string; body: string }> = {
  workouts: { title: "Nothing scheduled today", body: "Rest is part of the programme. Enjoy it — you've earned the quiet." },
  meals: { title: "No meals logged yet", body: "Start with whatever you ate last. Takes about twenty seconds." },
  history: { title: "No history here yet", body: "Log this movement once and next time it'll remember what you lifted." },
  messages: { title: "No messages", body: "Quiet inbox. Either everything's going well or you're being too polite." },
  progress: { title: "Not enough data yet", body: "A couple more logged sessions and the charts start telling a story." },
  library: { title: "Nothing saved yet", body: "Workouts you build or generate will live here." },
  notifications: { title: "You're all caught up", body: "Nothing needs you right now." },
  clients: { title: "No clients yet", body: "Add your first client and their programme lands here." },
};

const ANNIVERSARY: { months: number; title: string; body: string }[] = [
  { months: 1, title: "One month in", body: "The hardest month is the first one. It's behind you." },
  { months: 3, title: "Three months", body: "This is the point where it stops being a phase and starts being who you are." },
  { months: 6, title: "Half a year", body: "Six months of showing up. Most people never get here." },
  { months: 12, title: "One year", body: "A full year with Symmetry. Look at where you started." },
  { months: 24, title: "Two years", body: "Two years. At this point you're not training — you're just living this way." },
];

/** Deterministic per-day pick so the same person doesn't see it reshuffle mid-session. */
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

export function loadingLine(seed = Date.now() / 60000): string {
  return pick(LOADING, Math.floor(seed));
}

export function emptyState(key: string): { title: string; body: string } {
  return EMPTY[key] ?? { title: "Nothing here yet", body: "This fills in as you use the app." };
}

/**
 * Returns an anniversary moment if the client crossed a milestone today.
 * `since` is their start date (ISO). Returns null on any bad input.
 */
export function anniversary(since: string | null | undefined, today: string): { title: string; body: string } | null {
  try {
    if (!since) return null;
    const a = new Date(since + "T00:00:00Z").getTime();
    const b = new Date(today + "T00:00:00Z").getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
    const days = Math.round((b - a) / 86400000);
    for (const m of ANNIVERSARY) {
      // ±1 day window so a missed day doesn't skip the moment entirely
      const target = Math.round(m.months * 30.44);
      if (Math.abs(days - target) <= 1) return { title: m.title, body: m.body };
    }
    return null;
  } catch {
    return null;
  }
}

/** Copy for the rest-day permission slip — makes resting feel prescribed, not skipped. */
export const REST_DAY = {
  title: "Official Rest Day",
  body: "This is not skipping. Muscle is built between sessions, not during them. Eat, sleep, come back stronger.",
  signed: `— ${COACH_FIRST_NAME}, Symmetry Personal Training`,
};
