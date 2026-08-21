"use client";

// The hook half of takeoverSlot.ts. See that file for why this exists.
//
// Usage, and the whole contract:
//
//   const mayShow = useTakeoverSlot("weekbrief", TAKEOVER_PRIORITY.WEEK_BRIEF, wantsToShow);
//   if (!mayShow) return null;      // or render the non-takeover version
//
// `want` must be the component's own honest answer to "do I have something
// worth covering the screen for". Passing `true` unconditionally claims the
// slot for the whole session and starves everything below it.

import { useEffect, useSyncExternalStore } from "react";
import { claimTakeover, releaseTakeover, subscribeTakeover, currentHolder } from "@/lib/takeoverSlot";

export function useTakeoverSlot(id: string, priority: number, want: boolean): boolean {
  useEffect(() => {
    if (!want) {
      releaseTakeover(id);
      return;
    }
    claimTakeover(id, priority);
    return () => releaseTakeover(id);
  }, [id, priority, want]);

  // Server render has no takeover state and must not disagree with the first
  // client render, so the server snapshot is always "nobody holds it" and the
  // effect above settles it a tick later.
  const holder = useSyncExternalStore(subscribeTakeover, currentHolder, () => null);
  return want && holder === id;
}
