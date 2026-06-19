"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaInstallBanner() {
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Don't show if already running as PWA (standalone mode)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // Don't show if user previously dismissed
    const dismissed = localStorage.getItem("pwa_banner_dismissed");
    if (dismissed) return;

    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    setIsIos(ios);

    if (ios) {
      setShow(true);
      return;
    }

    // Listen for Chrome/Android install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function handleDismiss() {
    localStorage.setItem("pwa_banner_dismissed", "1");
    setShow(false);
  }

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShow(false);
      }
    }
  }

  if (!show) return null;

  return (
    <div
      className="mx-4 mb-4 rounded-xl p-4 flex items-start gap-3"
      style={{ background: "var(--brand-card)", border: "1px solid var(--brand-border)" }}
    >
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--brand-primary)" }}
      >
        <i className="ti ti-device-mobile text-white text-lg" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
          Add to Home Screen
        </p>
        {isIos ? (
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--brand-text-secondary)" }}>
            Tap <strong>Share</strong> <span className="text-base">⎙</span> then{" "}
            <strong>"Add to Home Screen"</strong> for the full app experience.
          </p>
        ) : (
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--brand-text-secondary)" }}>
            Install the app for faster access and offline support.
          </p>
        )}
        {!isIos && deferredPrompt && (
          <button
            onClick={handleInstall}
            className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: "var(--brand-primary)", color: "white" }}
          >
            Install App
          </button>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 text-lg leading-none"
        style={{ color: "var(--brand-text-secondary)" }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
