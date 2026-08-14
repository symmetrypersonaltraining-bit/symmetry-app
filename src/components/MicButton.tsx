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
import { startDictation } from "@/lib/dictation";

export default function MicButton({
  onText,
  size = 36,
  disabled = false,
  style,
  onNotice,
}: {
  /** Called with the transcript. Callers APPEND — never replace what was typed. */
  onText: (text: string) => void;
  size?: number;
  disabled?: boolean;
  style?: React.CSSProperties;
  /** Shown instead of alert() where the surface has somewhere better to put it. */
  onNotice?: (msg: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop?: () => void } | null>(null);

  // A recogniser left running after the sheet closes holds Android's single
  // recogniser slot, and the NEXT mic anywhere in the app then fails to start.
  useEffect(() => () => { try { recRef.current?.stop?.(); } catch { /* noop */ } }, []);

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
        const msg = /not-allowed|denied|permission/i.test(reason)
          ? "Microphone permission is off for this app — turn it on in your phone settings, or type it instead."
          : "Voice isn't available on this device — you can type it instead.";
        if (onNotice) onNotice(msg);
        else alert(msg);
      },
    }) as { stop?: () => void } | null;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-label={listening ? "Stop dictation" : "Dictate"}
      aria-pressed={listening}
      title={listening ? "Stop" : "Speak"}
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 3),
        background: listening ? "#ef4444" : "var(--brand-bg)",
        color: listening ? "#fff" : "var(--brand-text)",
        border: "1px solid var(--brand-border)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
        ...style,
      }}
    >
      <i
        className={`ti ${listening ? "ti-player-stop-filled" : "ti-microphone"}`}
        style={{ fontSize: Math.round(size / 2) }}
      />
    </button>
  );
}
