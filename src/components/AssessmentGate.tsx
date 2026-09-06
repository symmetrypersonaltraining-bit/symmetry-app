"use client";

// ASSESS THEM BEFORE YOU TRAIN THEM.
//
// Dustin, 5 Sep 2026: "lets get assessment done fir all. next time I open a
// session fir them, full screen takeover to do assessment before their
// session."
//
// Half the roster has no assessment on file. That was invisible until the coach
// started reading assessments — and a coach that has to say "I don't have your
// assessment" to fourteen people is a coach that looks broken to half the
// clients who try it. The fix is not more prompting; it is the assessments.
//
// ⛔ IT IS NOT A BLOCK. He was offered a hard block and chose "Not now, and ask
// again next session." He is standing in a gym with ninety seconds before a
// client walks in, and an app that will not let him start is an app he stops
// opening. So: one tap past it, and it comes back next time.
//
// Dismissal is per client per session DATE, in localStorage. Not the database:
// this is "I have seen this today", which is worth nothing to anyone but him
// and costs a migration to store properly. Keyed on the date so re-opening the
// same session does not nag twice, while the next session asks again — which is
// exactly what he asked for.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AssessmentGate({
  clientId,
  clientName,
  sessionDate,
}: {
  clientId: string;
  clientName: string;
  sessionDate: string;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const key = `sym_assess_gate:${clientId}:${sessionDate}`;

  // Mounted-only, because localStorage does not exist on the server and a gate
  // that renders on the server would flash for everybody before disappearing.
  useEffect(() => {
    let seen = false;
    try { seen = !!window.localStorage.getItem(key); } catch { /* private mode */ }
    if (!seen) setShow(true);
  }, [key]);

  if (!show) return null;

  const first = (clientName || "").trim().split(" ")[0] || "This client";

  function notNow() {
    try { window.localStorage.setItem(key, "1"); } catch { /* fine, it asks again */ }
    setShow(false);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "var(--brand-bg)",
        display: "flex", flexDirection: "column",
        padding: 20, overflowY: "auto",
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 460, width: "100%", margin: "0 auto" }}>
        {/* The tile, same as everywhere else — see docs/audit/APP-FORMAT.md. */}
        <div style={{
          background: "var(--brand-surface)",
          border: "1px solid var(--brand-border)",
          borderRadius: 18, padding: 18,
          boxShadow: "0 8px 26px rgba(20,30,55,0.10)",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 3,
            background: "var(--card-topbar, var(--brand-primary))",
          }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--brand-text-secondary)", marginTop: 4 }}>
            Before this session
          </div>
          <div style={{ fontSize: 21, fontWeight: 800, color: "var(--brand-text)", marginTop: 6, lineHeight: 1.25 }}>
            {first} has no assessment on file
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--brand-text-secondary)", marginTop: 10 }}>
            Their movement screen, what hurts, and what to work around. It takes a few
            minutes, most of it is already filled in from what you have on them, and
            every text box can be dictated.
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--brand-text-secondary)", marginTop: 8 }}>
            Until it exists, their coach has to tell them it cannot see anything about
            their body — so it will not guess.
          </div>

          <button
            type="button"
            onClick={() => router.push(`/assessment?clientId=${clientId}`)}
            style={{
              width: "100%", marginTop: 16, padding: "14px 16px",
              borderRadius: 14, border: "none", cursor: "pointer",
              background: "var(--brand-primary)", color: "var(--brand-surface)",
              fontWeight: 800, fontSize: 15,
            }}
          >
            Do {first}&apos;s assessment
          </button>
          <button
            type="button"
            onClick={notNow}
            style={{
              width: "100%", marginTop: 8, padding: "12px 16px",
              borderRadius: 14, cursor: "pointer",
              background: "transparent", border: "1px solid var(--brand-border)",
              color: "var(--brand-text-secondary)", fontWeight: 700, fontSize: 14,
            }}
          >
            Not now — start the session
          </button>
          <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginTop: 10, textAlign: "center", opacity: 0.8 }}>
            It will ask again next session.
          </div>
        </div>
      </div>
    </div>
  );
}
