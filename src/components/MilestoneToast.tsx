"use client";

import { useEffect, useState } from "react";

/**
 * MilestoneToast — celebratory slide-in banner for real milestones
 * (visual-polish #8). Slides down from the top, auto-dismisses after ~3.6s.
 * Self-contained + fixed-position overlay; `once` guards it to one show per
 * session (keyed) so it doesn't re-fire on every navigation.
 */
export default function MilestoneToast({
  message,
  emoji = "🎉",
  once,
}: {
  message: string;
  emoji?: string;
  once?: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (once) {
      try {
        const key = "cw-milestone-" + once;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch {
        /* sessionStorage unavailable — fall through and show once this mount */
      }
    }
    setShow(true);
    const t = setTimeout(() => setShow(false), 3600);
    return () => clearTimeout(t);
  }, [once]);

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        top: show ? 16 : -96,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        transition: "top 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
        background: "var(--brand-text)",
        color: "#fff",
        borderRadius: 14,
        padding: "11px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: "nowrap",
        maxWidth: "90vw",
        pointerEvents: "none",
      }}
    >
      <span style={{ fontSize: 20 }}>{emoji}</span>
      {message}
    </div>
  );
}
