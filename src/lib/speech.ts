/**
 * ONE voice. Every place in the app that speaks out loud calls this.
 *
 * It started life inside the movement coach as a private helper. The tutorial
 * needs the same thing, and two independent SpeechSynthesis callers mean two
 * voices talking over each other the moment a trainer opens the tutorial with
 * a movement capture still running — cancel() is global, so whichever spoke
 * last silently kills the other.
 *
 * The pre-recorded branch is not speculative. Dustin wants the tutorial
 * narrated in his own voice (Chatterbox). When those files exist, they drop in
 * as `audioUrl` on a step and nothing else changes: `narrate()` prefers a real
 * recording and falls back to the browser voice for anything not yet recorded.
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
  if (!audioUrl || typeof window === "undefined" || typeof Audio === "undefined") {
    return speak(line);
  }
  stopSpeaking();
  const el = new Audio(audioUrl);
  let settle: () => void = () => {};
  const done = new Promise<void>((res) => {
    settle = res;
  });
  let finished = false;
  let fallback: Narration | null = null;
  const finish = () => {
    if (finished) return;
    finished = true;
    settle();
  };
  el.onended = finish;
  el.onerror = () => {
    // A missing or unplayable recording must not leave the step silent.
    if (finished) return;
    fallback = speak(line);
    fallback.done.then(finish);
  };
  void el.play().catch(() => {
    if (finished) return;
    fallback = speak(line);
    fallback.done.then(finish);
  });

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
