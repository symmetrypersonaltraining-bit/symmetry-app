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
  const [nudgesLive, setNudgesLive] = useState(false);
  const [coachbotLive, setCoachbotLive] = useState(false);
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
          const { data: f } = await supabase.from("app_flags").select("enabled").eq("key", "nudges_live").maybeSingle();
          const { data: cb } = await supabase.from("app_flags").select("enabled").eq("key", "coachbot_live").maybeSingle();
          setCoachbotLive((cb as { enabled: boolean } | null)?.enabled === true);
          setNudgesLive((f as { enabled: boolean } | null)?.enabled === true);
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
          <Row
            icon="ti-robot"
            title="Send AI check-ins to clients"
            sub={
              nudgesLive
                ? "LIVE — the nightly run messages clients in your name. Caps and rehab guards still apply."
                : "Preview only. The nightly run drafts everything and messages the summary to you, but sends nothing to clients."
            }
            on={nudgesLive}
            disabled={!ready}
            onToggle={() => {
              const next = !nudgesLive;
              setNudgesLive(next);
              fx(next ? "pr" : "tap");
              (async () => {
                try {
                  const { error } = await supabase
                    .from("app_flags")
                    .update({ enabled: next, updated_at: new Date().toISOString() })
                    .eq("key", "nudges_live");
                  if (error) setNudgesLive(!next);
                } catch {
                  setNudgesLive(!next);
                }
              })();
            }}
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
        </>
      ) : null}
    </div>
  );
}
