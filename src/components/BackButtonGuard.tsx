"use client";

import { useEffect } from "react";

/**
 * BackButtonGuard v2 — Android-shell only. Hardware Back must never exit the
 * app. Two layers:
 * 1. If the Capacitor App plugin bridge is available, register a backButton
 *    listener (registering one stops Capacitor's default finish-on-back) and
 *    drive history.back() ourselves.
 * 2. A history "floor": a flagged buffer entry near the bottom of the WebView
 *    history that re-arms whenever Back lands on or below it. pushState /
 *    replaceState are patched (shell only) so Next.js state rewrites cannot
 *    strip our markers — the v1 failure mode.
 * No-ops in normal browsers. Crash-safe: everything wrapped, renders nothing.
 */
export default function BackButtonGuard() {
  useEffect(() => {
    try {
      const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { App?: { addListener?: (ev: string, cb: () => void) => { remove?: () => void } } } } };
      const cap = w.Capacitor;
      const isShell = (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) || /; wv\)/.test(navigator.userAgent);
      if (!isShell) return;

      // Layer 1: native back-button listener (bulletproof when the bridge has the App plugin).
      let removeNative: (() => void) | null = null;
      try {
        const AppPlugin = cap && cap.Plugins && cap.Plugins.App;
        if (AppPlugin && typeof AppPlugin.addListener === "function") {
          const h = AppPlugin.addListener("backButton", () => {
            try { history.back(); } catch { /* noop */ }
          });
          removeNative = () => { try { if (h && typeof h.remove === "function") h.remove(); } catch { /* noop */ } };
        }
      } catch { /* noop */ }

      // Layer 2: history floor with tamper-proof markers.
      let counter = 0;
      let floorIdx = 0;
      const origPush = history.pushState.bind(history);
      const origReplace = history.replaceState.bind(history);
      type AnyState = Record<string, unknown> | null | undefined;
      (history as History).pushState = function (st: AnyState, title: string, url?: string | URL | null) {
        try { st = { ...(st || {}), __symIdx: ++counter }; } catch { /* noop */ }
        return origPush(st, title, url as string | URL | null | undefined);
      } as History["pushState"];
      (history as History).replaceState = function (st: AnyState, title: string, url?: string | URL | null) {
        try {
          const cur = (history.state || {}) as Record<string, unknown>;
          st = { ...(st || {}), ...(cur.__symBack ? { __symBack: true } : {}), ...(cur.__symIdx != null ? { __symIdx: cur.__symIdx } : {}) };
        } catch { /* noop */ }
        return origReplace(st, title, url as string | URL | null | undefined);
      } as History["replaceState"];

      const arm = () => {
        try {
          history.pushState({ ...(history.state || {}), __symBack: true }, "");
          floorIdx = counter; // stamped by the patched pushState above
        } catch { /* noop */ }
      };
      arm();
      const onPop = (e: PopStateEvent) => {
        try {
          const st = e.state as { __symBack?: boolean; __symIdx?: number } | null;
          // Landed on a floor entry, an unstamped (pre-guard) entry, or at/below
          // the floor → re-arm so the next Back still stays inside the app.
          if (!st || st.__symBack || st.__symIdx == null || st.__symIdx <= floorIdx) setTimeout(arm, 0);
        } catch { /* noop */ }
      };
      window.addEventListener("popstate", onPop);
      return () => {
        window.removeEventListener("popstate", onPop);
        if (removeNative) removeNative();
        try { (history as History).pushState = origPush; (history as History).replaceState = origReplace; } catch { /* noop */ }
      };
    } catch { /* noop */ }
  }, []);
  return null;
}
