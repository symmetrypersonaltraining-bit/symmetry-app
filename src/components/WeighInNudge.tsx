"use client";

// THE WEIGH-IN NUDGE.
//
// Dustin: "add a nudge to weigh in if it's been longer than 7 days."
//
// It exists because building the goals feature turned up the constraint the
// whole thing actually rests on: there are 95 weigh-ins in the entire database
// across 23 clients — about four each. Robert has four, Lauren five. Every
// honest projection needs data, so the thing that makes goals work is not chart
// code, it is the scale.
//
// Three rules it follows, all of them about not becoming wallpaper:
//
//   · it only appears past seven days, and never otherwise;
//   · it dismisses, and stays dismissed for the day;
//   · it logs INLINE — sending someone to Home to hunt for the weigh-in card
//     is how a nudge gets ignored twice and then permanently.
//
// It is deliberately NOT a takeover. The go-quiet screen is a takeover because
// somebody has stopped using the app entirely; this is for somebody who is
// standing in the app right now, which is the one moment a card is enough.

import { useState } from "react";
import { centralToday } from "@/lib/central-time";
import AiBadge from "@/components/AiBadge";
import { LOG_WEIGHT_EVENT } from "@/components/MetricCards";

const KEY = "sym:weighin-nudge-dismissed";

export default function WeighInNudge({
  daysSince,
  hasGoal,
}: {
  daysSince: number | null;
  hasGoal: boolean;
}) {
  // DISMISSED MEANS DISMISSED FOR THE DAY.
  //
  // Two faults in one line. sessionStorage is emptied when the app is closed,
  // so on a PWA — which is how every client runs this — dismissing it bought
  // you until the next time you opened the app, sometimes minutes. And
  // `toDateString()` is the DEVICE's day, not Central, so around midnight it
  // disagreed with every date the rest of the app was using.
  //
  // localStorage keyed by the Central date: gone for the rest of today however
  // many times the app is reopened, back tomorrow, which is what a nudge is.
  const [gone, setGone] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(KEY) === centralToday();
    } catch {
      return false;
    }
  });
  if (gone) return null;

  function dismiss() {
    setGone(true);
    try {
      localStorage.setItem(KEY, centralToday());
    } catch { /* dismissing for this render is enough */ }
  }

  const headline =
    daysSince == null
      ? "You haven't logged a weigh-in yet"
      : `It's been ${daysSince} days since your last weigh-in`;

  const body = hasGoal
    ? "Your goal line is only as good as the numbers behind it — one more keeps it honest."
    : "Once a week is all it takes, and it's what makes everything else on this screen mean something.";

  return (
    <div
      style={{
        background: "linear-gradient(135deg, color-mix(in srgb, #F59E0B 10%, var(--brand-surface)), var(--brand-surface))",
        border: "1px solid color-mix(in srgb, #F59E0B 35%, var(--brand-border))",
        borderRadius: 16, padding: 13, display: "flex", gap: 10, alignItems: "flex-start",
      }}
    >
      <AiBadge size={26} mood="plan" title="" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--brand-text)" }}>{headline}</div>
        <p style={{ margin: "3px 0 0", fontSize: 12, lineHeight: 1.55, color: "var(--brand-text-secondary)" }}>{body}</p>
        <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
          {/* WEIGH-IN, NOT BODY FAT.
              This went to /log-bodyfat, which asks for seven skinfold sites or
              a body-fat percentage and will not take a weight at all. Hassan
              tapped "Log it now" on a card counting the days since his last
              WEIGH-IN and was asked to measure his subscapular fold.
              It now opens the weight card on this page, which is what the
              header comment above always said this should do. */}
          <button
            onClick={() => {
              // NOT dismissed here. Opening the card is not logging a weight,
              // and a nudge that clears itself on the way to the form is a
              // nudge that vanishes for anyone who gets distracted between the
              // tap and the scale. It goes when the weigh-in lands.
              try { window.dispatchEvent(new CustomEvent(LOG_WEIGHT_EVENT)); } catch { /* no-op */ }
            }}
            style={{
              flex: 1, textAlign: "center", fontSize: 12, fontWeight: 800, padding: "10px 6px",
              borderRadius: 10, background: "var(--brand-primary)", color: "#fff", minHeight: 42,
              display: "grid", placeItems: "center", border: "none", cursor: "pointer",
            }}
          >
            Log it now
          </button>
          <button
            onClick={dismiss}
            style={{
              flex: 1, fontSize: 12, fontWeight: 800, padding: "10px 6px", borderRadius: 10,
              border: "1px solid var(--brand-border)", background: "var(--brand-surface)",
              color: "var(--brand-text)", minHeight: 42, cursor: "pointer",
            }}
          >
            Remind me tomorrow
          </button>
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ background: "none", border: "none", color: "var(--brand-text-secondary)", fontSize: 14, cursor: "pointer", padding: "0 3px" }}
      >
        ✕
      </button>
    </div>
  );
}
