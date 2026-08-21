// ONE full-screen interrupt at a time, enforced rather than agreed.
//
// ClientTakeovers already said this in its header comment — "ONE component, ONE
// query pass, and at most ONE takeover ever on screen" — and it was true of the
// six variants inside it. It could not be true of the app, because it had no way
// to know about takeovers mounted anywhere else, and three were:
//
//   SlackerScreen            z-index 9999   client home
//   ClientTakeovers lapse    z-index 2000   client dashboard
//   SundayWeighInReminder    z-index   85   client dashboard
//   ClientWeekSummary brief  z-index   80   client dashboard
//
// A lapsed client opening the app on a Sunday got all four, stacked, in that
// order. Three of them are deleted as of 21 Aug. This module is what stops the
// fifth one being written.
//
// Dustin, 21 Aug: "overall i dont want screen take overs popping up constantly
// and causing too much annoyance and clutter."
//
// HOW IT WORKS. A component that wants the whole screen asks for the slot and
// renders only if it gets it. Lowest priority number wins; a claimant that
// stops wanting the slot releases it and the next one in line gets it on the
// following render. Deliberately module-level rather than React context: the
// claimants sit at different depths of different trees (one is in
// home/page.tsx, one inside ClientDashboard), so a provider high enough to
// cover them all would have to wrap the entire app to solve a problem that is
// really about a single global resource — the screen.
//
// Priorities are by SHELF LIFE, the same rule ClientTakeovers uses internally:
// how long is this still worth saying? A birthday is worth saying today only.
// A week in review is stale by Tuesday. "Turn on notifications" is true forever
// and therefore always yields.

export const TAKEOVER_PRIORITY = {
  /** Birthdays, winners, announcements, lapse, DOB ask — ClientTakeovers' own six. */
  ANNOUNCEMENTS: 10,
  /** The week in review. Good for the first day or two of a new week. */
  WEEK_BRIEF: 50,
} as const;

interface Claim { id: string; priority: number }

let claims: Claim[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

/** The id currently entitled to the screen, or null. Lowest priority wins. */
export function currentHolder(): string | null {
  if (claims.length === 0) return null;
  let best = claims[0];
  for (const c of claims) if (c.priority < best.priority) best = c;
  return best.id;
}

export function claimTakeover(id: string, priority: number): void {
  if (claims.some((c) => c.id === id)) return;
  claims.push({ id, priority });
  notify();
}

export function releaseTakeover(id: string): void {
  const before = claims.length;
  claims = claims.filter((c) => c.id !== id);
  if (claims.length !== before) notify();
}

export function subscribeTakeover(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Test seam. Never call from app code. */
export function __resetTakeoverSlot(): void {
  claims = [];
  listeners.clear();
}
