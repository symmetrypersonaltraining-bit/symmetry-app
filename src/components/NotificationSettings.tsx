"use client";

/**
 * Settings → Notifications.
 *
 * Dustin, 13 Aug: "lets look at options for notification settings for everyone
 * in terms of what they get notified on and how, what they have a choice of and
 * what i say is built in, where that setting should live."
 *
 * WHERE IT LIVES: inside the existing Settings page rather than its own route.
 * Five events do not need a page of their own, and a setting nobody can find is
 * the same as no setting — which is the state this replaces.
 *
 * WHAT'S BUILT IN: an event marked `forced` in the registry renders with its
 * switch on and disabled, and says why. Showing it greyed rather than hiding it
 * is deliberate: "why do I still get announcements?" should be answerable by
 * looking, not by asking. Right now that is exactly one event.
 *
 * A MISSING ROW MEANS ENABLED, so this screen starts everything on and only
 * writes when someone turns something off (or back on). The table stores
 * disagreements, not a row per person per event.
 *
 * Every write is optimistic with a revert on failure, matching ExperienceSettings —
 * a dropped request must never leave a toggle claiming a state the database
 * does not have. A switch that lies is worse than no switch.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  NOTIFICATION_EVENTS,
  type NotificationEventDef,
} from "@/lib/notificationEvents";

function Row({
  icon,
  title,
  sub,
  on,
  onToggle,
  disabled,
}: {
  icon: string;
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div style={{ minWidth: 0 }}>
        <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
          <i className={`ti ${icon} mr-1.5`} style={{ color: "var(--brand-primary)" }} />
          {title}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)", lineHeight: 1.5 }}>
          {sub}
        </p>
      </div>
      <div
        role="button"
        aria-label={title}
        aria-pressed={on}
        onClick={disabled ? undefined : onToggle}
        className="w-11 h-6 rounded-full relative transition-colors flex-shrink-0"
        style={{
          background: on ? "var(--brand-primary)" : "var(--brand-border)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div
          className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all"
          style={{ left: on ? "calc(100% - 20px)" : "4px" }}
        />
      </div>
    </div>
  );
}

/** One icon per event, so the list scans as a list rather than as prose. */
const ICONS: Record<string, string> = {
  message_from_coach: "ti-message-circle",
  message_from_client: "ti-messages",
  announcement: "ti-speakerphone",
  group_message: "ti-users",
  reaction_on_my_message: "ti-mood-smile",
};

export default function NotificationSettings({ isTrainer }: { isTrainer: boolean }) {
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const events: NotificationEventDef[] = Object.values(NOTIFICATION_EVENTS).filter(
    (e) => isTrainer || !e.trainerOnly,
  );

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (on) setLoaded(true); return; }
        if (on) setUserId(user.id);

        const { data } = await supabase
          .from("notification_preferences")
          .select("event_key, enabled")
          .eq("user_id", user.id);

        const off = new Set<string>();
        for (const r of (data as { event_key: string; enabled: boolean }[] | null) || []) {
          if (r.enabled === false) off.add(r.event_key);
        }
        if (on) { setMuted(off); setLoaded(true); }
      } catch {
        // Everything reads as ON, which is the true default. Failing to load a
        // preference must not present as "you turned this off".
        if (on) setLoaded(true);
      }
    })();
    return () => { on = false; };
  }, [supabase]);

  const toggle = useCallback(
    async (ev: NotificationEventDef) => {
      if (ev.forced || !userId) return;

      const wasMuted = muted.has(ev.key);
      const next = new Set(muted);
      if (wasMuted) next.delete(ev.key); else next.add(ev.key);
      setMuted(next);

      const { error } = await supabase
        .from("notification_preferences")
        .upsert(
          { user_id: userId, event_key: ev.key, enabled: wasMuted, updated_at: new Date().toISOString() },
          { onConflict: "user_id,event_key" },
        );

      if (error) {
        // Put it back. The switch must always show what the database thinks.
        const revert = new Set(muted);
        setMuted(revert);
      }
    },
    [muted, supabase, userId],
  );

  if (!loaded) return null;

  return (
    <div className="metric-card">
      <p
        className="text-xs font-semibold uppercase tracking-widest mb-1"
        style={{ color: "var(--brand-text-secondary)" }}
      >
        Notifications
      </p>
      <p className="text-xs mb-1" style={{ color: "var(--brand-text-secondary)", lineHeight: 1.5 }}>
        What buzzes your phone. Turning one off here is better than switching the
        app off in your phone&rsquo;s settings — that would stop everything,
        including payment reminders.
      </p>

      {events.map((ev) => (
        <Row
          key={ev.key}
          icon={ICONS[ev.key] || "ti-bell"}
          title={ev.label}
          sub={ev.forced ? `${ev.description} These can't be turned off.` : ev.description}
          on={ev.forced ? true : !muted.has(ev.key)}
          disabled={ev.forced}
          onToggle={() => void toggle(ev)}
        />
      ))}
    </div>
  );
}
