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

  // REMOVED 2026-08-01 — this was half of why hardware Back stopped working.
  //
  //   const onShow = (e) => { if (e.persisted) location.reload(); };
  //   window.addEventListener("pageshow", onShow);
  //
  // `pageshow` with persisted = true is the bfcache restore, which is exactly
  // what a Back press produces. Reloading there means every Back press throws
  // away the restored page and re-runs the whole app — so Back looks like it
  // did nothing, and worse, BackButtonGuard remounts into a fresh JS context
  // and arms another sentinel history entry. Each Back press therefore left the
  // user one entry deeper than before. Back could never win.
  //
  // Whatever staleness this was guarding against, the fix is not to defeat the
  // browser's own back navigation. VersionWatcher already handles "the deploy
  // moved under you", and the notification feed refetches on visibilitychange.
  return null;
}
