"use client";

// Which bots run in THIS trainer's app.
//
// Dustin, 21 Aug: trainers get "access to decide what bots and cards they use
// and how they function on their app only".
//
// These three used to be app_flags, which is one switch for the whole
// business — a second trainer turning Coach Bot off would have silenced it in
// his group chat too, with nothing recording who did it. They now live on a
// per-trainer row, and BOTH have to be on: the owner can take a feature off
// the whole business from Experience, and a trainer can decline one the owner
// has enabled. Neither overrides the other.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AiBadge from "@/components/AiBadge";

type Key = "coachbot_enabled" | "birthdays_enabled" | "weekly_focus_enabled";

// `face: true` draws the app's actual AI avatar instead of an icon.
// aiFaceEverywhere bans ti-robot / ti-message-chatbot / ti-sparkles outright,
// and it is right to: the point of that ratchet is that anyone adding an AI
// surface reaches for AiBadge rather than a generic glyph. A row ABOUT the
// bot is the one place a face is more honest than a symbol anyway — it shows
// which bot the switch belongs to.
const ROWS: { key: Key; icon: string; face?: boolean; title: string; on: string; off: string }[] = [
  {
    key: "coachbot_enabled",
    icon: "", face: true,
    title: "Coach Bot in your group chat",
    on: "Posts light smack talk about the challenge three times a week. Never names anyone in the bottom half of the board.",
    off: "Your group chat stays quiet unless you post in it.",
  },
  {
    key: "birthdays_enabled",
    icon: "ti-cake",
    title: "Birthday messages",
    on: "Your clients get a birthday post, and you get a quiet heads-up the evening before.",
    off: "No birthday posts and no heads-up for your clients.",
  },
  {
    key: "weekly_focus_enabled",
    icon: "ti-target-arrow",
    title: "Weekly focus for your clients",
    on: "Late Saturday, each of your clients gets one line for the week ahead, written from their real numbers.",
    off: "Your clients see no focus line unless you write one yourself.",
  },
];

export default function TrainerBotSettings() {
  const [state, setState] = useState<Record<Key, boolean> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb
          .from("trainer_features")
          .select("coachbot_enabled, birthdays_enabled, weekly_focus_enabled")
          .maybeSingle();
        if (!on) return;
        const r = (data || {}) as Partial<Record<Key, boolean>>;
        // A missing row reads as everything ON — the same default the database
        // function uses, so the screen never disagrees with what actually runs.
        setState({
          coachbot_enabled: r.coachbot_enabled !== false,
          birthdays_enabled: r.birthdays_enabled !== false,
          weekly_focus_enabled: r.weekly_focus_enabled !== false,
        });
      } catch {
        if (on) setErr("Couldn't load these.");
      }
    })();
    return () => { on = false; };
  }, []);

  async function toggle(k: Key) {
    if (!state) return;
    const next = { ...state, [k]: !state[k] };
    setState(next);
    setErr(null);
    try {
      const sb = createClient();
      const { data: auth } = await sb.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("no user");
      const { data: me } = await sb.from("trainers").select("id").eq("auth_user_id", uid).maybeSingle();
      const id = (me as { id?: string } | null)?.id;
      if (!id) throw new Error("no trainer");
      const { error } = await sb
        .from("trainer_features")
        .upsert({ trainer_id: id, ...next, updated_at: new Date().toISOString() },
                { onConflict: "trainer_id" });
      if (error) throw error;
    } catch {
      // Put it back. A switch that looks flipped and did not save is worse
      // than one that refuses.
      setState(state);
      setErr("That didn't save — try again.");
    }
  }

  if (!state) return null;

  return (
    <section>
      <p className="section-header">Your bots</p>
      <div className="card p-4 space-y-1">
        {ROWS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => toggle(r.key)}
            aria-pressed={state[r.key]}
            className="w-full flex items-start gap-3 py-3 text-left"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            {r.face ? (
              <span className="mt-0.5 flex-shrink-0" style={{ opacity: state[r.key] ? 1 : 0.45 }}>
                <AiBadge size={22} mood={state[r.key] ? "hype" : "neutral"} title="" />
              </span>
            ) : (
              <i className={`ti ${r.icon} text-xl mt-0.5`}
                 style={{ color: state[r.key] ? "var(--brand-primary)" : "var(--brand-text-secondary)" }} />
            )}
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{r.title}</span>
              <span className="block text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                {state[r.key] ? r.on : r.off}
              </span>
            </span>
            <span
              aria-hidden
              className="relative flex-shrink-0 mt-1"
              style={{ width: 44, height: 24, borderRadius: 12,
                       background: state[r.key] ? "var(--brand-primary)" : "var(--brand-border)" }}
            >
              <span className="absolute top-1 rounded-full bg-white shadow"
                    style={{ width: 16, height: 16, left: state[r.key] ? "calc(100% - 20px)" : 4 }} />
            </span>
          </button>
        ))}
        {err && <p className="text-xs font-semibold pt-1" style={{ color: "#dc2626" }}>{err}</p>}
        <p className="text-xs pt-2" style={{ color: "var(--brand-text-secondary)" }}>
          These affect your clients only. Other trainers set their own.
        </p>
      </div>
    </section>
  );
}
