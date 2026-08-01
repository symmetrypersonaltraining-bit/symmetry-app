"use client";

import { useEffect } from "react";

/**
 * BackButtonGuard v3 — Android shell only. Hardware Back must not exit the app
 * from the first screen, and must otherwise behave completely normally.
 *
 * WHY v2 KILLED THE BACK BUTTON (fixed 2026-08-01)
 *
 * v2 kept a "floor" index and re-armed a sentinel history entry whenever Back
 * landed at or below it:
 *
 *     if (!st || st.__symBack || st.__symIdx == null || st.__symIdx <= floorIdx)
 *       setTimeout(arm, 0);
 *
 * Two things in that line make Back stop working, and together they make it
 * stop working permanently.
 *
 * 1. `arm()` set `floorIdx = counter` AFTER pushing, so every re-arm raised the
 *    floor. Pushing also truncates forward history, so the next Back landed on
 *    the sentinel again, re-armed again, and raised the floor again. The floor
 *    ratcheted upward until it was above every real page entry — at which point
 *    `st.__symIdx <= floorIdx` matched EVERYTHING and every Back press became a
 *    no-op. Nothing recovers from that except a fresh page load, and the next
 *    few Back presses put it straight back.
 *
 * 2. `!st` and `__symIdx == null` matched any entry the patched pushState had
 *    not stamped — including the very first entry of a cold load, before Next
 *    attaches its own state. So Back could be dead from the first press.
 *
 * v3 keeps one sentinel, pushed once, and re-arms ONLY when Back actually lands
 * on that sentinel — which is exactly the "you are at the bottom, do not exit"
 * case it was always meant to catch. There is no counter and no floor, so there
 * is nothing to ratchet. Every other Back press is left completely alone.
 *
 * replaceState is still patched, and only to carry the __symBack marker
 * forward: Next.js rewrites the state of the CURRENT entry during navigation,
 * which would otherwise erase the sentinel the moment it is armed. pushState is
 * no longer touched at all.
 *
 * Failure mode if this is wrong: Back exits the app from the first screen, the
 * Android default. That is a far better place to fail than Back doing nothing.
 *
 * No-ops in normal browsers. Renders nothing. Everything wrapped.
 */

// Module scope, not component state: React can mount this twice (Strict Mode,
// a remount on a layout change) and two sentinels would put a dead entry in the
// middle of the stack rather than under it.
let armed = false;

export default function BackButtonGuard() {
  useEffect(() => {
    try {
      const w = window as unknown as {
        Capacitor?: {
          isNativePlatform?: () => boolean;
          Plugins?: { App?: { addListener?: (ev: string, cb: () => void) => { remove?: () => void } } };
        };
      };
      const cap = w.Capacitor;
      const isShell =
        (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) ||
        /; wv\)/.test(navigator.userAgent);
      if (!isShell) return;

      // Native listener. Registering one suppresses Capacitor's default
      // finish-the-activity behaviour, so Back goes through the WebView history
      // like it does in a browser.
      let removeNative: (() => void) | null = null;
      try {
        const AppPlugin = cap && cap.Plugins && cap.Plugins.App;
        if (AppPlugin && typeof AppPlugin.addListener === "function") {
          const h = AppPlugin.addListener("backButton", () => {
            try {
              history.back();
            } catch {
              /* noop */
            }
          });
          removeNative = () => {
            try {
              if (h && typeof h.remove === "function") h.remove();
            } catch {
              /* noop */
            }
          };
        }
      } catch {
        /* noop */
      }

      // Carry the sentinel marker through Next's own state rewrites. Nothing
      // else about history is patched.
      const origReplace = history.replaceState.bind(history);
      type AnyState = Record<string, unknown> | null | undefined;
      (history as History).replaceState = function (st: AnyState, title: string, url?: string | URL | null) {
        try {
          const cur = (history.state || {}) as Record<string, unknown>;
          if (cur.__symBack) st = { ...(st || {}), __symBack: true };
        } catch {
          /* noop */
        }
        return origReplace(st, title, url as string | URL | null | undefined);
      } as History["replaceState"];

      const arm = () => {
        try {
          history.pushState({ ...(history.state || {}), __symBack: true }, "");
        } catch {
          /* noop */
        }
      };

      if (!armed) {
        armed = true;
        arm();
      }

      const onPop = (e: PopStateEvent) => {
        try {
          const st = e.state as { __symBack?: boolean } | null;
          // ONLY the sentinel. Anything else is a real history entry and Back
          // is none of our business.
          if (st && st.__symBack) setTimeout(arm, 0);
        } catch {
          /* noop */
        }
      };
      window.addEventListener("popstate", onPop);

      return () => {
        window.removeEventListener("popstate", onPop);
        if (removeNative) removeNative();
        try {
          (history as History).replaceState = origReplace;
        } catch {
          /* noop */
        }
      };
    } catch {
      /* noop */
    }
  }, []);
  return null;
}
