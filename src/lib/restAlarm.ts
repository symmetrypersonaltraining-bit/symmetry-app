/**
 * THE REST TIMER HAS TO GO OFF WITH THE PHONE IN YOUR POCKET.
 *
 * Dustin, 22 Aug: "lets make the timer in workout logger buzz phone and ding
 * loud even if phone is closed or not on workout screen." Then, after the
 * first attempt: "it does 1 tiny tiny chirp only if phone volume is up. can it
 * go by media volume so when my phone is on vibrate it still works? also that
 * chirp is way too weak. its not vibrating either."
 *
 * All three of those had the same root cause and it was not the tone.
 *
 * ── WHY IT WAS SILENT: an alarm was wearing the UI's preferences ──────────
 *
 * The first version rang through fx(), which is the app's tap-feedback layer.
 * soundEnabled() defaults to FALSE — it needs an explicit opt-in — and
 * hapticsEnabled() is a general "do UI taps buzz" switch. So on a phone where
 * nobody had gone into Settings and turned Sounds on, the alarm played
 * NOTHING, and a vibration toggle meant for button taps could silence a
 * ninety-second rest timer.
 *
 * That is the wrong relationship. "I don't want the app chirping when I tap
 * things" is not "don't wake me when my rest is up." The alarm is the thing
 * the user explicitly started; it does not ask a preference about button
 * clicks for permission to do its job.
 *
 * ── WHY IT WAS WEAK, AND WHY MEDIA VOLUME ───────────────────────────────
 *
 * A short WebAudio oscillator at low gain is a chirp. This plays a real
 * generated WAV through an <audio> element at full volume instead, which on
 * Android rides the MEDIA stream — independent of the ringer, so it is audible
 * with the phone on vibrate, which is the specific thing he asked for. A
 * notification cannot do that: notification sound follows the ringer, so on
 * vibrate it makes no noise at all.
 *
 * ── WHY IT IS ARMED EARLY ────────────────────────────────────────────────
 *
 * Autoplay policy: a fresh Audio created and played with no user gesture in
 * hand can be blocked. Starting a rest IS a gesture (you tapped a set), so the
 * element is created and unlocked THEN, and at zero all that happens is
 * play(). This is also why the alarm gets its own element and not the silent
 * keepalive one — the keepalive is released on unmount, and releasing it
 * mid-ring would cut the alarm off two hundred milliseconds in.
 *
 * ── WHAT STILL NEEDS THE NOTIFICATION ────────────────────────────────────
 *
 * navigator.vibrate() is ignored by Chrome from a hidden page. So off-screen
 * we do BOTH: the audio (loud, media volume, works on vibrate) and a
 * notification (whose vibration the OS performs, and which puts something on
 * the lock screen). On-screen it is audio plus a direct vibrate, with no
 * notification — no point leaving a card in the shade for something you are
 * looking at.
 *
 * ── WHAT THIS DOES NOT PROMISE ───────────────────────────────────────────
 *
 * A force-quit browser, or a tab killed under memory pressure, rings nothing.
 * That needs a server-scheduled push. iOS is weaker throughout.
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
 * `alreadyFired` matters more than it looks: a page frozen past the end and
 * then woken must ring exactly once, not once per repaint for as long as it
 * stays overdue.
 */
export function alarmPlan(nowMs: number, endsAtMs: number, alreadyFired: boolean): AlarmPlan {
  const msRemaining = endsAtMs - nowMs;
  return {
    msRemaining,
    secondsLeft: Math.max(0, Math.ceil(msRemaining / 1000)),
    fire: msRemaining <= 0 && !alreadyFired,
  };
}

/* ── The sound ───────────────────────────────────────────────────────────── */

/**
 * Six beeps, alternating pitch, about a second and a half.
 *
 * Built rather than shipped as a file so there is no asset to 404 and no extra
 * request at the moment it is needed. 8 kHz mono is plenty for a beep and
 * keeps the data URI small.
 *
 * Amplitude sits at 0.92 of full scale with a 4 ms fade on each edge. The fade
 * is not decoration: a square wave starting at full amplitude clicks, and on a
 * phone speaker a click reads as distortion rather than volume.
 */
export function alarmWavDataUri(): string {
  const rate = 8000;
  const beeps: [number, number][] = [
    [1000, 0.16], [0, 0.09],
    [1400, 0.16], [0, 0.09],
    [1000, 0.16], [0, 0.09],
    [1400, 0.16], [0, 0.09],
    [1000, 0.16], [0, 0.09],
    [1400, 0.26],
  ];
  const total = beeps.reduce((n, [, d]) => n + Math.round(d * rate), 0);
  const pcm = new Int16Array(total);

  let at = 0;
  for (const [freq, dur] of beeps) {
    const n = Math.round(dur * rate);
    if (freq > 0) {
      const fade = Math.min(Math.round(0.004 * rate), Math.floor(n / 2));
      for (let i = 0; i < n; i++) {
        // Square, for loudness per unit amplitude. A sine of the same peak is
        // markedly quieter to the ear.
        const square = Math.sin((2 * Math.PI * freq * i) / rate) >= 0 ? 1 : -1;
        let env = 1;
        if (i < fade) env = i / fade;
        else if (i > n - fade) env = (n - i) / fade;
        pcm[at + i] = Math.round(square * env * 0.92 * 32767);
      }
    }
    at += n;
  }

  const bytes = new Uint8Array(44 + pcm.length * 2);
  const dv = new DataView(bytes.buffer);
  const ascii = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i));
  };
  ascii(0, "RIFF");
  dv.setUint32(4, 36 + pcm.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);          // PCM
  dv.setUint16(22, 1, true);          // mono
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);   // byte rate
  dv.setUint16(32, 2, true);          // block align
  dv.setUint16(34, 16, true);         // bits
  ascii(36, "data");
  dv.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, pcm[i], true);

  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(bin);
}

let alarmSrc: string | null = null;
function alarmSource(): string {
  if (!alarmSrc) alarmSrc = alarmWavDataUri();
  return alarmSrc;
}

/* ── Keeping the page awake ──────────────────────────────────────────────── */

let keepAliveEl: HTMLAudioElement | null = null;
let keepAliveHolders = 0;

/** Two seconds of silence, looped. Enough that the tab counts as playing. */
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

/**
 * Hold the page awake. Reference counted, so two timers running at once cannot
 * have one of them release the other's keepalive.
 */
export function holdPageAwake(): () => void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return () => {};
  keepAliveHolders += 1;
  try {
    if (!keepAliveEl) {
      keepAliveEl = new Audio(SILENCE);
      keepAliveEl.loop = true;
      keepAliveEl.volume = 0.001; // not 0: some browsers treat muted as not playing
    }
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
export const REST_VIBRATE: number[] = [400, 150, 400, 150, 400, 150, 700];

export interface ArmedAlarm {
  /** Ring it. Safe to call more than once; only the first does anything. */
  fire: (opts?: { hidden?: boolean; exerciseName?: string | null }) => void;
  /** Let go of the keepalive and the audio element. */
  release: () => void;
}

/**
 * Create and unlock the alarm NOW, while a user gesture is in hand, so that
 * ringing later is only a play() and cannot be refused by autoplay policy.
 */
export function armRestAlarm(): ArmedAlarm {
  const releaseAwake = holdPageAwake();
  let el: HTMLAudioElement | null = null;
  let fired = false;

  if (typeof window !== "undefined" && typeof Audio !== "undefined") {
    try {
      el = new Audio(alarmSource());
      el.preload = "auto";
      // FULL volume, always. This is the alarm the user asked for; it does not
      // read the app's tap-sound preference, and there is no quiet setting for
      // it short of the phone's own media volume.
      el.volume = 1;
      el.load();
    } catch {
      el = null;
    }
  }

  return {
    fire: (opts) => {
      if (fired) return;
      fired = true;
      const hidden = !!opts?.hidden;

      // ALWAYS the audio, hidden or not. It rides the media stream, so it is
      // heard with the phone on vibrate — which a notification's own sound
      // would not be, since that follows the ringer.
      try {
        if (el) {
          el.currentTime = 0;
          el.volume = 1;
          void el.play().catch(() => {});
        }
      } catch {
        /* fall through — the vibration and notification may still land */
      }

      if (hidden) {
        // Chrome ignores navigator.vibrate() from a hidden page, so the buzz
        // has to come from the notification, which also puts it on the lock
        // screen where it can be read without unlocking.
        void showRestNotification(opts?.exerciseName ?? null);
      } else {
        try {
          navigator.vibrate?.(REST_VIBRATE);
        } catch {
          /* vibration is a nicety; never let it take the sound down with it */
        }
      }
    },
    release: () => {
      releaseAwake();
      try {
        el?.pause();
      } catch {
        /* noop */
      }
      el = null;
    },
  };
}

export async function showRestNotification(exerciseName: string | null): Promise<void> {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.ready;
    await reg?.showNotification("Rest is up", {
      body: exerciseName ? `Next: ${exerciseName}` : "Back to it.",
      // A tag means a second rest replaces the first rather than stacking a
      // shade full of identical cards.
      tag: "symmetry-rest",
      renotify: true,
      silent: false,
      vibrate: REST_VIBRATE,
      data: { kind: "rest" },
    } as NotificationOptions);
  } catch {
    /* the audio already rang for anyone who could hear it */
  }
}

/**
 * Ring once, right now, with no timer involved. This is what the Test button
 * in Settings calls — five seconds to find out what your phone actually does,
 * instead of doing a set and waiting ninety.
 */
export function testRestAlarm(): void {
  const armed = armRestAlarm();
  armed.fire({ hidden: false });
  // Long enough for the sound to finish before the element is dropped.
  setTimeout(() => armed.release(), 4000);
}
