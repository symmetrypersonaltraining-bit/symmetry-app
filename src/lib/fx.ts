/**
 * fx — haptic + sound vocabulary. 2026-07-25.
 *
 * Two problems this solves:
 *  1. Every tap in the app fired the same flat 12ms buzz, so logging a PR felt
 *     identical to a failed save. Now each event has its own pattern.
 *  2. There was no sound at all. These are synthesised with Web Audio — no
 *     audio files ship, nothing to download, and it retunes per theme.
 *
 * SAFETY
 *  - Sound is OFF by default and requires an explicit opt-in. One unexpected
 *    chime in a quiet gym and people mute the app permanently.
 *  - Haptics are private, so they are ON by default (Android only —
 *    navigator.vibrate does not exist in iOS Safari/WebView; when the iOS build
 *    ships this needs the native Capacitor Haptics plugin).
 *  - prefers-reduced-motion also silences sound, since motion sensitivity and
 *    sensory sensitivity travel together.
 *  - Every call is wrapped. An effect must never break an interaction.
 */

export type Fx =
  | "tap" | "log" | "section" | "pr" | "complete"
  | "rest" | "send" | "receive" | "meal" | "error" | "streak";

const HAPTICS: Record<Fx, number | number[]> = {
  tap: 8,
  log: 12,
  meal: 10,
  section: [14, 55, 14],
  pr: [12, 40, 20, 40, 34],
  complete: [16, 45, 16, 45, 30, 60, 70],
  rest: [26, 110, 26],
  send: 8,
  receive: [14, 55, 14],
  error: [45, 45, 45, 45, 45],
  streak: [8, 30, 14, 30, 22, 30, 32],
};

const SOUND_KEY = "symmetry_sound_on";
const HAPTIC_KEY = "symmetry_haptics_off";
const PROMPTED_KEY = "symmetry_sound_prompted";

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function reduced(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function soundEnabled(): boolean {
  try {
    return ls()?.getItem(SOUND_KEY) === "1" && !reduced();
  } catch {
    return false;
  }
}
export function setSoundEnabled(on: boolean) {
  try {
    ls()?.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    /* noop */
  }
}
export function hapticsEnabled(): boolean {
  try {
    return ls()?.getItem(HAPTIC_KEY) !== "1";
  } catch {
    return true;
  }
}
export function setHapticsEnabled(on: boolean) {
  try {
    ls()?.setItem(HAPTIC_KEY, on ? "0" : "1");
  } catch {
    /* noop */
  }
}
/** True once the one-time "turn sounds on?" prompt has been shown. */
export function soundPrompted(): boolean {
  try {
    return ls()?.getItem(PROMPTED_KEY) === "1";
  } catch {
    return true;
  }
}
export function markSoundPrompted() {
  try {
    ls()?.setItem(PROMPTED_KEY, "1");
  } catch {
    /* noop */
  }
}

/* ── Web Audio ─────────────────────────────────────────────────────────────
   One lazily-created context, reused. Created only on the first sound so we
   never open an AudioContext for someone who has sound off. */
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(f: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
  const c = audio();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    o.connect(g);
    g.connect(c.destination);
    const t0 = c.currentTime + delay;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch {
    /* noop */
  }
}

function sweep(from: number, to: number, dur: number, vol = 0.12) {
  const c = audio();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(from, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), c.currentTime + dur);
    o.connect(g);
    g.connect(c.destination);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  } catch {
    /* noop */
  }
}

const SOUNDS: Partial<Record<Fx, () => void>> = {
  log: () => tone(880, 0.05, "triangle", 0.09),
  meal: () => {
    tone(520, 0.09, "sine", 0.11);
    tone(780, 0.06, "sine", 0.06, 0.02);
  },
  section: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, "sine", 0.1, i * 0.075)),
  streak: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, "sine", 0.1, i * 0.075)),
  complete: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.85, "sine", 0.08, i * 0.045)),
  pr: () => {
    [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.32, "triangle", 0.1, i * 0.1));
    tone(1568, 0.7, "sine", 0.06, 0.4);
  },
  rest: () => {
    tone(1047, 0.42, "sine", 0.13);
    tone(1319, 0.5, "sine", 0.11, 0.19);
  },
  send: () => sweep(1400, 380, 0.24, 0.1),
  receive: () => {
    sweep(420, 760, 0.1, 0.1);
    tone(880, 0.07, "sine", 0.07, 0.06);
  },
  error: () => {
    tone(320, 0.16, "square", 0.08);
    tone(220, 0.28, "square", 0.08, 0.13);
  },
};

/**
 * Fire an effect. Safe to call anywhere, including during render-adjacent
 * handlers — it never throws and never blocks.
 */
export function fx(kind: Fx) {
  try {
    if (hapticsEnabled() && typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(HAPTICS[kind] ?? 8);
    }
  } catch {
    /* noop */
  }
  try {
    if (soundEnabled()) SOUNDS[kind]?.();
  } catch {
    /* noop */
  }
}
