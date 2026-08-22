"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TUTORIAL, SETUP_CHECKS, allSteps, type SetupCheckKey } from "@/lib/tutorial/script";
import { narrate, speechSupported, stopSpeaking, unlockNarration, type Narration } from "@/lib/speech";
import { resolveAudio } from "@/lib/tutorial/audio";
import { setPageContext } from "@/lib/pageContext";
import { useTutorialVisibility } from "@/lib/useTutorialVisibility";

/**
 * The player.
 *
 * Progress lives in localStorage, not the database, and that is a decision
 * rather than a shortcut: this records "I have read this", which is worth
 * nothing to anyone but the reader and costs a migration to store properly.
 * The half of the checklist that actually matters — calendar connected, client
 * added, program assigned — is read live from the database on the server and
 * cannot be ticked by hand at all.
 *
 * Voice is off until asked for. An app that starts talking the moment you open
 * a page is an app you close.
 */

/**
 * Wipe every trace of a run: what was seen, where they stopped, the voice
 * choice. Dustin asked for "test, adjust, reset and test again" — without this
 * a tester gets exactly one clean walkthrough, and every run after it starts
 * part-way in with ticks already showing, which is the opposite of a test.
 */
function resetTutorialProgress(): void {
  for (const k of [SEEN_KEY, POS_KEY, VOICE_KEY, AI_KEY]) {
    try { localStorage.removeItem(k); } catch { /* nothing to undo */ }
  }
}

/** Older iOS Safari, and any page without clipboard permission. */
function fallbackCopy(text: string, onOk: () => void): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  try { document.execCommand("copy"); onOk(); } catch { /* they can select it by hand */ }
  document.body.removeChild(ta);
}

const SEEN_KEY = "symmetry_tutorial_seen_v1";
/**
 * Whether this reader is using the app's AI.
 *
 * Dustin, 21 Aug: a trainer with no AI gets "every AI step branched to its
 * manual equivalent" rather than a bolt-on chapter. This is which walkthrough
 * they are reading, so it lives beside the other reading preferences rather
 * than in the database — it is not a claim about their account.
 */
const AI_KEY = "symmetry_tutorial_uses_ai_v1";
const VOICE_KEY = "symmetry_tutorial_voice_v1";
const POS_KEY = "symmetry_tutorial_pos_v1";

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export default function TutorialClient({ setup }: { setup: Record<SetupCheckKey, boolean> }) {
  const [usesAi, setUsesAi] = useState(true);
  const steps = useMemo(() => allSteps({ usesAi }), [usesAi]);
  const [idx, setIdx] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [voice, setVoice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ready, setReady] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [copied, setCopied] = useState(false);
  const active = useRef<Narration | null>(null);
  // Which step's line has already been started. go() starts the next step's
  // narration inside the tap; without this the arrival effect would then start
  // it a second time and the two would talk over each other.
  const startedFor = useRef<string | null>(null);
  // go() is a useCallback and must not change identity every time voice does.
  const voiceOn = useRef(false);
  voiceOn.current = voice;
  const { dismissed, hide, show } = useTutorialVisibility();

  useEffect(() => {
    setSeen(loadSeen());
    try {
      setVoice(localStorage.getItem(VOICE_KEY) === "1");
      setUsesAi(localStorage.getItem(AI_KEY) !== "0");
      const p = Number(localStorage.getItem(POS_KEY));
      if (Number.isFinite(p) && p > 0 && p < steps.length) setIdx(p);
    } catch {
      /* private mode — start from the top, no harm done */
    }
    setReady(true);
  }, [steps.length]);

  const step = steps[idx];

  // Mark seen and remember the place, whenever the step changes.
  useEffect(() => {
    if (!ready || !step) return;
    setSeen((prev) => {
      if (prev.has(step.id)) return prev;
      const next = new Set(prev);
      next.add(step.id);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
      } catch {
        /* nothing to do; the tutorial still works, it just forgets */
      }
      return next;
    });
    try {
      localStorage.setItem(POS_KEY, String(idx));
    } catch {
      /* as above */
    }
  }, [idx, ready, step]);

  // Publish WHICH STEP, so a feedback report from here says more than
  // "/tutorial". All 51 steps share one URL, so without this every report a
  // testing trainer files is indistinguishable from every other.
  useEffect(() => {
    if (!step) return;
    setPageContext(`tutorial: ${step.chapterId}/${step.id} — ${step.title}`);
    return () => setPageContext(null);
  }, [step]);

  const stop = useCallback(() => {
    active.current?.stop();
    active.current = null;
    stopSpeaking();
    setSpeaking(false);
  }, []);

  const play = useCallback(
    (s: typeof step) => {
      if (!s) return;
      stop();
      // resolveAudio, not s.audioUrl: recordings are matched to steps by id
      // from what actually exists in public/tutorial-audio. An explicit
      // audioUrl on the step still wins. Null falls back to the browser voice,
      // which is what every unrecorded step does.
      startedFor.current = s.id;
      const n = narrate(s.narration, resolveAudio(s));
      active.current = n;
      setSpeaking(true);
      n.done.then(() => {
        if (active.current === n) {
          active.current = null;
          setSpeaking(false);
        }
      });
    },
    [stop],
  );

  // Speak on arrival — but only for arrivals go() did not already handle.
  //
  // This used to `return stop`, which was the second half of the silence: go()
  // started the new line inside the tap, React re-rendered, and this cleanup
  // ran and killed it. Unmount is covered by the effect below, which is where
  // that belongs.
  useEffect(() => {
    if (!ready || !voice || !step) return;
    if (startedFor.current === step.id) return;
    play(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, voice, ready]);

  // Never leave a voice talking to an empty room.
  useEffect(() => stop, [stop]);

  const go = useCallback(
    (n: number) => {
      const at = Math.max(0, Math.min(steps.length - 1, n));
      stop();
      setIdx(at);
      // Start the next line HERE, still inside the tap that asked for it.
      // Firing it from the arrival effect instead put it a tick past the
      // gesture, which is the window mobile actually checks — the first line
      // played and every one after it was refused.
      if (voiceOn.current) {
        unlockNarration();
        play(steps[at]);
      }
    },
    // play/stop are stable; voice is read through a ref so this keeps its
    // identity and the buttons do not re-bind on every toggle.
    [steps, stop, play],
  );

  if (!ready || !step) return null;

  const pct = Math.round(((idx + 1) / steps.length) * 100);
  // Show the player if EITHER route to sound exists. The old gate asked only
  // whether the browser could do text-to-speech, which hid a real recording
  // from anything with speech synthesis switched off or unavailable.
  const recorded = !!resolveAudio(step);
  const canHear = recorded || speechSupported();
  const outstanding = SETUP_CHECKS.filter((c) => !setup[c.key]);
  const onLastChapter = step.chapterId === "finish";

  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--brand-text)" }}>
            Setting up your app
          </h1>
          <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            {step.chapterTitle} · step {idx + 1} of {steps.length}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowMap((v) => !v)}
          className="text-xs px-3 py-2 rounded-lg font-semibold shrink-0"
          style={{ background: "var(--brand-surface-2)", color: "var(--brand-text-secondary)" }}
        >
          {showMap ? "Hide contents" : "Contents"}
        </button>
      </div>

      <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: "var(--brand-surface-2)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--brand-accent)" }} />
      </div>

      {showMap ? (
        <div className="mb-4 rounded-xl p-3" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          {TUTORIAL.map((c) => (
            <div key={c.id} className="mb-3 last:mb-0">
              <p className="text-xs font-bold mb-1" style={{ color: "var(--brand-text)", letterSpacing: 0.5 }}>
                {c.title.toUpperCase()}
              </p>
              <p className="text-xs mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>{c.blurb}</p>
              {c.steps.map((s) => {
                const at = steps.findIndex((x) => x.id === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setShowMap(false); go(at); }}
                    className="block w-full text-left text-sm py-1"
                    style={{ color: at === idx ? "var(--brand-accent)" : "var(--brand-text-secondary)" }}
                  >
                    {seen.has(s.id) ? "✓ " : "· "}{s.title}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Start over. Lives inside the map rather than on the main screen so
              nobody clears their place by fat-fingering the wrong button
              mid-walkthrough — you have to open the contents to reach it. */}
          {/* Which walkthrough this is. Changing it re-reads the script, so it
              sits with Start over rather than on the step itself — it changes
              what the next forty steps say. */}
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--brand-border)" }}>
            <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text)" }}>
              Are you using the app&rsquo;s AI?
            </p>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => {
                    setUsesAi(v);
                    try { localStorage.setItem(AI_KEY, v ? "1" : "0"); } catch { /* fine */ }
                    setIdx(0);
                  }}
                  className="text-xs px-3 py-2 rounded-lg font-semibold"
                  style={{
                    background: usesAi === v ? "var(--brand-accent)" : "var(--brand-surface-2)",
                    color: usesAi === v ? "#fff" : "var(--brand-text-secondary)",
                    border: "none",
                  }}
                >
                  {v ? "Yes" : "No — show me how to do it by hand"}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: "var(--brand-text-secondary)" }}>
              {usesAi
                ? "Reading the full walkthrough."
                : "The AI steps are replaced with how to do the same thing yourself."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!confirm("Start the tutorial from the beginning? This clears your progress.")) return;
              resetTutorialProgress();
              setSeen(new Set());
              setShowMap(false);
              go(0);
            }}
            className="mt-3 text-xs"
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              color: "var(--brand-text-secondary)", textDecoration: "underline",
            }}
          >
            Start over from the beginning
          </button>
        </div>
      ) : null}

      <div className="rounded-2xl p-5 mb-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-bold" style={{ color: "var(--brand-text)" }}>{step.title}</h2>
          {step.status === "preview" ? (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "var(--brand-surface-2)", color: "var(--brand-text-secondary)" }}
            >
              NOT BUILT YET
            </span>
          ) : null}
        </div>

        {/* The player, at the top of the card where it is the first thing you
            see. It used to be a grey "Voice off" button sitting fourth in a row
            of grey buttons under the text, and the first person to test the
            tutorial reported that it had no voice at all. A recording nobody
            can find is the same as no recording. */}
        {canHear ? (
          <div
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 mb-4"
            style={{ background: "var(--brand-surface-2)", border: "1px solid var(--brand-border)" }}
          >
            <button
              type="button"
              aria-label={speaking ? "Stop narration" : "Play narration"}
              onClick={() => {
                // A real tap: unlock first, then act. Turning voice on here is
                // what arms auto-play for every step after this one.
                unlockNarration();
                if (speaking) { stop(); return; }
                if (!voice) {
                  setVoice(true);
                  try { localStorage.setItem(VOICE_KEY, "1"); } catch { /* fine */ }
                }
                play(step);
              }}
              className="flex items-center justify-center rounded-full shrink-0"
              style={{ width: 40, height: 40, background: "var(--brand-accent)", color: "#fff", border: "none" }}
            >
              <i className={`ti ${speaking ? "ti-player-pause-filled" : "ti-player-play-filled"} text-lg`} />
            </button>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
                {speaking ? "Playing…" : recorded ? "Listen instead" : "Read this out loud"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                {recorded
                  ? voice
                    ? "Recorded narration. Plays automatically on each step."
                    : "Recorded narration. Tap play and it follows you through."
                  : "This step has no recording yet, so your phone reads it."}
              </p>
            </div>

            {voice ? (
              <button
                type="button"
                onClick={() => {
                  setVoice(false);
                  try { localStorage.setItem(VOICE_KEY, "0"); } catch { /* fine */ }
                  stop();
                }}
                className="text-xs font-semibold shrink-0 px-2 py-1 rounded-lg"
                style={{ background: "transparent", border: "none", color: "var(--brand-text-secondary)", textDecoration: "underline" }}
              >
                Mute
              </button>
            ) : null}
          </div>
        ) : null}

        {step.body.map((p, i) => (
          <p key={i} className="text-sm mb-2.5 leading-relaxed" style={{ color: "var(--brand-text-secondary)" }}>
            {p}
          </p>
        ))}

        {/* A block to copy out of the app. The avatar script has to travel WITH
            the tutorial: the alternative is the owner relaying a wall of text
            to four people and one of them getting the old version, which is
            exactly the version that produces seven empty slots. */}
        {step.copyText ? (
          <div className="mt-4 rounded-xl p-3" style={{ background: "var(--brand-surface-2)", border: "1px solid var(--brand-border)" }}>
            <pre style={{
              whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
              maxHeight: 190, overflow: "auto", fontSize: 11.5, lineHeight: 1.5,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "var(--brand-text-secondary)",
            }}>{step.copyText}</pre>
            <button
              type="button"
              onClick={() => {
                const text = step.copyText || "";
                const ok = () => { setCopied(true); setTimeout(() => setCopied(false), 2600); };
                if (navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(text).then(ok, () => fallbackCopy(text, ok));
                } else fallbackCopy(text, ok);
              }}
              className="w-full mt-2.5 py-2.5 rounded-lg text-sm font-bold"
              style={{ background: "var(--brand-accent)", color: "#fff", border: "none" }}
            >
              {copied ? "Copied — paste it into Gemini" : (step.copyLabel || "Copy")}
            </button>
          </div>
        ) : null}

        {step.route ? (
          <div className="flex flex-wrap gap-2 mt-4">
            <Link
              href={step.route}
              target="_blank"
              className="text-sm px-3 py-2 rounded-lg font-semibold"
              style={{ background: "var(--brand-accent)", color: "#fff" }}
            >
              {step.routeLabel || "Open this screen"} ↗
            </Link>
          </div>
        ) : null}
      </div>

      {onLastChapter ? (
        <div className="rounded-2xl p-5 mb-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          <h3 className="text-base font-bold mb-1" style={{ color: "var(--brand-text)" }}>Your setup</h3>
          <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
            Read from your account, not from boxes you ticked.
          </p>
          {SETUP_CHECKS.map((c) => {
            const ok = setup[c.key];
            return (
              <div key={c.key} className="flex gap-2.5 py-2" style={{ borderTop: "1px solid var(--brand-border)" }}>
                <span className="text-base leading-6" style={{ color: ok ? "var(--brand-accent)" : "var(--brand-text-secondary)" }}>
                  {ok ? "✓" : "○"}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{c.label}</p>
                  {!ok ? (
                    <>
                      <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{c.hint}</p>
                      <Link href={c.route} target="_blank" className="text-xs font-semibold" style={{ color: "var(--brand-accent)" }}>
                        Sort this out ↗
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
          <p className="text-xs mt-3" style={{ color: "var(--brand-text-secondary)" }}>
            {outstanding.length === 0
              ? "Nothing outstanding. You are set up."
              : `${outstanding.length} still open. None of them stops you working today.`}
          </p>

          {/* The off switch, here at the end because this is where a trainer is
              standing when they decide they are finished.

              It is THEIR row, not the app-wide flag. Dustin turning the guide
              off after his own run must not take it away from the trainer being
              onboarded next week, which is exactly what the global switch would
              do. And it hides rather than deletes: this screen keeps working,
              and Settings can put it back. */}
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--brand-border)" }}>
            {dismissed ? (
              <>
                <p className="text-xs mb-2" style={{ color: "var(--brand-text-secondary)" }}>
                  The guide is hidden from your Home screen and sidebar. It is still here whenever you want it.
                </p>
                <button
                  type="button"
                  onClick={() => { void show(); }}
                  className="text-sm px-3 py-2 rounded-lg font-semibold"
                  style={{ background: "var(--brand-surface-2)", color: "var(--brand-text)", border: "none" }}
                >
                  Put it back on my Home screen
                </button>
              </>
            ) : (
              <>
                <p className="text-xs mb-2" style={{ color: "var(--brand-text-secondary)" }}>
                  Finished with it? Hide it and it stops appearing on Home and in the sidebar — for you only.
                  Other trainers keep theirs, and you can bring yours back from Settings.
                </p>
                <button
                  type="button"
                  onClick={() => { void hide(); }}
                  className="text-sm px-3 py-2 rounded-lg font-semibold"
                  style={{ background: "var(--brand-surface-2)", color: "var(--brand-text)", border: "none" }}
                >
                  I&apos;m done — hide the setup guide
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(idx - 1)}
          disabled={idx === 0}
          className="px-4 py-3 rounded-xl font-semibold text-sm disabled:opacity-40"
          style={{ background: "var(--brand-surface-2)", color: "var(--brand-text)" }}
        >
          Back
        </button>
        {idx < steps.length - 1 ? (
          <button
            type="button"
            onClick={() => go(idx + 1)}
            className="flex-1 px-4 py-3 rounded-xl font-bold text-sm"
            style={{ background: "var(--brand-accent)", color: "#fff" }}
          >
            Next
          </button>
        ) : (
          <Link
            href="/home"
            className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-center"
            style={{ background: "var(--brand-accent)", color: "#fff" }}
          >
            Done — take me to Home
          </Link>
        )}
      </div>
    </div>
  );
}
