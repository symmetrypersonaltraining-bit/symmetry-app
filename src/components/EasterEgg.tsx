"use client";

import { useEffect, useState } from "react";
import { fx } from "@/lib/fx";

/**
 * EasterEgg — tap any Symmetry logo 7 times. 2026-07-25.
 *
 * Pure delight, zero consequence. Delegated listener, local state only, and it
 * cannot fire accidentally (7 taps inside 3 seconds on the logo specifically).
 * Honours reduced-motion by skipping the animation but still showing the card.
 *
 * Revert = remove <EasterEgg /> from layout.tsx.
 */
const LINES = [
  "You found it. Nothing here but respect.",
  "Seven taps. That's more reps than some people do.",
  "This does absolutely nothing. Enjoy.",
  "Certified Logo Toucher. No prize.",
  "Achievement unlocked: Curiosity.",
];

export default function EasterEgg() {
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    let count = 0;
    let first = 0;

    const onClick = (e: MouseEvent) => {
      try {
        const t = e.target as HTMLElement | null;
        if (!t) return;
        // Only the brand mark opts in via [data-egg]; falls back to alt/aria text.
        const hit = t.closest('[data-egg], img[alt*="Symmetry" i], [aria-label*="Symmetry" i]');
        if (!hit) return;

        const now = Date.now();
        if (!first || now - first > 3000) {
          first = now;
          count = 0;
        }
        count++;
        if (count >= 7) {
          count = 0;
          first = 0;
          setShown(LINES[Math.floor(Math.random() * LINES.length)]);
          fx("pr");
          window.setTimeout(() => setShown(null), 3200);
        }
      } catch {
        /* an easter egg must never break a real tap */
      }
    };

    document.addEventListener("click", onClick, { passive: true });
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (!shown) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 96,
        transform: "translateX(-50%)",
        zIndex: 2000,
        background: "var(--grad-cta, var(--brand-primary))",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 26,
        fontSize: 13.5,
        fontWeight: 700,
        maxWidth: "86vw",
        textAlign: "center",
        boxShadow: "var(--shadow-3, 0 12px 32px rgba(0,0,0,.3))",
      }}
      className="cw-pop"
    >
      🥚 {shown}
    </div>
  );
}
