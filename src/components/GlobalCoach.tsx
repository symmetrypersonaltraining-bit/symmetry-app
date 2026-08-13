"use client";

// The coach, on every client screen.
//
// Dustin, 2026-08-12, after seeing the mock-ups: "I actually like your idea
// here of doing it more as a floating AI on each screen to where we have one AI
// that does all of it that actually makes more sense."
//
// It is deliberately the SAME chat component the nutrition tab uses, not a
// second one. That chat already talks to /api/nutrition-ai/act, which falls
// through to the full coach when the message is a question — and "the full
// coach" means the client's targets, their fourteen-day logging, their weight
// trend and their plan. So a client on the Progress tab asking "am I actually
// losing fat or is this water" gets an answer grounded in their real numbers,
// from the same voice, without a line of new AI.
//
// What it CANNOT do here is change a meal: there is no meal list on this screen
// and none of the write helpers exist. `canAct={false}` makes the chat say so
// rather than render a Confirm button over a no-op — see the prop's note.
//
// WHERE IT DOES NOT APPEAR
//   · the workout logger — mid-set, one-handed, keyboard up. That screen gets
//     its own mount, on its own terms, and not from here.
//   · any screen that mounts a better-informed coach of its own (nutrition).
//     That screen claims the slot; see lib/ai/coachMount.
//   · while a soft keyboard is open — handled once, inside CoachFab.
//   · when there is no client record to ground the answers in.

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CoachChatSheet, { type CoachActions } from "@/app/(app)/nutrition/v3/CoachChatSheet";
import { useCoachSlotClaimed } from "@/lib/ai/coachMount";
import { surfaceMood } from "@/lib/ai/faces";

/**
 * Routes with no coach.
 *
 * `/workout/<id>` is the logger. Everything about that screen is deliberate to
 * the pixel and it is covered by its own layout tests; it does not get a
 * floating anything by accident.
 */
export function surfaceFor(pathname: string): string | null {
  if (/^\/workout\/[^/]+/.test(pathname)) return null; // the logger
  if (pathname.startsWith("/login") || pathname.startsWith("/install")) return null;
  if (pathname.startsWith("/nutrition")) return "nutrition";
  if (pathname.startsWith("/workout")) return "workout";
  if (pathname.startsWith("/progress") || pathname.startsWith("/client-preview/progress")) return "progress";
  if (pathname.startsWith("/messages")) return "messages";
  if (pathname.startsWith("/home")) return "home";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/help")) return "help";
  return "app";
}

/** Nothing on this screen can execute an action, and none of these are called. */
const NO_ACTIONS: CoachActions = {
  swapMealCustom: async () => {},
  moveMeal: async () => {},
  copyMeal: async () => {},
  deleteMeal: async () => {},
  addExtraParsed: async () => {},
  logMeal: async () => {},
  unlogMeal: async () => {},
};

export default function GlobalCoach() {
  const pathname = usePathname() || "/";
  const claimed = useCoachSlotClaimed();
  const [clientId, setClientId] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: byAuth } = await supabase
          .from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
        let id = (byAuth as { id: string } | null)?.id ?? null;
        if (!id && user.email) {
          const { data: byEmail } = await supabase
            .from("clients").select("id").eq("email", user.email).maybeSingle();
          id = (byEmail as { id: string } | null)?.id ?? null;
        }
        if (on) setClientId(id);
      } catch { /* no coach rather than a broken screen */ }
    })();
    return () => { on = false; };
  }, [supabase]);

  const surface = surfaceFor(pathname);
  if (!surface || claimed || !clientId) return null;

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  return (
    <CoachChatSheet
      clientId={clientId}
      dayContext={[]}
      actions={NO_ACTIONS}
      onApplySuggestion={async () => {}}
      selectedDate={today}
      canAct={false}
      // Never. We are the instance that gets hidden when the slot is claimed,
      // so claiming it ourselves is an infinite mount/unmount loop — it froze
      // the whole client app on 13 Aug. See the prop's note.
      claimsSlot={false}
      fabMood={surfaceMood(surface)}
    />
  );
}
