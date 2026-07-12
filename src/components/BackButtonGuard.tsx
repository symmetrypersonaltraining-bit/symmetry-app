"use client";

import { useEffect } from "react";

/**
 * BackButtonGuard — Android-shell only. Keeps one buffer entry at the bottom of
 * the WebView history so the hardware Back button NEVER exits the app: when the
 * user backs into the buffer (app entry point), we re-arm it, so Back simply
 * stops at the first screen. Normal in-app back navigation is untouched because
 * we only re-arm when the popped-into entry carries our flag. No-ops entirely
 * in regular browsers. Crash-safe: everything wrapped, renders nothing.
 */
export default function BackButtonGuard() {
  useEffect(() => {
    try {
      const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      const isShell = (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) || /; wv\)/.test(navigator.userAgent);
      if (!isShell) return;
      const arm = () => {
        try { history.pushState({ ...(history.state || {}), __symBack: true }, ""); } catch { /* noop */ }
      };
      arm();
      const onPop = (e: PopStateEvent) => {
        if (e.state && (e.state as { __symBack?: boolean }).__symBack) setTimeout(arm, 0);
      };
      window.addEventListener("popstate", onPop);
      return () => window.removeEventListener("popstate", onPop);
    } catch { /* noop */ }
  }, []);
  return null;
}
