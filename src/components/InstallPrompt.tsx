"use client";

// Registers the service worker, and offers the app for install where the
// platform allows it.
//
// Two different worlds:
//   ANDROID / desktop Chrome — fires `beforeinstallprompt`, which we capture and
//     replay when the client taps our own button. One tap, native dialog, done.
//     No APK, no "install unknown apps", no Play Protect warning.
//   iPhone — Safari has no install API. The only route is Share → Add to Home
//     Screen, so all we can do is say so, at the moment it is useful, with the
//     right words for the actual button on their screen.
//
// Shows nothing at all if the app is already installed, or on a desktop that
// isn't going to install it, or once someone has dismissed it. A prompt that
// reappears forever is how people learn to ignore the app.

import { useEffect, useState } from "react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "symmetry_install_dismissed";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own flag, which predates the standard and is still the only
    // way to tell on an iPhone.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}

export default function InstallPrompt({ inline = false }: { inline?: boolean }) {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // The service worker is what makes the Android install prompt possible at
    // all. Registered here rather than in the layout so there is one place that
    // owns "installability".
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* install prompt is a bonus, not a feature */ });
    }

    if (isStandalone()) return;              // already installed
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* private mode */ }
    if (dismissed && !inline) return;

    const onBip = (e: Event) => {
      e.preventDefault();                     // stop Chrome's own mini-infobar
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    if (isIos()) { setIos(true); setShow(true); }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [inline]);

  if (!show) return null;

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setShow(false);
    } catch { /* the browser decided not to; nothing to do */ }
    setDeferred(null);
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* noop */ }
    setShow(false);
  }

  const box: React.CSSProperties = inline
    ? { background: "var(--brand-surface)", border: "1px solid var(--brand-primary)", borderRadius: 14, padding: 14 }
    : {
        position: "fixed", left: 12, right: 12, bottom: 78, zIndex: 9500,
        background: "var(--brand-surface)", border: "1px solid var(--brand-primary)",
        borderRadius: 16, padding: 14, boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
      };

  return (
    <div style={box}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" style={{ width: 40, height: 40, borderRadius: 10, flex: "0 0 auto" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>
            {ios ? "Add Symmetry to your home screen" : "Install Symmetry"}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)", lineHeight: 1.45, marginTop: 3 }}>
            {ios ? (
              <>
                Tap the <b>Share</b> button at the bottom of Safari (the square with an arrow),
                then <b>Add to Home Screen</b>. It opens full screen, like an app.
              </>
            ) : (
              <>Get an icon on your home screen. Opens full screen, no browser bar.</>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {!ios && (
          <button onClick={install}
            style={{ flex: 1, padding: 11, borderRadius: 12, border: "none", background: "var(--brand-primary)", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}>
            Install
          </button>
        )}
        {!inline && (
          <button onClick={dismiss}
            style={{ flex: ios ? 1 : "0 0 auto", padding: "11px 14px", borderRadius: 12, border: "1px solid var(--brand-border)", background: "transparent", color: "var(--brand-text-secondary)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {ios ? "Got it" : "Not now"}
          </button>
        )}
      </div>
    </div>
  );
}
