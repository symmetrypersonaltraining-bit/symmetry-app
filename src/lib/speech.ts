/**
 * ONE voice. Every place in the app that speaks out loud calls this.
 *
 * It started life inside the movement coach as a private helper. The tutorial
 * needs the same thing, and two independent SpeechSynthesis callers mean two
 * voices talking over each other the moment a trainer opens the tutorial with
 * a movement capture still running — cancel() is global, so whichever spoke
 * last silently kills the other.
 *
 * The pre-recorded branch is not speculative: all 51 tutorial steps are cut in
 * Dustin's voice and live in public/tutorial-audio. `narrate()` prefers the
 * recording and falls back to the browser voice for anything unrecorded.
 * That is why this returns a handle instead of void — a recording has to be
 * stoppable, and the caller must be able to know when it ended.
 */

export interface Narration {
  /** Stop immediately. Safe to call twice. */
  stop: () => void;
  /** Resolves when the line finishes, or when stop() is called. Never rejects. */
  done: Promise<void>;
}

const SILENT: Narration = { stop: () => {}, done: Promise.resolve() };

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Cancel anything currently speaking, from any caller. */
export function stopSpeaking() {
  if (typeof window === "undefined") return;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/**
 * ONE <audio> element for the life of the tab, and the reason is mobile.
 *
 * The first version built `new Audio(url)` per line. That plays fine for the
 * line the trainer tapped for, and then goes silent for every line after it:
 * iOS and Android only let a media element start when the gesture that asked
 * for it is still on the stack, and a step change fires the next line from an
 * effect, one tick too late. A freshly constructed element has never been
 * unlocked, so it is refused. The SAME element, once it has played inside a
 * real tap, keeps its permission for the rest of the session — so we reuse it
 * and only swap `src`. This is why the tutorial was silent from step two.
 */
let shared: HTMLAudioElement | null = null;

function element(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (!shared) {
    shared = new Audio();
    shared.preload = "auto";
  }
  return shared;
}

/**
 * Prime SPEECH SYNTHESIS on a user gesture. Nothing to do with the recordings.
 *
 * An earlier version of this also poked the shared <audio> element: muted it,
 * played it, and unmuted it in a promise callback. That was worse than useless.
 * The callback landed AFTER the real line had already started, so it paused the
 * narration a beat after it began and left `muted` in whatever state the race
 * decided — a player that said "Playing…" and made no sound, and flickered
 * between states while it fought itself. Reported exactly that way.
 *
 * The element does not need a separate unlock. The first line always starts
 * inside a real tap (see go() and the play button), and a media element that
 * has once played from a gesture keeps that permission for the session — which
 * is the whole reason there is one shared element. So this only does the half
 * that genuinely needs a gesture and cannot be folded into playback: Safari
 * will not speak from a timer unless synthesis has spoken once inside one.
 *
 * Safe to call repeatedly. Silent by construction.
 */
export function unlockNarration(): void {
  if (!speechSupported()) return;
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* an unlock that fails only means the fallback voice may stay quiet */
  }
}

/**
 * Browser TTS. Clear, calm, one instruction at a time.
 * Kept name-compatible with the movement coach's original helper.
 */
export function speak(line: string, opts?: { rate?: number; pitch?: number }): Narration {
  if (!speechSupported()) return SILENT;
  const u = new SpeechSynthesisUtterance(line);
  u.rate = opts?.rate ?? 0.98;
  u.pitch = opts?.pitch ?? 1.0;
  u.volume = 1;

  let settle: () => void = () => {};
  const done = new Promise<void>((res) => {
    settle = res;
  });
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    settle();
  };
  u.onend = finish;
  // onerror fires on cancel() in some browsers and on a genuine failure in
  // others. Either way the line is over and the caller must not hang.
  u.onerror = finish;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);

  return {
    stop: () => {
      stopSpeaking();
      finish();
    },
    done,
  };
}

/**
 * Speak a line, preferring a pre-recorded file when one exists.
 * `audioUrl` wins; browser TTS is the fallback for anything unrecorded.
 */
export function narrate(line: string, audioUrl?: string | null): Narration {
  const el = audioUrl ? element() : null;
  if (!el) return speak(line);

  stopSpeaking();

  let settle: () => void = () => {};
  const done = new Promise<void>((res) => {
    settle = res;
  });
  let finished = false;
  let fallback: Narration | null = null;

  // The element outlives this call, so its handlers must not: a stale onended
  // from the previous line would resolve the wrong promise. Detach on finish.
  const detach = () => {
    if (el.onended === onEnded) el.onended = null;
    if (el.onerror === onError) el.onerror = null;
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    detach();
    settle();
  };
  const url = audioUrl as string;
  const toBrowserVoice = () => {
    if (finished) return;
    fallback = speak(line);
    fallback.done.then(finish);
  };
  const onEnded = () => finish();
  const onError = () => {
    if (finished) return;
    // Swapping src while the previous line is still loading makes the browser
    // fire an ABORT on this element. That is this call cancelling the last one,
    // not a broken recording — reacting to it started the browser voice on top
    // of the line that was about to play, which is what "glitches like crazy"
    // looked like from the outside.
    if (el.error && el.error.code === el.error.MEDIA_ERR_ABORTED) return;
    // And an error that arrives for a line we have already moved on from
    // belongs to that line, not this one.
    if (el.currentSrc && !el.currentSrc.endsWith(url)) return;
    // A missing or unplayable recording must not leave the step silent.
    toBrowserVoice();
  };

  // Detach BEFORE touching src: whatever the previous line left in flight must
  // land on nothing rather than on this line's handlers.
  el.onended = null;
  el.onerror = null;
  el.pause();
  el.src = url;
  el.currentTime = 0;
  el.onended = onEnded;
  el.onerror = onError;

  void el.play().catch(toBrowserVoice);

  return {
    stop: () => {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        /* the element may not have loaded; nothing to rewind */
      }
      fallback?.stop();
      stopSpeaking();
      finish();
    },
    done,
  };
}
