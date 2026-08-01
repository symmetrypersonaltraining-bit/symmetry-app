"use client";

import { useEffect } from "react";

/**
 * BackButtonGuard v4 — Android shell only. Renders nothing.
 *
 * Dustin's rule, stated plainly: "Back needs to go to the previous screen from
 * every single screen in the app."
 *
 * THE SENTINEL IS GONE. v2 and v3 both kept a flagged buffer entry in the
 * history so Back could not exit the app from the first screen. That entry has
 * the SAME URL as the page it was pushed on (pushState with no url keeps the
 * current one), so popping onto it re-renders the identical screen and reads as
 * "Back did nothing". One dead press, on whatever page the app happened to load
 * on — and because a reload re-arms it (AddWorkoutButton, PullToRefresh and
 * VersionWatcher all reload), the dead presses accumulated. That is exactly the
 * "works on some screens, not others" report.
 *
 * v2 additionally ratcheted a floor index until EVERY press was dead. See the
 * v3 comment in git history for that one.
 *
 * What is left is the only part that was ever load-bearing: registering a
 * Capacitor backButton listener, which suppresses the platform's default
 * finish-the-activity, and then driving history ourselves. The plugin tells us
 * whether there is anywhere to go; if there is not, we go Home rather than
 * killing the app mid-workout. No history is invented, so no press can ever
 * land on an entry that is not a real screen.
 *
 * Without the Capacitor bridge this does nothing at all, and the WebView's own
 * Back is already correct on every screen.
 *
 * Failure mode if the listener never registers: Back exits the app from the
 * first screen, the Android default. Recoverable by reopening, and far better
 * than Back doing nothing.
 */
export default function BackButtonGuard() {
  useEffect(() => {
    try {
      const w = window as unknown as {
        Capacitor?: {
          isNativePlatform?: () => boolean;
          Plugins?: {
            App?: {
              addListener?: (
                ev: string,
                cb: (ev: { canGoBack?: boolean }) => void,
              ) => { remove?: () => void };
            };
          };
        };
      };
      const cap = w.Capacitor;
      const isShell =
        (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) ||
        /; wv\)/.test(navigator.userAgent);
      if (!isShell) return;

      const AppPlugin = cap && cap.Plugins && cap.Plugins.App;
      if (!AppPlugin || typeof AppPlugin.addListener !== "function") return;

      const handle = AppPlugin.addListener("backButton", (ev) => {
        try {
          // canGoBack comes from the WebView's own history, so it is right even
          // when our router pushed the entry. Falling back to history.length
          // covers a plugin build that omits it.
          const canGoBack = ev && typeof ev.canGoBack === "boolean" ? ev.canGoBack : window.history.length > 1;
          if (canGoBack) {
            window.history.back();
          } else {
            // Bottom of the stack. Going Home beats closing the app out from
            // under someone who is mid-session.
            window.location.href = "/home";
          }
        } catch {
          /* noop */
        }
      });

      return () => {
        try {
          if (handle && typeof handle.remove === "function") handle.remove();
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
