// Unified voice dictation.
// Inside the native shell the WebView has NO web speech engine, so we use the
// @capacitor-community/speech-recognition plugin (Android's system recognizer)
// via the injected Capacitor bridge — no npm import needed. In normal browsers
// we fall back to webkitSpeechRecognition. Crash-safe: never throws; callers
// get onUnavailable instead.

export type DictationHandle = { stop: () => void };

type Callbacks = {
  onResult: (text: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onUnavailable?: (reason: string) => void;
};

type NativeSpeech = {
  available?: () => Promise<{ available?: boolean }>;
  requestPermissions?: () => Promise<unknown>;
  start?: (opts: { language: string; maxResults: number; partialResults: boolean; popup: boolean }) => Promise<{ matches?: string[] }>;
  stop?: () => Promise<void>;
};

export function startDictation(cb: Callbacks): DictationHandle {
  let stopped = false;
  try {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { SpeechRecognition?: NativeSpeech } }; SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const cap = w.Capacitor;
    const native = cap && cap.Plugins && cap.Plugins.SpeechRecognition;
    const inShell = !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());

    if (native && inShell && typeof native.start === "function") {
      (async () => {
        try {
          let ok = true;
          try {
            const avail = native.available ? await native.available() : { available: true };
            ok = avail?.available !== false;
          } catch { /* assume available; start() will error if not */ }
          if (!ok) { cb.onUnavailable?.("native-unavailable"); return; }
          try { if (native.requestPermissions) await native.requestPermissions(); } catch { /* start() surfaces denial */ }
          // Best-effort release of any prior session (Android allows one recognizer at a
          // time). Fire-and-forget — never awaited, so it can't hang start().
          try { const _p = native.stop?.(); if (_p && typeof (_p as Promise<void>).catch === "function") (_p as Promise<void>).catch(() => {}); } catch { /* noop */ }
          cb.onStart?.();
          const res = await native.start!({ language: "en-US", maxResults: 1, partialResults: false, popup: false });
          const text = (res && res.matches && res.matches[0]) || "";
          if (!stopped && text) cb.onResult(text);
        } catch (e) {
          const detail = e && (e as { message?: string }).message ? (e as { message?: string }).message : String(e);
          if (!stopped) cb.onUnavailable?.("native-error: " + detail);
        } finally {
          cb.onEnd?.();
        }
      })();
      return { stop: () => { stopped = true; try { native.stop && native.stop(); } catch { /* noop */ } } };
    }

    // Browser fallback (desktop Chrome etc.)
    const SR = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => {
      lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
      onstart: (() => void) | null; onend: (() => void) | null; onerror: ((e: unknown) => void) | null;
      onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
      start: () => void; stop: () => void;
    }) | undefined;
    if (!SR) { cb.onUnavailable?.("no-engine"); return { stop: () => { /* noop */ } }; }
    const r = new SR();
    r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
    r.onstart = () => cb.onStart?.();
    r.onend = () => cb.onEnd?.();
    // Pass the real error code through. It used to report the bare string
    // "error" for every failure, which turns "not-allowed" (the user denied the
    // microphone), "no-speech" (they said nothing) and "network" into the same
    // unactionable message — and "the mic doesn't work" with no way to tell
    // which is exactly how this stayed broken.
    r.onerror = (e: unknown) => {
      const code = (e && typeof e === "object" && "error" in e ? String((e as { error: unknown }).error) : "") || "error";
      cb.onEnd?.();
      // "no-speech" and "aborted" are not failures — the user just stopped, or
      // said nothing. Reporting them as unavailable makes a working mic look
      // broken every time somebody taps it and pauses.
      if (!stopped && code !== "no-speech" && code !== "aborted") cb.onUnavailable?.("browser-error: " + code);
    };
    r.onresult = (e) => { try { const t = e.results[0]?.[0]?.transcript || ""; if (t && !stopped) cb.onResult(t); } catch { /* noop */ } };
    r.start();
    return { stop: () => { stopped = true; try { r.stop(); } catch { /* noop */ } } };
  } catch {
    cb.onUnavailable?.("error");
    return { stop: () => { /* noop */ } };
  }
}

/**
 * Turn a dictation failure reason into something the person can ACT on.
 *
 * Promoted here from WorkoutLogger, which had by far the best version of this
 * in the app and was the only surface using it. The distinction is the whole
 * point: "not-allowed" is a permission the person can grant in thirty seconds,
 * "no-engine" is a device limit they cannot do anything about, and "network"
 * is neither. One generic sentence for all three is how a fixable permission
 * prompt gets reported as "the mic doesn't work".
 *
 * MicButton calls this, so every mic in the app now says it instead of one.
 */
export function dictationMessage(why: string): string {
  const w = String(why || "");
  if (w === "no-engine") return "This device has no dictation engine — type it instead.";
  if (w.includes("not-allowed") || w.includes("permission") || w.includes("denied")) {
    return "Microphone permission is off for the app — turn it on in your phone's settings, then try again.";
  }
  if (w.includes("network")) return "Dictation needs a connection and couldn't reach the service.";
  if (w.startsWith("native-")) return "Dictation didn't start (" + w.replace("native-error: ", "") + "). Type it instead.";
  return "Dictation isn't available right now — type it instead.";
}
