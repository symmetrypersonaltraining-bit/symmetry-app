"use client";

// THE WORK SAVED. THE SCREEN DID NOT KNOW.
//
// Dustin, 7 Sep, home screen showing both of today's sessions on Start and the
// week at 0% adherence: *"I logged my workout earlier... I just relogged n
// completed it and still won't save. huge fuck up."*
//
// The database had it. workout_logs completed at 2:04pm with 31 sets, and the
// scheduled_workouts row for today marked completed and linked to that log. The
// card that renders "Start" versus a green Done chip reads exactly that column
// and was reading it correctly. He was looking at a render made BEFORE he
// finished — the same class of thing as the trainer page that came back on a
// Back swipe earlier the same day.
//
// A page put aside and returned to is the whole problem: tap Done, swipe Back,
// switch apps and come back, lock the phone during a set. The React tree is
// restored exactly as it was left, server data and all, and nothing goes and
// asks whether any of it is still true.
//
// router.refresh() is the right tool and location.reload() is emphatically not.
// See the note in HapticTap: a `pageshow` handler that reloaded broke the
// hardware Back button on 1 Aug, because reloading on a bfcache restore throws
// away the page Back just restored and re-arms BackButtonGuard's sentinel, so
// each press left you one entry deeper. refresh() re-runs the server components
// and patches the tree in place. It touches no history entry and unmounts
// nothing, so Back keeps working exactly as it does now.
//
// This does not replace RealtimeScheduleSync — that one reacts to somebody
// ELSE moving a session while you sit on the screen. This one covers the far
// more common case of your own screen having been away.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Long enough that flicking between apps does not refetch on every flick. */
const QUIET_MS = 700;
/** A screen that was only away for an instant has nothing new to learn. */
const MIN_AWAY_MS = 3000;

export default function RefreshOnReturn() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAt = useRef<number>(0);

  useEffect(() => {
    const refreshSoon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // Do not spend a request on a tab that went away again while waiting.
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        try { router.refresh(); } catch { /* a refresh is never worth an error */ }
      }, QUIET_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") { hiddenAt.current = Date.now(); return; }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : Infinity;
      hiddenAt.current = 0;
      if (away >= MIN_AWAY_MS) refreshSoon();
    };

    // The bfcache restore — a hardware Back press on Android produces this.
    // REFRESH ONLY. Never reload here; see the header.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) refreshSoon(); };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
