"use client";

// ONE mic. Every AI text input in the app renders THIS.
//
// Dustin, 14 Aug 2026: "Any AI that we interact with in the app needs to have
// mics added, and you need to make sure they're working."
//
// Two failures were found while doing that, and both are the reason this is a
// shared component rather than five more copies of the same twelve lines:
//
//   1. The ✦ Coach — the AI clients actually tap, on every screen — had no mic
//      at all. Five other surfaces had one. Nobody noticed, because each of the
//      five was correct on its own.
//
//   2. The nutrition logger's "Say it out loud" row had its own inline
//      `webkitSpeechRecognition` block instead of lib/dictation. That API DOES
//      NOT EXIST in the Capacitor WebView, which is the shell Dustin's clients
//      actually run. So voice logging was dead on the real app and worked
//      perfectly in the desktop browser anyone would have tested it in. It also
//      had no mic next to the textarea once you were typing — the only way to
//      reach it was the row on the previous screen.
//
// So: no component re-implements speech. It calls startDictation, which knows
// about the native bridge, and there is a guard test that fails if a second
// implementation ever appears.
//
// Failure is SPOKEN, not swallowed. `onUnavailable` fires with a real reason
// code ("not-allowed" = mic permission denied, "no-engine" = no recognizer);
// a mic that silently does nothing is indistinguishable from a broken one, and
// that is exactly how the logger's stayed broken.

import { useEffect, useRef, useState } from "react";
import { startDictation, dictationMessage } from "@/lib/dictation";
import { COACH_FIRST_NAME } from "@/lib/trainer";

export default function MicButton({
  onText,
  size = 36,
  disabled = false,
  style,
  onNotice,
  onListeningChange,
}: {
  /** Called with the transcript. Callers APPEND — never replace what was typed. */
  onText: (text: string) => void;
  size?: number;
  disabled?: boolean;
  style?: React.CSSProperties;
  /** Shown instead of alert() where the surface has somewhere better to put it. */
  onNotice?: (msg: string) => void;
  /**
   * Mirrors the listening state out to the parent.
   *
   * Only here so surfaces that show their own "🎤 Listening…" line next to the
   * box could adopt this component WITHOUT losing it. Without this the swap
   * would have been a downgrade for them, and a downgrade is how a shared
   * component gets refused and a fifth copy gets written instead.
   */
  onListeningChange?: (listening: boolean) => void;
}) {
  const [listening, setListeningState] = useState(false);
  const recRef = useRef<{ stop?: () => void } | null>(null);
  const notifyRef = useRef(onListeningChange);
  notifyRef.current = onListeningChange;

  function setListening(v: boolean) {
    setListeningState(v);
    notifyRef.current?.(v);
  }

  // A recogniser left running after the sheet closes holds Android's single
  // recogniser slot, and the NEXT mic anywhere in the app then fails to start.
  useEffect(() => () => {
    try { recRef.current?.stop?.(); } catch { /* noop */ }
    notifyRef.current?.(false);
  }, []);

  function toggle() {
    if (listening) {
      try { recRef.current?.stop?.(); } catch { /* noop */ }
      setListening(false);
      return;
    }
    recRef.current = startDictation({
      onResult: (t: string) => onText(t),
      onStart: () => setListening(true),
      onEnd: () => setListening(false),
      onUnavailable: (reason: string) => {
        setListening(false);
        // dictationMessage lives in lib/dictation and separates a permission the
        // person can grant from a device limit they cannot from a network blip.
        // It came from WorkoutLogger, which was the only surface that made the
        // distinction; every mic makes it now.
        const msg = dictationMessage(reason);
        if (onNotice) onNotice(msg);
        // A modal from inside a WebView overlay is ignored at best and wedges
        // the page at worst — so alert() is the LAST resort, only where the
        // caller gave us nowhere better to put it.
        else alert(`${msg}\n\nIf it keeps happening, send ${COACH_FIRST_NAME} this message.`);
      },
    }) as { stop?: () => void } | null;
  }

  // While recording the button shows moving sound bars in a pulsing halo
  // instead of a stop icon. Dustin, after testing on the phone: "mic seems to
  // work but needs animation while recording." A static red button is a state;
  // it does not answer "is it still listening to me", which is the only thing
  // you want to know while you are talking at a phone. Keyframes live in
  // globals.css (.mic-live / .mic-wave).
  const waveHeight = Math.max(8, Math.round(size * 0.34));

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-label={listening ? "Stop dictation" : "Dictate"}
      aria-pressed={listening}
      title={listening ? "Stop" : "Speak"}
      className={`flex items-center justify-center flex-shrink-0${listening ? " mic-live" : ""}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 3),
        background: listening ? "#ef4444" : "var(--brand-bg)",
        color: listening ? "#fff" : "var(--brand-text)",
        border: listening ? "1px solid #ef4444" : "1px solid var(--brand-border)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
        transition: "background 120ms ease, color 120ms ease",
        ...style,
      }}
    >
      {listening ? (
        <span className="mic-wave" style={{ height: waveHeight }} aria-hidden="true">
          <span /><span /><span /><span />
        </span>
      ) : (
        <i className="ti ti-microphone" style={{ fontSize: Math.round(size / 2) }} />
      )}
    </button>
  );
}
