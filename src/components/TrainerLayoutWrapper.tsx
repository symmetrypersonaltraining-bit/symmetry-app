"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import TrainerSidebar from "./TrainerSidebar";
import AIAssistant from "./AIAssistant";
import Logo from "./Logo";
import HeaderAssist from "./HeaderAssist";
import SessionDock from "./SessionDock";
import AppBottomNav, { type NavItem } from "./AppBottomNav";

interface Props {
  children: React.ReactNode;
}

// Client-mode bottom nav tabs — SAME tabs/order/icons as the real client
// BottomNav (rendered by the shared AppBottomNav). Hrefs carry ?as=client so
// the SERVER deterministically renders the client branch on first render even
// if the client-mode cookie hasn't propagated yet (fixes the intermittent
// trainer-UI leak). /progress uses its client-preview route (real /progress
// still shows the trainer selector).
const CLIENT_NAV: NavItem[] = [
  { href: "/home?as=client",           label: "Home",     icon: "ti-home",          activeMatch: "/home" },
  { href: "/workout?as=client",        label: "Workout",  icon: "ti-barbell",       activeMatch: "/workout" },
  { href: "/nutrition?as=client",      label: "Nutrition", icon: "ti-salad",        activeMatch: "/nutrition" },
  { href: "/client-preview/progress",  label: "Progress", icon: "ti-chart-line",    activeMatch: "/client-preview/progress" },
  { href: "/messages?as=client",       label: "Messages", icon: "ti-message-circle", badge: "messages", activeMatch: "/messages" },
  { href: "/settings?as=client",       label: "Settings", icon: "ti-settings",      activeMatch: "/settings" },
];

const CLIENT_MODE_COOKIE_MAXAGE = 60 * 60 * 24 * 30; // 30 days

export default function TrainerLayoutWrapper({ children }: Props) {
  const [clientMode, setClientMode] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("symmetry_view_mode");
    if (stored === "client") {
      setClientMode(true);
      // RE-ASSERT the cookie on mount. Client mode was persisted in
      // localStorage but the cookie could have expired — when that happens the
      // layout still shows client mode while SERVER pages (/messages, /home…)
      // read no cookie and render the TRAINER branch (e.g. the full client
      // inbox leaks into Client View). Keeping the cookie fresh (30 days) makes
      // every server page reliably see client mode.
      try { document.cookie = "symmetry_client_mode=1; path=/; max-age=" + CLIENT_MODE_COOKIE_MAXAGE; } catch { /* noop */ }
    }
  }, []);

  // Keep the cookie fresh while client mode is active (covers long sessions /
  // SPA navigation without a full remount).
  useEffect(() => {
    if (!clientMode) return;
    try { document.cookie = "symmetry_client_mode=1; path=/; max-age=" + CLIENT_MODE_COOKIE_MAXAGE; } catch { /* noop */ }
  }, [clientMode]);

  function handleToggleMode() {
    const next = !clientMode;
    setClientMode(next);
    localStorage.setItem("symmetry_view_mode", next ? "client" : "trainer");
    if (next) {
      document["cookie"] = "symmetry_client_mode=1; path=/; max-age=" + CLIENT_MODE_COOKIE_MAXAGE;
    } else {
      document["cookie"] = "symmetry_client_mode=; path=/; max-age=0";
    }
    // Land on /home. Entering client view carries ?as=client so the first
    // server render is deterministically the client dashboard (belt-and-
    // suspenders with the cookie). router.refresh() invalidates the router
    // cache so a page prefetched in the OTHER mode can't be served stale.
    router.push(next ? "/home?as=client" : "/home");
    router.refresh();
  }

  // ── CLIENT MODE ───────────────────────────────────────────────────────────
  if (clientMode) {
    return (
      <div className="flex flex-col min-h-screen app-bg">

        {/* Top bar — mirrors what a client would see on mobile */}
        <div className="flex items-center gap-3 px-4 pb-3 sticky top-0 z-40 shadow-sm"
          style={{ background: "var(--brand-primary)", paddingTop: "calc(12px + env(safe-area-inset-top))" }}>
          <Logo size={28} color="white" className="flex-shrink-0" />
          <div className="flex-1">
            <span className="text-white font-semibold text-sm">Symmetry</span>
            <span className="text-white/50 text-xs ml-2">· My Training</span>
          </div>
          <HeaderAssist />
        <button
            onClick={handleToggleMode}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
            <i className="ti ti-layout-dashboard text-sm" />
            Trainer View
          </button>
        </div>

        {/* Page content.
            NO overflow-y-auto. This is a COLUMN flex container with
            min-h-screen, so `flex-1` resolves to flex-basis: 0 on the HEIGHT —
            the div gets exactly the leftover viewport and `overflow-y: auto`
            turned it into a real nested scroller. Nested scrollers in a WebView
            lose the native fast path: no momentum (nothing set
            -webkit-overflow-scrolling here, unlike every sheet in the app), and
            no overscroll-behavior, so the gesture chains to the document
            scroller and visibly catches at both ends. That is the "very sticky"
            scrolling in the nutrition logger — Client View was the only place
            with this wrapper, which is why real clients on /nutrition never saw
            it. The document scrolls natively now, which also makes the sticky
            top bar above actually stick. */}
        <div className="flex-1 pb-20">
          {children}
        </div>

        <SessionDock />

        {/* Client bottom nav — the SAME shared component as the real client
            BottomNav (identical tabs/order/icons/active-state + Messages unread
            badge). Only the hrefs differ (client-preview routes for the pages
            that aren't yet client-mode-aware on their real route). */}
        <AppBottomNav items={CLIENT_NAV} />

      </div>
    );
  }

  // ── TRAINER MODE ───────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen app-bg">
      <TrainerSidebar
        clientMode={clientMode}
        onToggleClientMode={handleToggleMode}
        userName="Dustin Gautreaux"
        userInitials="DG"
      />
      <div className="flex-1 min-w-0 overflow-y-auto">
        {/* Spacer for the fixed mobile top bar. h-16, not h-14: the bar is
            12 + 36 + 12 tall, and the strip below it no longer occupies a row
            on mobile to absorb the difference. */}
        <div className="lg:hidden h-16" />
        {/* Desktop: an in-flow sticky row, so these buttons never cover content.
            Mobile: fixed into the blue header bar — see .trainer-top-strip. */}
        <div className="trainer-top-strip">
          <button onClick={handleToggleMode} aria-label="Switch to client view" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--brand-primary)", color: "white", border: "none", cursor: "pointer" }}><i className="ti ti-user text-sm" /><span className="hidden lg:inline">Client View</span></button>
          <HeaderAssist solid />
        </div>
        {children}
      </div>
      <SessionDock />
      <AIAssistant />
    </div>
  );
}
