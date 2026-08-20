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

import { useCoach } from "@/lib/useCoach";
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
      <EnablePushOnThisDevice />
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

/**
 * The button that turns push on for THIS device.
 *
 * ── Why every toggle above it was decorative until now ──────────────────────
 *
 * Dustin, 16 Aug: "Noone is chatting in the group chat. confirm they are
 * getting notification." They were not. 29 active clients, TWO device tokens in
 * the database. The list of switches above has always worked — it just governed
 * a delivery route that reached almost nobody, because the only registration
 * path in the app required the Android APK.
 *
 * A settings screen full of notification preferences, on an account that cannot
 * receive a notification, is worse than no settings screen: it is a promise.
 *
 * ── Why the ask lives HERE and not on page load ─────────────────────────────
 *
 * A permission prompt fired the moment somebody opens the app is the fastest
 * possible way to get "Block" pressed — and a blocked origin cannot be asked
 * again from inside the app. The client would have to dig it out of browser
 * settings, which means never. So the prompt sits behind a button they chose to
 * press, on a screen that has just told them what the notifications are for.
 */
function EnablePushOnThisDevice() {
  const { firstName: coachFirstName } = useCoach();
  const [state, setState] = useState<"checking" | "unsupported" | "unconfigured" | "on" | "off" | "blocked" | "working">("checking");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
          setState("unsupported");
          return;
        }
        const cfg = await fetch("/api/push/subscribe").then((r) => r.json()).catch(() => null);
        if (!cfg?.configured) { setState("unconfigured"); return; }
        if (Notification.permission === "denied") { setState("blocked"); return; }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub && Notification.permission === "granted" ? "on" : "off");
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  async function enable() {
    setErr(null);
    setState("working");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "off");
        return;
      }
      const cfg = await fetch("/api/push/subscribe").then((r) => r.json());
      if (!cfg?.publicKey) { setState("unconfigured"); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64(cfg.publicKey),
        }));

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      // Checked. "It said it worked and I still get nothing" is the exact
      // complaint this whole change exists to answer; a silent failure here
      // would recreate it inside the fix.
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error || "Could not save this device. Try again.");
        setState("off");
        return;
      }
      setState("on");
    } catch (e) {
      setErr((e as Error)?.message || "Could not turn notifications on.");
      setState("off");
    }
  }

  if (state === "checking" || state === "unsupported") return null;

  const box = {
    border: "1px solid var(--brand-border)",
    borderRadius: 14,
    padding: "12px 14px",
    marginBottom: 12,
  } as const;

  if (state === "unconfigured") {
    return (
      <div style={box}>
        <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>Push notifications aren&rsquo;t set up yet</p>
        <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
          Your coach is still finishing this off. The switches below will work once it&rsquo;s live.
        </p>
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div style={box}>
        <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>Notifications are blocked</p>
        <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
          Your browser is blocking them for this app, so nothing below can reach you.
          Open your browser&rsquo;s site settings for Symmetry and set Notifications to Allow,
          then come back here.
        </p>
      </div>
    );
  }

  if (state === "on") {
    return (
      <div style={box}>
        <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>✓ Notifications are on for this device</p>
        <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
          If you use the app on another phone or a laptop, turn them on there too — this is per device.
        </p>
      </div>
    );
  }

  return (
    <div style={box}>
      <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>Turn on notifications</p>
      <p className="text-xs mt-1 mb-2" style={{ color: "var(--brand-text-secondary)", lineHeight: 1.5 }}>
        Without this you won&rsquo;t hear about messages from {coachFirstName}, group chat, or your
        payment reminders — the switches below have nothing to reach you with.
      </p>
      {err && <p className="text-xs mb-2" style={{ color: "#DC2626" }}>{err}</p>}
      <button
        onClick={() => void enable()}
        disabled={state === "working"}
        className="w-full py-2.5 rounded-xl text-sm font-bold text-white"
        style={{ background: "var(--brand-primary)", opacity: state === "working" ? 0.6 : 1 }}
      >
        {state === "working" ? "Turning on…" : "Turn on notifications"}
      </button>
    </div>
  );
}

/** base64url VAPID key → the bytes PushManager wants. */
function urlB64(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out.buffer;
}
