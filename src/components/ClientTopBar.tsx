"use client";

// THE CLIENT TOP BAR — ONE OF IT, FOR BOTH WAYS OF BEING A CLIENT.
//
// Dustin, 9 Sep, on discovering his Client View and his clients' app did not
// have the same chrome: *"we need to make my client app work exactly like any
// other clients so i can test the same exact app they are using... this is
// something we've discussed before and needs to be locked in permanently so we
// dont run into this again. i was not aware they were looking at a diff screen
// than i am and that is not good."*
//
// He is right that it is not good, and it had already cost real time. The
// nutrition logger's "very sticky scrolling" was diagnosed as an app bug for
// days; it existed ONLY in Client View, because that wrapper added a nested
// scroller real clients never had (see TrainerLayoutWrapper). A test surface
// that differs from the real one does not just fail to catch bugs — it INVENTS
// them, and then they get fixed in the app that never had them.
//
// ── WHY A COMPONENT AND NOT TWO MATCHING BLOCKS OF JSX ─────────────────────
//
// Because two blocks that match today drift tomorrow, and nobody notices until
// a client reports something the trainer cannot reproduce. There is now exactly
// one client top bar in the app. The ONLY difference between the two mounts is
// the `trailing` slot, which carries the Trainer View toggle — a control that
// must not exist for a real client, since there is no trainer view for them to
// go to.
//
// A test pins both mounts to this component. If someone hand-rolls a second
// bar, it fails.

import Logo from "./Logo";
import HeaderAssist from "./HeaderAssist";
import { usePathname } from "next/navigation";
import { backDecision, showsBack } from "@/lib/nav/backFromHere";

/**
 * ── THE BACK CONTROL ───────────────────────────────────────────────────────
 *
 * Dustin, 11 Sep 2026: *"no matter which screen you're in, you always have a
 * way to go back one page."* Drawn only off the bottom-nav roots, and it does
 * precisely what the phone's own Back does — see backFromHere.ts for the rule
 * and the one thing it must never do. It reads history and writes nothing to
 * it.
 *
 * The desktop PWA is installed `standalone`, so it has no browser chrome and,
 * until this, no way off /recipes except the Nutrition tab. Phones already had
 * their hardware key; this gives everyone the same one button.
 */
function BackControl() {
  const pathname = usePathname() || "/";
  if (!showsBack(pathname)) return null;
  return (
    <button
      type="button"
      aria-label="back"
      onClick={() => {
        // Decide from the same two inputs BackButtonGuard uses, then act. No
        // pushState here, ever — see the v2/v3 note in backFromHere.ts.
        const d = backDecision(window.history.length, pathname, window.location.search);
        if (d.action === "back") window.history.back();
        else window.location.href = d.href;
      }}
      // 44px thumb target, same floor as every other control on a phone.
      className="flex items-center justify-center flex-shrink-0 -ml-2"
      style={{ width: 44, height: 44, color: "white", background: "transparent", border: 0 }}
    >
      <i className="ti ti-chevron-left" style={{ fontSize: 24 }} />
    </button>
  );
}

export default function ClientTopBar({ trailing }: { trailing?: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 px-4 pb-3 sticky top-0 z-40 shadow-sm"
      // --chrome-grad, not a flat --brand-primary. Two reasons, both from real
      // reports: a flat primary never moved when the depth level changed, and
      // the top bar is the biggest block of scheme colour on any screen ("the
      // deep blue on this one looks exactly the same on all settings"); and it
      // carries white text, which is 2.5:1 on Blush Cloud and worse on Soft
      // Pastel. --chrome-grad is floored toward black so white stays legible
      // in all thirty schemes.
      style={{ background: "var(--chrome-grad)", paddingTop: "calc(12px + env(safe-area-inset-top))" }}
    >
      <BackControl />
      <Logo size={28} color="white" className="flex-shrink-0" />
      <div className="flex-1">
        <span className="text-white font-semibold text-sm">Symmetry</span>
        <span className="text-white/50 text-xs ml-2">&middot; My Training</span>
      </div>
      {/* The bell and the feedback button. Dustin, 9 Sep: "there's a
          notification bell and a feedback button on that bar every client needs
          that there." HeaderAssist renders the AI button only for a trainer who
          is NOT in client mode, so neither mount shows it. */}
      <HeaderAssist />
      {trailing}
    </div>
  );
}
