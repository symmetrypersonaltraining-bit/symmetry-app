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
          // Release any prior recognition session that may still be bound (Android allows
          // only one recognizer at a time — a stuck session from an earlier mic makes
          // start() fail with BUSY). Best-effort; ignored if nothing is active.
          try { await native.stop?.(); } catch { /* nothing to stop */ }
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
    r.onerror = () => { cb.onEnd?.(); if (!stopped) cb.onUnavailable?.("error"); };
    r.onresult = (e) => { try { const t = e.results[0]?.[0]?.transcript || ""; if (t && !stopped) cb.onResult(t); } catch { /* noop */ } };
    r.start();
    return { stop: () => { stopped = true; try { r.stop(); } catch { /* noop */ } } };
  } catch {
    cb.onUnavailable?.("error");
    return { stop: () => { /* noop */ } };
  }
}
