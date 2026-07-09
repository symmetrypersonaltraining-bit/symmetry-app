"use client";
import { useEffect } from "react";

/**
 * WakeLock — keeps the phone screen awake while `active` is true (used during a
 * logging session so the screen doesn't sleep mid-workout). Uses the Screen
 * Wake Lock API; feature-detects and no-ops where unsupported. Wake locks are
 * auto-released by the browser when the tab is hidden, so we re-acquire on
 * visibilitychange. Releases on unmount or when `active` flips false. Renders
 * nothing — fully isolated/additive, cannot affect logging.
 */
export default function WakeLock({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: any = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        lock = await (navigator as any).wakeLock.request("screen");
      } catch {
        /* permission denied / not visible — safe no-op */
      }
    };
    const onVisibility = () => {
      if (!cancelled && document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        if (lock) lock.release();
      } catch {
        /* already released */
      }
      lock = null;
    };
  }, [active]);

  return null;
}
