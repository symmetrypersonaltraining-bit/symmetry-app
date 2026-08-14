// WHAT HAPPENS WHEN A TARGET DATE ARRIVES AND THE NUMBER HASN'T.
//
// Dustin, in the mock-up round: "rolls forward at the pace actually achieved;
// the old attempt stays visible. Nothing framed as a failure, nothing hidden."
//
// Both halves of that matter and they pull in opposite directions, which is why
// this is its own file with its own tests.
//
// NOTHING FRAMED AS A FAILURE. The goal does not go red, it does not say
// "missed", and it does not quietly disappear at midnight so the client opens
// the app to an empty screen and works out what happened. It gets a new date,
// computed from the pace they ACTUALLY held — which is the one honest answer to
// "when will I get there" and, nine times out of ten, is a date that is nearly
// here. Somebody who set 185 by 30 September and arrives at 186.4 has not
// failed at anything; they have three more weeks to go.
//
// NOTHING HIDDEN. The old attempt stays as a row, status 'rolled', linked both
// ways. "You said 30 September and it took until 21 October" is a conversation
// worth being able to have in three months, and it cannot be had from a row
// that was overwritten in place.
//
// THE CASE THAT NEEDS CARE is the client with no usable pace — stalled, or too
// few weigh-ins. Extrapolating from a rate of zero gives a target date of
// never, and printing "arriving ~14 March 2031" to somebody who has had a hard
// month is worse than saying nothing. So a goal with no pace rolls by the same
// span it originally ran, and the copy says plainly that it is a fresh run at
// the same number rather than a projection.

import { analyseGoal, type Goal, type Reading } from "@/lib/goals";

const DAY = 86_400_000;
const ms = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The longest a rolled goal may reach forward. */
export const MAX_ROLL_DAYS = 180;
/** ...and the shortest, so a goal one weigh-in away doesn't roll to tomorrow. */
export const MIN_ROLL_DAYS = 21;

export interface RollPlan {
  /** The new target date. */
  targetDate: string;
  /** Where they are today — the new goal's start. */
  startValue: number;
  startDate: string;
  /** True when the date came from their real pace rather than from the fallback. */
  fromPace: boolean;
  /** One sentence, shown to the client. Never uses the words missed or failed. */
  note: string;
}

/**
 * What a goal whose date has passed should become — or null when it should be
 * left alone (already reached, or the date has not passed yet).
 *
 * `today` is passed in rather than read from the clock, so this is testable and
 * so a cron running either side of midnight cannot produce two different
 * answers for the same day.
 */
export function planRollForward(goal: Goal, readings: Reading[], today: string): RollPlan | null {
  if (goal.status !== "active") return null;
  if (ms(goal.targetDate) >= ms(today)) return null; // not due yet

  const a = analyseGoal(goal, readings, today);
  if (!a) return null;
  if (a.remaining <= 0) return null; // they got there; that is a celebration, not a roll

  const ranDays = goal.startDate ? Math.max(1, Math.round((ms(goal.targetDate) - ms(goal.startDate)) / DAY)) : 0;

  // The pace they actually held. Only usable when it is moving the right way
  // AND the number has not gone flat — a stalled client's "pace" is zero, and
  // dividing by it is how you get a target date in the next decade.
  const usable =
    a.rate != null && a.rate !== 0 && !a.stalled && !a.thin
      ? Math.abs(a.rate)
      : null;

  let days: number;
  let fromPace: boolean;
  if (usable != null) {
    days = Math.ceil((a.remaining / usable) * 7);
    fromPace = true;
  } else {
    // No honest pace. Give it the same run it had rather than inventing one.
    days = ranDays || 56;
    fromPace = false;
  }
  days = Math.min(MAX_ROLL_DAYS, Math.max(MIN_ROLL_DAYS, days));

  const targetDate = iso(ms(today) + days * DAY);
  const note = fromPace
    ? `Rolled forward from ${goal.targetDate}. At the pace you've actually been holding, ${goal.targetValue} lands around here.`
    : `Rolled forward from ${goal.targetDate} — same number, fresh run at it. Once there are a few more weigh-ins I can give you a real date.`;

  return { targetDate, startValue: a.now, startDate: today, fromPace, note };
}
