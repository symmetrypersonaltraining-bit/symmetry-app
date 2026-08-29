"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NOTIFICATION_EVENTS } from "@/lib/notificationEvents";

/**
 * The notification events this user has switched OFF.
 *
 * ⚠️ WHY THIS IS A SHARED HOOK AND NOT A COPY IN EACH COMPONENT.
 *
 * Jennifer, 26 Aug: *"Strange thing is I have all notifications turned off in
 * settings. I shouldn't be getting any messages."*
 *
 * She switched Group chat off on 14 August. `notification_preferences` gated
 * PUSH only, so the banner ignored her — that was fixed on 26 Aug by adding
 * this check to MessageNotifier. But it was added THERE, as one component's
 * private state, and three other surfaces read the same feed and still knew
 * nothing about it: the bell, the nav badge, and the flashing Messages tab.
 *
 * So on 27 Aug she and Claudine both still had a red bell and a flashing tab
 * for an unread group message — from the BOT — on a chat they had both turned
 * off. Four surfaces, one rule, and it lived in one of them.
 *
 * FAILS OPEN, deliberately and for the same reason the push gate does: a
 * message that should have been announced and was not is indistinguishable
 * from no message at all. An error, a missing session, a slow network — all
 * return "nothing is muted" rather than silencing the app.
 */
export function useMutedEventKeys(): Set<string> | null {
  const [muted, setMuted] = useState<Set<string> | null>(null);
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const sb = createClient();
        const { data: auth } = await sb.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) { if (on) setMuted(new Set()); return; }
        const { data, error } = await sb
          .from("notification_preferences")
          .select("event_key, enabled")
          .eq("user_id", uid);
        if (error) { if (on) setMuted(new Set()); return; }
        const off = new Set(
          ((data as { event_key: string; enabled: boolean }[] | null) || [])
            .filter((r) => r.enabled === false)
            .map((r) => r.event_key),
        );
        if (on) setMuted(off);
      } catch {
        if (on) setMuted(new Set());
      }
    })();
    return () => { on = false; };
  }, []);
  return muted;
}

/**
 * Is this event silenced for this user?
 *
 * `forced` events are never silenced — that is what forced means, and the one
 * event that uses it (ANNOUNCEMENT) is already a full-screen takeover. A null
 * set means "not loaded yet"; nothing is muted until we know otherwise.
 */
export function isEventMuted(muted: Set<string> | null, eventKey: string | undefined): boolean {
  if (!eventKey || !muted) return false;
  const def = Object.values(NOTIFICATION_EVENTS).find((e) => e.key === eventKey);
  if (def?.forced) return false;
  return muted.has(eventKey);
}
