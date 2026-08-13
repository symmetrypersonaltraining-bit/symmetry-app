"use client";

// Which ✦ is on screen right now.
//
// Dustin, 2026-08-12, on putting the coach on every screen: "make sure any
// other duplicate ai buttons are removed when we add this one."
//
// The global coach is mounted once in the app layout, so it is on every client
// screen by default. The nutrition tab has its OWN coach — same chat, but wired
// to that day's meals so it can actually swap and log things. Both would render
// a floating ✦ in the same corner.
//
// So a screen with a better-informed coach CLAIMS the slot on mount, and the
// global one steps aside for as long as the claim is held. A count rather than
// a boolean because React can mount the next screen's coach before unmounting
// the last one's; a flag would leave the global ✦ hidden on a screen with no
// coach at all, which is the worse failure of the two.

import { useEffect, useState } from "react";

let claims = 0;
const listeners = new Set<(claimed: boolean) => void>();

function broadcast() {
  const claimed = claims > 0;
  for (const fn of listeners) fn(claimed);
}

/**
 * Take the ✦ slot for this screen. Call from an effect and return the result as
 * the cleanup — it releases the claim.
 */
export function claimCoachSlot(): () => void {
  claims += 1;
  broadcast();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claims = Math.max(0, claims - 1);
    broadcast();
  };
}

/** Non-reactive read. The hook is for components; this is for tests and guards. */
export function coachSlotClaimed(): boolean {
  return claims > 0;
}

/** True while some screen is showing its own coach. */
export function useCoachSlotClaimed(): boolean {
  const [claimed, setClaimed] = useState(false);
  useEffect(() => {
    // Read on mount as well as subscribe: the claiming screen's effect may have
    // already run by the time this one does.
    setClaimed(claims > 0);
    const fn = (v: boolean) => setClaimed(v);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return claimed;
}
