"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fx,
  hapticsEnabled,
  setHapticsEnabled,
  setSoundEnabled,
  soundEnabled,
} from "@/lib/fx";

/**
 * ExperienceSettings — the switches for the 2026-07-25 polish features.
 *
 * Without this panel three shipped features were unreachable: sound could
 * never be turned on, nobody could join the leaderboard, and the promised
 * nudge kill switch had no UI.
 *
 * Client rows  : sound, haptics, leaderboard opt-in, pause nudges
 * Trainer row  : the master switch that lets AI nudges actually message clients
 *
 * Sound/haptics are device-local (localStorage) because they're about THIS
 * phone. Leaderboard + nudges are per-client DB columns. Every write is
 * optimistic with a revert on failure, so a dropped request can't leave the
 * toggle lying about its state.
 */

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

export default function ExperienceSettings({ isTrainer }: { isTrainer: boolean }) {
  const supabase = createClient();

  const [sound, setSound] = useState(false);
  const [haptics, setHaptics] = useState(true);
  const [board, setBoard] = useState(false);
  const [nudges, setNudges] = useState(true);
  const [coachbotLive, setCoachbotLive] = useState(false);
  const [tutorialLive, setTutorialLive] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSound(soundEnabled());
    setHaptics(hapticsEnabled());
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: c } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
          const id = (c as { id: string } | null)?.id ?? null;
          setClientId(id);
          if (id) {
            const { data: s } = await supabase
              .from("client_app_settings")
              .select("leaderboard_opt_in, nudges_enabled")
              .eq("client_id", id)
              .maybeSingle();
            const row = s as { leaderboard_opt_in: boolean | null; nudges_enabled: boolean | null } | null;
            setBoard(row?.leaderboard_opt_in === true);
            setNudges(row?.nudges_enabled !== false);
          }
        }
        if (isTrainer) {
          const { data: flags } = await supabase
            .from("app_flags")
            .select("key, enabled")
            .in("key", ["coachbot_live", "trainer_tutorial_live"]);
          const on = (k: string) =>
            ((flags || []) as { key: string; enabled: boolean }[]).some((f) => f.key === k && f.enabled === true);
          setCoachbotLive(on("coachbot_live"));
          setTutorialLive(on("trainer_tutorial_live"));
        }
      } catch {
        /* leave defaults */
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveClient = useCallback(
    async (patch: Record<string, boolean>, revert: () => void) => {
      if (!clientId) return;
      try {
        const { error } = await supabase
          .from("client_app_settings")
          .update(patch)
          .eq("client_id", clientId);
        if (error) revert();
      } catch {
        revert();
      }
    },
    [clientId, supabase],
  );

  return (
    <div className="card p-4">
      <p className="text-xs font-bold mb-1" style={{ color: "var(--brand-text-secondary)", letterSpacing: 1 }}>
        EXPERIENCE
      </p>

      <Row
        icon="ti-volume"
        title="Sounds"
        sub="Off by default. A quiet click when you log a set, a fanfare on a personal record. Nothing plays mid-set."
        on={sound}
        onToggle={() => {
          const next = !sound;
          setSound(next);
          setSoundEnabled(next);
          if (next) fx("pr"); // let them hear what they just switched on
        }}
      />

      <Row
        icon="ti-vibrate"
        title="Vibration"
        sub="A light tap on every button, a stronger pattern for a PR or a failed save. Android only for now."
        on={haptics}
        onToggle={() => {
          const next = !haptics;
          setHaptics(next);
          setHapticsEnabled(next);
          if (next) fx("section");
        }}
      />

      <Row
        icon="ti-trophy"
        title="Join the consistency board"
        sub="Shows your first name and how many days you trained. Never weight, never measurements. Off unless you turn it on."
        on={board}
        disabled={!ready || !clientId}
        onToggle={() => {
          const next = !board;
          setBoard(next);
          fx("tap");
          void saveClient({ leaderboard_opt_in: next }, () => setBoard(!next));
        }}
      />

      <Row
        icon="ti-bell"
        title="Check-in messages"
        sub="Occasional nudges if you go quiet. Never more than one every couple of days — turn it off any time."
        on={nudges}
        disabled={!ready || !clientId}
        onToggle={() => {
          const next = !nudges;
          setNudges(next);
          fx("tap");
          void saveClient({ nudges_enabled: next }, () => setNudges(!next));
        }}
      />

      {isTrainer ? (
        <>
          <div style={{ borderTop: "1px solid var(--brand-border)", margin: "10px 0 2px" }} />
          <p className="text-xs font-bold mb-1 mt-2" style={{ color: "var(--brand-text-secondary)", letterSpacing: 1 }}>
            AUTOMATION · TRAINER ONLY
          </p>
          {/* The "send AI check-ins to clients" switch is GONE, not defaulted
              off — /api/ai-nudges cannot message a client any more whatever
              this said. Leaving a toggle that promises delivery the code
              refuses to perform is worse than having no toggle: it is a lie in
              the settings screen, and the first person to notice would be a
              client who never got the message it claimed to send.
              What the engine still does is described below, truthfully. */}

          {/* And this row was the SECOND lie in the same place. It read
              "sends the list to you", switched on and locked on, and no such
              list has ever existed — nothing in the app reads ai_nudge_log.
              Meanwhile the sweep ran nightly and wrote a message about every
              client that nobody saw. Dustin, 21 Aug: "stop that for now. keep
              engine for later if i decide to add it back."

              Shown as OFF and locked, rather than deleted, because the engine
              is deliberately still there. A toggle here would be the wrong
              switch anyway: turning it back on is a decision about what the
              drafts are FOR, and there is nowhere for them to go yet. */}
          <Row
            icon="ti-list-check"
            title="Re-engagement drafts"
            sub="Off. It used to write a message about every client every night that nothing ever showed you. The engine is kept — when there's somewhere for the drafts to land, it comes back."
            on={false}
            disabled
            onToggle={() => {}}
          />

          <Row
            icon="ti-message-chatbot"
            title="Coach Bot in the group chat"
            sub={
              coachbotLive
                ? "LIVE — posts light-hearted smack talk about the challenge three times a week. Never pushes a notification, never names anyone in the bottom half of the board."
                : "Off. Nothing posts. Turn it on when you want the group chat to have a mouth on it."
            }
            on={coachbotLive}
            disabled={!ready}
            onToggle={() => {
              const next = !coachbotLive;
              setCoachbotLive(next);
              fx(next ? "pr" : "tap");
              (async () => {
                try {
                  const { error } = await supabase
                    .from("app_flags")
                    .update({ enabled: next, updated_at: new Date().toISOString() })
                    .eq("key", "coachbot_live");
                  if (error) setCoachbotLive(!next);
                } catch {
                  setCoachbotLive(!next);
                }
              })();
            }}
          />
          <Row
            icon="ti-school"
            title="New-trainer walkthrough"
            sub={
              tutorialLive
                ? "ON — a Set up your app card appears in Settings, and the walkthrough is reachable at /tutorial."
                : "Off. The walkthrough exists and is finished; nobody can reach it. Turn it on when you want a new trainer to be walked through the app."
            }
            on={tutorialLive}
            disabled={!ready}
            onToggle={() => {
              const next = !tutorialLive;
              setTutorialLive(next);
              fx(next ? "pr" : "tap");
              (async () => {
                // .select("id") on purpose. An update that matches no row is
                // not an error in supabase-js, so without this the switch
                // would flip on screen and change nothing in the database —
                // which is exactly how you ship a feature to nobody and
                // believe it went live.
                try {
                  const { data, error } = await supabase
                    .from("app_flags")
                    .update({ enabled: next, updated_at: new Date().toISOString() })
                    .eq("key", "trainer_tutorial_live")
                    .select("key");
                  if (error || !data || data.length === 0) setTutorialLive(!next);
                } catch {
                  setTutorialLive(!next);
                }
              })();
            }}
          />

        </>
      ) : null}
    </div>
  );
}
