"use client";

/**
 * The screen a client sees when they hit the day's AI limit.
 *
 * Dustin, 15 Aug: "send a screen take over to make them aware of limit and give
 * tips on how to save it fir where its needed and where they can dobit another
 * way without wasting it."
 *
 * ── What it replaces ──────────────────────────────────────────────────────
 *
 * One line in the chat: "You've maxed out Coach for today — I'll be back with
 * fresh answers tomorrow." Jennifer read that at 12:52, mid-workout, and simply
 * stopped using the coach. She had no idea a limit existed, no idea what she
 * had spent it on, and no idea that most of what she wanted next — her last
 * weights, her plan, logging a set — never needed the AI in the first place.
 *
 * ── Why a takeover and not a toast ────────────────────────────────────────
 *
 * A toast is for something you already understand. This is the first time the
 * client learns the limit exists, so it has to be read once, properly. It shows
 * ONCE per day per client (localStorage, keyed by the Chicago date) — after
 * that the chat line is enough, because by then they know.
 *
 * ── The tone rule ─────────────────────────────────────────────────────────
 *
 * Nothing here scolds. A client who hits the limit is a client who is USING the
 * thing, which is the outcome we want. It reads as "here is how it works and
 * here is what still works", never as "you used too much".
 */

import { useEffect, useState } from "react";
import AiBadge from "@/components/AiBadge";

import { useCoach } from "@/lib/useCoach";

/** Chicago date, so the reset the copy promises is the one the server uses. */
function chicagoToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const SEEN_KEY = "symmetry_ai_limit_seen";

/** True the first time today. Records the view, so it does not fire again. */
export function shouldShowTakeover(): boolean {
  try {
    const today = chicagoToday();
    if (localStorage.getItem(SEEN_KEY) === today) return false;
    localStorage.setItem(SEEN_KEY, today);
    return true;
  } catch {
    // Private mode, storage disabled. Showing it every time is worse than not
    // showing it, and the inline chat line still says what happened.
    return false;
  }
}

/**
 * Things that DO cost an AI call, and the cheaper way to get the same answer.
 *
 * Every "instead" here is a real screen that exists today. A tip that sends
 * somebody to a feature we have not built is worse than no tip.
 */
const TIPS: { spend: string; instead: string }[] = [
  {
    spend: "Asking the coach what weight to use",
    instead:
      "Your last weight for every movement is already on the logger, under the movement name. It is the same number the coach would read out.",
  },
  {
    spend: "Asking what is on today",
    instead: "Today's session and your meal plan are on the home screen — no question needed.",
  },
  {
    spend: "Asking the coach to log something",
    instead:
      "Tap the meal or the set and log it directly. Logging never uses AI, and it never runs out.",
  },
  {
    spend: "Photographing a meal you eat often",
    instead:
      "Save it to My Meals the first time. After that it is one tap, and the photo reader is not involved.",
  },
  {
    spend: "Re-asking the same question a different way",
    instead:
      "Scroll up — the earlier answer is still in the thread, and re-reading it is free.",
  },
];

export default function AiLimitTakeover({
  open,
  onClose,
  limit,
}: {
  open: boolean;
  onClose: () => void;
  /** The number the server enforced, so the copy can never disagree with it. */
  limit?: number | null;
}) {
  const { firstName: coachFirstName } = useCoach();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape closes it. A full-screen thing with no keyboard exit is a trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Daily AI limit"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "var(--brand-bg)",
        display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}
    >
      <div style={{ maxWidth: 520, width: "100%", margin: "0 auto", padding: "32px 20px 28px" }}>
        {/* The coach's own face, not a sparkle. This screen is the coach
            explaining why it has gone quiet, so it is the AI speaking, and
            every AI mark in the app goes through the face registry. */}
        <div style={{ marginBottom: 18 }}>
          <AiBadge size={56} mood="neutral" />
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2, color: "var(--brand-text)", margin: 0 }}>
          That is your AI for today
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--brand-text-secondary)", marginTop: 12 }}>
          The coach, the meal photo reader and the recipe builder share a daily
          allowance{limit ? ` of ${limit} each` : ""}. You have used yours — it
          resets overnight.
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--brand-text-secondary)", marginTop: 10 }}>
          <strong style={{ color: "var(--brand-text)" }}>
            Everything else in the app still works exactly as normal.
          </strong>{" "}
          Logging your sets, logging your meals, your plan, your weights, your
          progress — none of that uses AI, and none of it can run out.
        </p>

        <div style={{
          marginTop: 22, padding: "14px 16px", borderRadius: 14,
          background: "var(--brand-surface)", border: "1px solid var(--brand-border)",
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--brand-text)", margin: 0 }}>
            Nothing you logged is affected
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--brand-text-secondary)", marginTop: 6 }}>
            Every set and every meal you have entered today is saved and counted
            normally. This only pauses the parts that ask a model a question.
          </p>
        </div>

        <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase",
          color: "var(--brand-text-secondary)", marginTop: 28, marginBottom: 4 }}>
          Making it last tomorrow
        </h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--brand-text-secondary)", marginBottom: 14 }}>
          Most of what people ask the coach is already on screen. Save the coach
          for the things only it can do — how you are trending, what to change,
          why something feels off.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TIPS.map((t) => (
            <div key={t.spend} style={{
              padding: "12px 14px", borderRadius: 12,
              background: "var(--brand-surface)", border: "1px solid var(--brand-border)",
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--brand-text)", margin: 0,
                display: "flex", alignItems: "center", gap: 7 }}>
                <i className="ti ti-bolt" style={{ fontSize: 13, color: "var(--brand-primary)", flexShrink: 0 }} />
                {t.spend}
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--brand-text-secondary)", marginTop: 5 }}>
                {t.instead}
              </p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--brand-text-secondary)", marginTop: 22 }}>
          If you are regularly running out, tell {coachFirstName} — the limit
          is a setting, not a wall, and he can raise yours.
        </p>

        <button
          onClick={onClose}
          style={{
            marginTop: 22, width: "100%", padding: "14px 16px", borderRadius: 14,
            background: "var(--brand-primary)", color: "#fff",
            fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
