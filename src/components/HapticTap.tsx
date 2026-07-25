"use client";
import { useEffect } from "react";
import { fx, hapticsEnabled } from "@/lib/fx";

/**
 * Global tap haptic. As of 2026-07-25 this is the BASELINE tap only — the
 * lightest pattern in the vocabulary. Meaningful moments (logging a set, a PR,
 * completing a workout, a failed save) call fx() directly with their own
 * pattern, so they no longer feel identical to an ordinary button press.
 * Respects the user's haptics setting; see lib/fx.ts.
 */
export default function HapticTap() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (!hapticsEnabled()) return;
      // Elements that fire their own richer pattern opt out of the baseline tap.
      if (t.closest("[data-fx-own]")) return;
      if (t.closest('button, [role="button"], a, [data-haptic], input[type="checkbox"], label')) {
        fx("tap");
      }
    };
    document.addEventListener("click", onClick, { passive: true } as any);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    const onShow = (e: any) => { if (e && e.persisted) { try { location.reload(); } catch {} } };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  return null;
}
