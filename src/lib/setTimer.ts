// THE PER-SET TIMER.
//
// Dustin, 12 Aug: "for timer lets have it function from where you set the
// actual time. that way we can get rid of the timer button at the top.
// movements that track time you set timer or stop watch right there where you
// log it, hit start, when time is up it logs as complete but just like
// everywhere else you can still manually log or unlog it as well as edit the
// time." Then 13 Aug: "we need to be able to toggle from timer to stopwatch
// starting from zero."
//
// The clock at the top of the logger is the thing this replaces. It runs fine,
// but it has no idea which set you are on, so the number it shows has to be
// carried across to the right row by hand. A timer that belongs to a set can
// write its own result.
//
// WHY WALL CLOCK, NOT A COUNTER.
// The obvious build is setInterval(() => secs--, 1000). On a phone that is
// wrong: background the app mid-plank, or let the screen lock, and the timers
// throttle — a 60-second hold comes back reading 41. So nothing here counts
// ticks. State holds the epoch millisecond the run STARTED, and every reading
// is derived from `now`. The interval exists only to force a repaint; if it
// misses a beat, or fires twenty times in one second, the number on screen is
// still right. That also makes the whole thing testable without waiting in
// real time — pass `now` in.
//
// PAUSE. `banked` is the seconds accumulated over previous runs. Start/pause
// is therefore a resume, not a restart, and only reset() clears it.

export type SetTimerMode = "timer" | "stopwatch";

export interface SetTimerState {
  mode: SetTimerMode;
  /** Seconds to count down from, from the programmed target. Null = none. */
  targetSecs: number | null;
  /** Epoch ms this run began. Null = not running. */
  startedAt: number | null;
  /** Seconds banked from earlier runs of this same set. */
  banked: number;
}

/**
 * A movement with a programmed time counts DOWN from it; one without has
 * nothing to count down from, so it starts as a stopwatch. Either can be
 * flipped afterwards — that is the toggle.
 */
export function defaultMode(targetSecs: number | null | undefined): SetTimerMode {
  return targetSecs != null && targetSecs > 0 ? "timer" : "stopwatch";
}

export function newTimer(targetSecs: number | null | undefined): SetTimerState {
  const t = targetSecs != null && Number.isFinite(targetSecs) && targetSecs > 0 ? Math.round(targetSecs) : null;
  return { mode: defaultMode(t), targetSecs: t, startedAt: null, banked: 0 };
}

export function isRunning(st: SetTimerState): boolean {
  return st.startedAt != null;
}

/** Seconds actually spent on this set, banked runs included. */
export function elapsedSecs(st: SetTimerState, now: number): number {
  const live = st.startedAt == null ? 0 : Math.max(0, Math.floor((now - st.startedAt) / 1000));
  return st.banked + live;
}

/** Seconds left on a countdown. Never negative. Zero when there is no target. */
export function remainingSecs(st: SetTimerState, now: number): number {
  if (st.targetSecs == null) return 0;
  return Math.max(0, st.targetSecs - elapsedSecs(st, now));
}

/**
 * The number on the face.
 *
 * A stopwatch reads 0:00 before it is started — NOT the programmed target.
 * Showing the target on a stopwatch face makes a goal indistinguishable from
 * something already done, which is exactly the confusion this whole change is
 * meant to remove.
 */
export function displaySecs(st: SetTimerState, now: number): number {
  return st.mode === "timer" ? remainingSecs(st, now) : elapsedSecs(st, now);
}

/** A countdown that has run out. Stopwatches never expire. */
export function isExpired(st: SetTimerState, now: number): boolean {
  return st.mode === "timer" && st.targetSecs != null && remainingSecs(st, now) === 0;
}

/** Start, or resume after a pause. Starting an expired countdown restarts it. */
export function start(st: SetTimerState, now: number): SetTimerState {
  if (isRunning(st)) return st;
  if (st.mode === "timer" && st.targetSecs == null) return st; // nothing to count down
  const banked = st.mode === "timer" && st.banked >= (st.targetSecs ?? 0) ? 0 : st.banked;
  return { ...st, banked, startedAt: now };
}

/** Stop the clock, keeping what has been counted. */
export function pause(st: SetTimerState, now: number): SetTimerState {
  if (!isRunning(st)) return st;
  return { ...st, banked: elapsedSecs(st, now), startedAt: null };
}

/** Back to the beginning: a countdown to full, a stopwatch to zero. */
export function reset(st: SetTimerState): SetTimerState {
  return { ...st, startedAt: null, banked: 0 };
}

/**
 * Flipping the mode.
 *
 * A stopwatch starts from zero — his words — so the elapsed time from a
 * countdown does not carry across, and vice versa. Flipping mid-run stops the
 * clock rather than silently reinterpreting the seconds already on it.
 */
export function setMode(st: SetTimerState, mode: SetTimerMode): SetTimerState {
  if (mode === st.mode) return st;
  return { ...st, mode, startedAt: null, banked: 0 };
}

export function toggleMode(st: SetTimerState): SetTimerState {
  return setMode(st, st.mode === "timer" ? "stopwatch" : "timer");
}

/**
 * Stop inside this window and nothing is recorded at all.
 *
 * Stopping a countdown writes the time actually worked into the set — 22 of a
 * programmed 30 seconds is real information, and the programmed target is still
 * on the exercise pill above. But that means a mis-tap two seconds after
 * starting would replace a 0:30 target with 0:02, and the first anyone knows of
 * it is a log that reads wrong. Nobody holds a plank for a second and a half,
 * so a stop that fast is a fumbled button, not a set.
 */
export const CANCEL_WINDOW_SECS = 2;

export interface TimerOutcome {
  /** Seconds to write into the set's time box. Null = leave it alone. */
  seconds: number | null;
  /** Whether stopping here should mark the set logged. */
  shouldLog: boolean;
}

/**
 * What stopping does to the set.
 *
 * A countdown that reached zero logs the set at its programmed time — that is
 * the "when time is up it logs as complete" half. A stopwatch logs what it
 * actually measured. Stopping either one early records the time worked but
 * does NOT log: a hold abandoned at 8 of 30 seconds is information, not a
 * completed set, and the trainer is the one who decides which.
 *
 * Nothing here is final. Every one of these can be un-logged, and the time can
 * be retyped, exactly as before.
 */
export function outcomeOnStop(st: SetTimerState, now: number): TimerOutcome {
  const elapsed = elapsedSecs(st, now);
  if (st.mode === "timer") {
    if (st.targetSecs == null) return { seconds: null, shouldLog: false };
    // Reaching zero is not a mis-tap however fast the target was.
    if (remainingSecs(st, now) === 0) return { seconds: st.targetSecs, shouldLog: true };
    if (elapsed <= CANCEL_WINDOW_SECS) return { seconds: null, shouldLog: false };
    return { seconds: elapsed, shouldLog: false };
  }
  if (elapsed <= CANCEL_WINDOW_SECS) return { seconds: null, shouldLog: false };
  return { seconds: elapsed, shouldLog: true };
}

/**
 * Only one clock runs at a time.
 *
 * Two sets counting at once is never something anyone meant to do, and the
 * second one is always a mis-tap. Starting a set pauses whatever else was
 * going rather than refusing the tap — refusing would leave you prodding a
 * dead button wondering what is wrong.
 */
export function startOnly<K extends string | number>(
  timers: Record<K, SetTimerState>,
  key: K,
  now: number,
): Record<K, SetTimerState> {
  const out = {} as Record<K, SetTimerState>;
  for (const k of Object.keys(timers) as K[]) {
    out[k] = k === key ? start(timers[k], now) : pause(timers[k], now);
  }
  return out;
}
