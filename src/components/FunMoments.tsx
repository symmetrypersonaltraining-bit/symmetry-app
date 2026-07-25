"use client";

import { useEffect, useState } from "react";
import { emptyState, loadingLine, REST_DAY } from "@/lib/fun";
import { fx } from "@/lib/fx";
import ShareToGroup from "@/components/ShareToGroup";

/**
 * FunMoments — small personality pieces. 2026-07-25.
 *
 * Three independent, drop-in components. Each is presentational, holds only
 * local state, and can be mounted or removed with one line. None of them fetch
 * or mutate anything.
 *
 *   <FunLoader />               loading line instead of a bare spinner
 *   <EmptyStateCard k="meals"/> empty states with a voice
 *   <RestDaySlip />             the rest-day permission slip, shareable
 */

export function FunLoader({ label }: { label?: string }) {
  // Rotates every 2.4s so a slow load doesn't sit on one joke.
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => n + 1), 2400);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "34px 16px" }}>
      <div
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          border: "3px solid var(--brand-border)",
          borderTopColor: "var(--brand-primary)",
          animation: "cw-spin .85s linear infinite",
        }}
      />
      <div style={{ fontSize: 13, color: "var(--brand-text-secondary)" }}>{label || loadingLine(i)}</div>
      <style>{"@keyframes cw-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){[style*='cw-spin']{animation:none!important}}"}</style>
    </div>
  );
}

export function EmptyStateCard({ k, action }: { k: string; action?: React.ReactNode }) {
  const s = emptyState(k);
  return (
    <div
      style={{
        textAlign: "center",
        padding: "30px 22px",
        background: "var(--brand-surface)",
        border: "1px solid var(--brand-border)",
        borderRadius: 18,
      }}
    >
      <div className="cw-float" style={{ fontSize: 30, marginBottom: 8 }} aria-hidden>
        🗒️
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--brand-text)" }}>{s.title}</div>
      <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)", marginTop: 5, lineHeight: 1.6, maxWidth: 300, marginInline: "auto" }}>
        {s.body}
      </div>
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

/**
 * Rest-day permission slip. Makes a rest day feel prescribed rather than
 * skipped — and shareable, because "I'm taking my rest day" is exactly the
 * kind of thing that normalises recovery in a group.
 */
export function RestDaySlip({ firstName }: { firstName?: string | null }) {
  const [stamped, setStamped] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setStamped(true);
      fx("section");
    }, 420);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div
      style={{
        background: "#fdfaf3",
        border: "1px solid #e8e0cc",
        borderRadius: 10,
        padding: "20px 18px",
        fontFamily: "Georgia, serif",
        color: "#3b3629",
        position: "relative",
        overflow: "hidden",
        boxShadow: "var(--shadow-2, 0 8px 26px rgba(20,30,55,.08))",
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: 3, color: "#9a8f74" }}>SYMMETRY PERSONAL TRAINING</div>
      <div style={{ fontSize: 21, fontWeight: 900, margin: "8px 0 10px" }}>{REST_DAY.title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.75 }}>
        {firstName ? `${firstName}, ` : ""}
        {REST_DAY.body}
      </div>
      <div style={{ fontSize: 11.5, marginTop: 14, fontStyle: "italic", color: "#7a705a" }}>{REST_DAY.signed}</div>
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 14,
          right: 12,
          border: "3px solid #2f7d4f",
          color: "#2f7d4f",
          fontWeight: 900,
          fontSize: 10,
          padding: "4px 8px",
          borderRadius: 6,
          letterSpacing: 1,
          transform: stamped ? "rotate(11deg) scale(1)" : "rotate(11deg) scale(2.6)",
          opacity: stamped ? 0.92 : 0,
          transition: "transform .4s cubic-bezier(.34,1.56,.64,1), opacity .3s",
        }}
      >
        APPROVED
      </div>
      <div style={{ marginTop: 16 }}>
        <ShareToGroup
          text="🛌 Taking my official rest day. Recovery is part of the programme."
          label="Tell the group"
          style={{ padding: "9px 18px", fontSize: 13 }}
        />
      </div>
    </div>
  );
}
