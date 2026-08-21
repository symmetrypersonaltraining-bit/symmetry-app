"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TUTORIAL, SETUP_CHECKS, allSteps, type SetupCheckKey } from "@/lib/tutorial/script";
import { narrate, speechSupported, stopSpeaking, type Narration } from "@/lib/speech";
import { resolveAudio } from "@/lib/tutorial/audio";
import { setPageContext } from "@/lib/pageContext";

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
  for (const k of [SEEN_KEY, POS_KEY, VOICE_KEY]) {
    try { localStorage.removeItem(k); } catch { /* nothing to undo */ }
  }
}

const SEEN_KEY = "symmetry_tutorial_seen_v1";
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
  const steps = useMemo(() => allSteps(), []);
  const [idx, setIdx] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [voice, setVoice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ready, setReady] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const active = useRef<Narration | null>(null);

  useEffect(() => {
    setSeen(loadSeen());
    try {
      setVoice(localStorage.getItem(VOICE_KEY) === "1");
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

  // Speak on arrival, but only once voice has been asked for.
  useEffect(() => {
    if (!ready || !voice || !step) return;
    play(step);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, voice, ready]);

  // Never leave a voice talking to an empty room.
  useEffect(() => stop, [stop]);

  const go = useCallback(
    (n: number) => {
      stop();
      setIdx(Math.max(0, Math.min(steps.length - 1, n)));
    },
    [steps.length, stop],
  );

  if (!ready || !step) return null;

  const pct = Math.round(((idx + 1) / steps.length) * 100);
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

        {step.body.map((p, i) => (
          <p key={i} className="text-sm mb-2.5 leading-relaxed" style={{ color: "var(--brand-text-secondary)" }}>
            {p}
          </p>
        ))}

        <div className="flex flex-wrap gap-2 mt-4">
          {step.route ? (
            <Link
              href={step.route}
              target="_blank"
              className="text-sm px-3 py-2 rounded-lg font-semibold"
              style={{ background: "var(--brand-accent)", color: "#fff" }}
            >
              {step.routeLabel || "Open this screen"} ↗
            </Link>
          ) : null}

          {speechSupported() ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const next = !voice;
                  setVoice(next);
                  try { localStorage.setItem(VOICE_KEY, next ? "1" : "0"); } catch { /* fine */ }
                  if (next) play(step); else stop();
                }}
                className="text-sm px-3 py-2 rounded-lg font-semibold"
                style={{ background: "var(--brand-surface-2)", color: "var(--brand-text)" }}
              >
                {voice ? "Voice on" : "Voice off"}
              </button>
              {voice ? (
                <button
                  type="button"
                  onClick={() => (speaking ? stop() : play(step))}
                  className="text-sm px-3 py-2 rounded-lg font-semibold"
                  style={{ background: "var(--brand-surface-2)", color: "var(--brand-text-secondary)" }}
                >
                  {speaking ? "Stop" : "Read it again"}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
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
