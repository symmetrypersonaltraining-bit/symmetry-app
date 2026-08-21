"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useFlag } from "@/lib/useFlag";

/**
 * Whether to draw a way into the setup guide, and how to stop drawing one.
 *
 * Two switches, and keeping them apart is the whole point:
 *
 *   app_flags.trainer_tutorial_live   — global. Does this app have a guide.
 *   trainer_settings.tutorial_dismissed_at — per trainer. Am I done with it.
 *
 * A trainer who finishes and turns it off must not take it away from the next
 * trainer being onboarded, so "I'm done" can never be the global flag. It is
 * their own row, so it follows them from laptop to phone, and it is reversible
 * from Settings — hiding the guide never deletes it, and /tutorial keeps
 * working for anyone who types it.
 *
 * `visible` is undefined until both answers are in, so nothing flashes on and
 * back off during the first paint.
 */
export interface TutorialVisibility {
  visible: boolean | undefined;
  /** True once the flag says the guide exists, whether or not it is hidden. */
  available: boolean | undefined;
  dismissed: boolean | undefined;
  hide: () => Promise<void>;
  show: () => Promise<void>;
}

export function useTutorialVisibility(): TutorialVisibility {
  const live = useFlag("trainer_tutorial_live");
  const [dismissed, setDismissed] = useState<boolean | undefined>(undefined);
  // write() must be able to roll back to whatever was true when it started,
  // without taking `dismissed` as a dependency and changing identity on every
  // toggle — the callers hand this straight to onClick.
  const dismissedRef = useRef<boolean | undefined>(undefined);
  dismissedRef.current = dismissed;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) {
          if (alive) setDismissed(false);
          return;
        }
        const { data, error } = await supabase
          .from("trainer_settings")
          .select("tutorial_dismissed_at")
          .eq("user_id", uid)
          .maybeSingle();
        if (!alive) return;
        // A read that fails must not hide the guide. The safe default here is
        // the opposite of the flag's: showing a guide nobody wanted is a minor
        // annoyance, hiding one from a trainer on their first morning is not.
        setDismissed(!error && !!(data as { tutorial_dismissed_at?: string | null } | null)?.tutorial_dismissed_at);
      } catch {
        if (alive) setDismissed(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const write = useCallback(async (value: string | null) => {
    // Optimistic, then honest. The tap has to land immediately, but a write
    // that failed must not leave the screen claiming it worked — otherwise the
    // guide "disappears", comes back on the next device, and nobody knows why.
    // On failure we put the previous state back.
    const previous = dismissedRef.current;
    const next = value !== null;
    setDismissed(next);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        setDismissed(previous);
        return;
      }
      const { error } = await supabase
        .from("trainer_settings")
        .upsert({ user_id: uid, tutorial_dismissed_at: value }, { onConflict: "user_id" });
      if (error) setDismissed(previous);
    } catch {
      setDismissed(previous);
    }
  }, []);

  const hide = useCallback(async () => {
    await write(new Date().toISOString());
  }, [write]);

  const show = useCallback(async () => {
    await write(null);
  }, [write]);

  const available = live;
  const visible = live === undefined || dismissed === undefined ? undefined : live && !dismissed;

  return { visible, available, dismissed, hide, show };
}
