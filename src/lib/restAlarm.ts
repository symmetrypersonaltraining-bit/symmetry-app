/**
 * THE REST TIMER HAS TO GO OFF WITH THE PHONE IN YOUR POCKET.
 *
 * Dustin, 22 Aug: "lets make the timer in workout logger buzz phone and ding
 * loud even if phone is closed or not on workout screen."
 *
 * That is three separate problems and only one of them is "play a sound".
 *
 * ── 1. The timer has to still be counting ─────────────────────────────────
 *
 * The old RestTimer decremented a number every second with setTimeout. Put the
 * phone down and a browser throttles background timers to about once a minute;
 * lock the screen and it may stop entirely. A 90-second rest came back reading
 * whatever the throttle allowed, and "time is up" arrived whenever the page
 * happened to wake.
 *
 * So nothing here counts ticks. `endsAt` is an epoch millisecond and every
 * reading is derived from `now` — the same rule setTimer.ts already follows for
 * per-set timers. If the page is frozen for a minute and comes back, it comes
 * back knowing it is overdue, and fires immediately instead of resuming a
 * count that is wrong.
 *
 * ── 2. Something has to wake the page at zero ─────────────────────────────
 *
 * Derived time fixes accuracy, not delivery: a frozen page cannot ring at all.
 * The lever that works on Android is audio. A tab producing sound is treated as
 * doing something the user cares about and is not frozen, so a silent looping
 * track held for the length of the rest keeps the timer alive with the screen
 * off. It is a trick, it is the one every web interval timer uses, and it costs
 * a little battery for ninety seconds.
 *
 * ── 3. It has to be audible when you are not looking at it ───────────────
 *
 * navigator.vibrate() is ignored by Chrome while the page is hidden, and audio
 * started from a hidden page is unreliable. A NOTIFICATION is not: the OS makes
 * the sound and the buzz, on the lock screen, at system volume, whether or not
 * the app is in front.
 *
 * So the alarm picks by visibility. Looking at it → the in-app ding and a
 * vibrate, no notification cluttering the shade for something already on
 * screen. Not looking at it → notification, and let the phone do what phones
 * do.
 *
 * ── What this does NOT promise ───────────────────────────────────────────
 *
 * If the browser is force-quit, or Android kills the tab under memory
 * pressure, nothing here fires. Surviving that needs a push scheduled
 * server-side, which is a different build and worth doing only if this proves
 * unreliable in his pocket. iOS is weaker throughout: the keepalive helps less
 * and notifications need the app installed to the home screen.
 */

export interface AlarmPlan {
  /** Milliseconds until it should ring. 0 means now, negative means overdue. */
  msRemaining: number;
  /** Seconds to show. Never negative. */
  secondsLeft: number;
  /** Ring on this tick? */
  fire: boolean;
}

/**
 * Pure, so the behaviour can be tested without waiting ninety seconds.
 *
 * `alreadyFired` matters more than it looks: a page that was frozen past the
 * end and then woken must ring exactly once, not once per repaint for as long
 * as it stays overdue.
 */
export function alarmPlan(nowMs: number, endsAtMs: number, alreadyFired: boolean): AlarmPlan {
  const msRemaining = endsAtMs - nowMs;
  return {
    msRemaining,
    secondsLeft: Math.max(0, Math.ceil(msRemaining / 1000)),
    fire: msRemaining <= 0 && !alreadyFired,
  };
}

/* ── Keeping the page awake ──────────────────────────────────────────────── */

let keepAliveEl: HTMLAudioElement | null = null;
let keepAliveHolders = 0;

/**
 * Two seconds of silent WAV, looped. Small enough to inline, real enough that
 * the browser counts the tab as playing audio.
 */
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

/**
 * Hold the page awake. Reference counted, so two timers running at once cannot
 * have one of them release the other's keepalive.
 *
 * Returns a release function. Always call it — a silent track left playing is
 * a battery drain the user cannot see or stop.
 */
export function holdPageAwake(): () => void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return () => {};
  keepAliveHolders += 1;
  try {
    if (!keepAliveEl) {
      keepAliveEl = new Audio(SILENCE);
      keepAliveEl.loop = true;
      keepAliveEl.volume = 0.001; // not 0: some browsers treat muted as "not playing"
    }
    // play() rejects without a user gesture. Starting a rest timer IS one, but
    // never let a rejection break the timer itself.
    void keepAliveEl.play().catch(() => {});
  } catch {
    /* no keepalive; the timer still works while the screen is on */
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    keepAliveHolders = Math.max(0, keepAliveHolders - 1);
    if (keepAliveHolders === 0 && keepAliveEl) {
      try {
        keepAliveEl.pause();
        keepAliveEl.currentTime = 0;
      } catch {
        /* nothing to do */
      }
    }
  };
}

/** Test seam. */
export function _keepAliveHolders(): number {
  return keepAliveHolders;
}

/* ── Ringing ─────────────────────────────────────────────────────────────── */

/** Long enough to feel deliberate, short enough not to be a phone call. */
export const REST_VIBRATE: number[] = [300, 120, 300, 120, 500];

export interface AlarmSurface {
  /** document.hidden, injected so the choice can be tested. */
  hidden: boolean;
  /** The in-app sound, when they are looking at it. */
  ding: () => void;
  vibrate?: (pattern: number[]) => void;
  notify?: (title: string, options: Record<string, unknown>) => Promise<void> | void;
}

/**
 * Which way to ring. Split out from the doing so the decision is testable.
 *
 * Hidden wins over everything: if they are not looking at the screen, the
 * notification is the only one of the two that reliably makes a noise.
 */
export function alarmMode(hidden: boolean, canNotify: boolean): "notify" | "inapp" {
  return hidden && canNotify ? "notify" : "inapp";
}

export function ringRestAlarm(surface: AlarmSurface, exerciseName?: string | null) {
  const canNotify = typeof surface.notify === "function";
  if (alarmMode(surface.hidden, canNotify) === "notify") {
    void surface.notify!("Rest is up", {
      body: exerciseName ? `Next: ${exerciseName}` : "Back to it.",
      // A tag means a second timer replaces the first rather than stacking a
      // shade full of identical alerts.
      tag: "symmetry-rest",
      renotify: true,
      requireInteraction: false,
      vibrate: REST_VIBRATE,
      silent: false,
      data: { kind: "rest" },
    });
    return;
  }
  surface.ding();
  try {
    surface.vibrate?.(REST_VIBRATE);
  } catch {
    /* vibration is a nicety; never let it take the sound down with it */
  }
}
