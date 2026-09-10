"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import TrainerSidebar from "./TrainerSidebar";
import Logo from "./Logo";
import HeaderAssist from "./HeaderAssist";
import ClientTopBar from "./ClientTopBar";
import SessionDock from "./SessionDock";
import AppBottomNav, { type NavItem } from "./AppBottomNav";
import RefreshHandle from "./RefreshHandle";
import GlobalCoach from "./GlobalCoach";
import { resolveClientMode, readClientModeInputs } from "@/lib/clientModeResolve";


interface Props {
  children: React.ReactNode;
  /** The cookie's answer, read by the server layout, so the first paint of the
   *  chrome agrees with the page it wraps. See lib/clientModeResolve.ts. */
  initialClientMode?: boolean;
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

export default function TrainerLayoutWrapper({ children, initialClientMode = false }: Props) {
  // Starts on the SERVER's answer, not on false-then-maybe-true. The old
  // useState(false) plus a localStorage effect meant the trainer chrome always
  // painted first and was then swapped; worse, it meant the chrome and the page
  // could settle on different answers for good.
  const [clientMode, setClientMode] = useState(initialClientMode);
  const router = useRouter();

  useEffect(() => {
    // RECONCILE ON MOUNT, FROM THE SAME INPUTS THE PAGES USE.
    //
    // This used to read localStorage and, if it said "client", switch the
    // chrome and re-assert the cookie. That fixed one direction of a two-way
    // split: localStorage → cookie. The other direction was never handled, so
    // when Android evicted localStorage and the cookie survived, every page
    // rendered the client app and this rendered the trainer's around it.
    // Dustin, 10 Sep: "my own client view nav tabs r gone!"
    //
    // Now the decision is resolveClientMode over ?as= and the cookie — the rule
    // every server page already applies — and localStorage is written as a
    // MIRROR, never read as an input. The ?as= half matters on a hard reload
    // mid-toggle: the layout can only see the cookie, and ?as=trainer must
    // beat a cookie that has not cleared yet, exactly as it does on the pages.
    const next = resolveClientMode(readClientModeInputs());
    setClientMode(next);
    try { localStorage.setItem("symmetry_view_mode", next ? "client" : "trainer"); } catch { /* noop */ }
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
    // BOTH directions carry a marker now. A bare /home let a stale cookie —
    // or a payload prefetched while in the other mode — decide, which is how
    // "hit trainer toggle, get client view" happened.
    // REPLACE, NOT PUSH. Dustin, 7 Sep, looking at another client's profile
    // page inside Client View: "why am I seeing this while signed into my
    // client view?" He had been on that page, toggled to client view, and swiped
    // Back — which returned him to the trainer page he had just left, now
    // wearing the client shell. Replacing the history entry means the page you
    // toggled away from is not one gesture behind you. The middleware guard is
    // the real boundary; this stops the most likely way of testing it.
    router.replace(next ? "/home?as=client" : "/home?as=trainer");
    router.refresh();
  }

  // ── CLIENT MODE ───────────────────────────────────────────────────────────
  if (clientMode) {
    return (
      <div className="flex flex-col min-h-screen app-bg">

        {/* The SAME bar a real client gets -- one component, so the two can
            never drift. The only difference is the Trainer View toggle, which
            must not exist for a real client because there is no trainer view
            for them to go to. */}
        <ClientTopBar
          trailing={
            <button
              onClick={handleToggleMode}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
              <i className="ti ti-layout-dashboard text-sm" />
              Trainer View
            </button>
          }
        />

        <RefreshHandle />

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

        {/* Client View is the client app, so it gets the client's coach too —
            otherwise the one surface Dustin actually tests on is the one
            surface without it. */}
        <GlobalCoach />

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
        /* Both intentionally unset: the sidebar resolves the signed-in
           trainer itself. Passing COACH_NAME and "DG" here is what put the
           owner's name and monogram on Stephanie's own screen. */
        // On mobile these live INSIDE the blue bar, in normal flow. They used
        // to be a second position:fixed element aimed at the same corner,
        // which is why the bell kept coming back half-covered.
        mobileActions={
          <>
            <button onClick={handleToggleMode} aria-label="Switch to client view"
              className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer" }}>
              <i className="ti ti-user text-base text-white" />
            </button>
            <HeaderAssist />
          </>
        }
      />
      <div className="flex-1 min-w-0 overflow-y-auto">
        {/* Spacer for the fixed mobile top bar (12 + 36 + 12, plus the safe
            area). Nothing else occupies a row on mobile now. */}
        <div className="lg:hidden" style={{ height: "calc(60px + env(safe-area-inset-top))" }} />
        {/* DESKTOP ONLY. On mobile these controls are rendered inside the blue
            top bar above (TrainerSidebar mobileActions) — there is no second
            fixed element on this screen any more. */}
        <div className="trainer-top-strip hidden lg:flex">
          <button onClick={handleToggleMode} aria-label="Switch to client view" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--brand-primary)", color: "white", border: "none", cursor: "pointer" }}><i className="ti ti-user text-sm" /><span className="hidden lg:inline">Client View</span></button>
          <HeaderAssist solid />
        </div>
        <RefreshHandle />
        {children}
      </div>
      <SessionDock />
      {/* AIAssistant is mounted ONCE, in the root layout. It used to be here
          too: both instances passed the trainer check and both registered the
          `symmetry:open-ai` listener, so tapping the header AI button opened
          two stacked drawers and doubled the auth round-trips. */}
    </div>
  );
}
