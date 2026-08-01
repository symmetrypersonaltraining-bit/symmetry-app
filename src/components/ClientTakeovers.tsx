"use client";

// The full-screen things the app says to a client, and the rules for when it is
// allowed to say them.
//
// There are three of these now — join the challenge, celebrate the winner, read
// the trainer's announcement — and they were heading for three components each
// deciding independently whether to cover the screen. That ends with two
// takeovers stacked on top of each other on a Sunday evening, which is worse
// than either alone.
//
// So: ONE component, ONE query pass, and at most ONE takeover ever on screen.
// Priority is by shelf life, not importance. The winner announcement is stale
// by Tuesday; a challenge invitation is good until the challenge ends; an
// announcement Dustin wrote will still make sense tomorrow. Whatever loses
// today is still unseen tomorrow, so nothing is dropped — it just waits.
//
// "Seen" is per PERSON (client_announcements_seen), not per device. localStorage
// would re-show a takeover on their phone after they dismissed it on the iPad,
// and a full-page interruption that comes back is worse than one that never
// fired.
//
// Everything is defensive: this renders inside the dashboard, so a throw here is
// a broken home screen. Every failure path renders nothing.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fx } from "@/lib/fx";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function pretty(iso: string): string {
  const [, m, d] = (iso || "").split("-").map(Number);
  return MON[m - 1] ? MON[m - 1] + " " + d : iso;
}

interface Challenge {
  id: string;
  title: string;
  emoji: string | null;
  metric: string;
  starts_on: string;
  ends_on: string;
  days_left: number | null;
}

interface Winner {
  id: string;
  title: string;
  emoji: string | null;
  metric: string;
  winner_score: number | null;
  winner_name: string;
  winner_is_me: boolean;
  my_score: number;
  my_rank: number | null;
}

interface Announcement {
  id: string;
  body: string;
  created_at: string;
}

type Pick =
  | { kind: "winner"; key: string; winner: Winner }
  | { kind: "challenge"; key: string; challenge: Challenge; myScore: number; myRank: number | null; total: number; people: number; joined: boolean }
  | { kind: "announcement"; key: string; announcement: Announcement }
  | null;

const LAUNCH_KEY = "challenge-launch-2026-08";

export default function ClientTakeovers({ basePath = "" }: { basePath?: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [pick, setPick] = useState<Pick>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: me } = await supabase.rpc("my_client_id");
        const cid = (me as string | null) ?? null;
        if (!cid) return;

        const { data: seenRows } = await supabase
          .from("client_announcements_seen")
          .select("key")
          .eq("client_id", cid);
        const seen = new Set(((seenRows as { key: string }[]) ?? []).map((r) => r.key));

        // ── 1. A winner to celebrate ─────────────────────────────────────
        // Only for three days. "Cheyenne won!" a week later is not a
        // celebration, it is clutter, and it would sit in front of the
        // challenge that is running NOW.
        const cutoff = new Date(Date.now() - 3 * 86400000).toISOString();
        const { data: done } = await supabase
          .from("group_challenges")
          .select("id, title, emoji, metric, winner_client_id, winner_score, scored_at")
          .eq("status", "complete")
          .not("winner_client_id", "is", null)
          .gte("scored_at", cutoff)
          .order("scored_at", { ascending: false })
          .limit(1);
        const w = ((done as {
          id: string; title: string; emoji: string | null; metric: string;
          winner_client_id: string; winner_score: number | null;
        }[]) ?? [])[0];

        if (w && !seen.has("challenge-winner-" + w.id)) {
          const { data: board } = await supabase.rpc("challenge_leaderboard", { p_challenge_id: w.id });
          const rows = (board as { client_id: string; client_name: string; score: number; rnk: number; is_me: boolean }[]) ?? [];
          const champ = rows.find((r) => r.client_id === w.winner_client_id);
          const mine = rows.find((r) => r.is_me);
          if (alive) {
            setMeId(cid);
            setPick({
              kind: "winner",
              key: "challenge-winner-" + w.id,
              winner: {
                id: w.id,
                title: w.title,
                emoji: w.emoji,
                metric: w.metric,
                winner_score: w.winner_score,
                winner_name: (champ?.client_name || "").split(" ")[0] || "Someone",
                winner_is_me: w.winner_client_id === cid,
                my_score: Number(mine?.score) || 0,
                my_rank: mine?.rnk ?? null,
              },
            });
          }
          return;
        }

        // ── 2. The live challenge, if they have never been told ──────────
        if (!seen.has(LAUNCH_KEY)) {
          const { data: c } = await supabase.from("v_active_challenge").select("*").maybeSingle();
          const ch = (c as Challenge | null) ?? null;
          if (ch) {
            const [{ data: rows }, { data: tot }] = await Promise.all([
              supabase.rpc("challenge_leaderboard", { p_challenge_id: ch.id }),
              supabase.rpc("challenge_group_total", { p_challenge_id: ch.id }),
            ]);
            const mine = ((rows as { is_me: boolean; rnk: number; score: number }[]) ?? []).find((r) => r.is_me);
            const t = Array.isArray(tot) ? tot[0] : tot;
            if (alive) {
              setMeId(cid);
              setPick({
                kind: "challenge",
                key: LAUNCH_KEY,
                challenge: ch,
                myScore: Number(mine?.score) || 0,
                myRank: mine?.rnk ?? null,
                total: Number(t?.group_total) || 0,
                people: Number(t?.contributors) || 0,
                joined: !!t?.joined,
              });
            }
            return;
          }
        }

        // ── 3. An announcement from Dustin ───────────────────────────────
        // Broadcasts only, last 7 days, newest first. A broadcast is the
        // deliberate "everyone needs to read this" channel — ordinary group
        // chatter never lands here.
        const week = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: msgs } = await supabase
          .from("messages")
          .select("id, body, created_at")
          .eq("is_broadcast", true)
          .is("deleted_at", null)
          .gte("created_at", week)
          .order("created_at", { ascending: false })
          .limit(5);
        const ann = ((msgs as Announcement[]) ?? []).find((m) => !seen.has("announcement-" + m.id));
        if (ann && alive) {
          setMeId(cid);
          setPick({ kind: "announcement", key: "announcement-" + ann.id, announcement: ann });
        }
      } catch {
        /* a takeover must never take the dashboard down */
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const dismiss = useCallback(
    async (then?: () => void) => {
      const key = pick?.key;
      setPick(null);
      try {
        if (meId && key) await supabase.from("client_announcements_seen").insert({ client_id: meId, key });
      } catch {
        /* if the write fails they see it once more — better than a crash */
      }
      then?.();
    },
    [supabase, meId, pick],
  );

  if (!pick) return null;

  const shell = (children: React.ReactNode) => (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "var(--brand-bg)", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      {children}
    </div>
  );

  const primaryBtn: React.CSSProperties = {
    width: "100%",
    padding: 15,
    borderRadius: 14,
    border: "none",
    background: "var(--brand-primary)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
  };
  const quietBtn: React.CSSProperties = {
    width: "100%",
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    border: "1px solid var(--brand-border)",
    background: "transparent",
    color: "var(--brand-text-secondary)",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  };

  // ── WINNER ────────────────────────────────────────────────────────────────
  if (pick.kind === "winner") {
    const w = pick.winner;
    const unit = w.metric === "logging" ? "days logged" : "days trained";
    return shell(
      <>
        <div style={{ background: "var(--grad-hero, var(--brand-primary))", color: "#fff", padding: "calc(30px + env(safe-area-inset-top)) 20px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 50, lineHeight: 1 }}>🏆</div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, opacity: 0.85, marginTop: 10 }}>
            {w.emoji ? w.emoji + " " : ""}
            {w.title.toUpperCase()}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, lineHeight: 1.15 }}>
            {w.winner_is_me ? "You won it." : w.winner_name + " took it."}
          </div>
          {w.winner_score != null && (
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>
              {w.winner_score} {unit}
            </div>
          )}
        </div>

        <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 18px 32px" }}>
          <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 16, padding: 16, textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", fontWeight: 700 }}>Where you finished</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "var(--brand-primary)", lineHeight: 1.1, marginTop: 4 }}>
              {w.my_rank ? "#" + w.my_rank : "—"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--brand-text)", fontWeight: 700 }}>
              {w.my_score} {unit}
            </div>
          </div>

          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--brand-text)", marginBottom: 18, textAlign: "center" }}>
            {w.winner_is_me
              ? "Top of the board. Go collect it in the group chat — and the next one starts today."
              : "A new challenge starts today, everyone back to zero. Go say something in the group chat."}
          </p>

          <button onClick={() => void dismiss(() => router.push(`${basePath}/messages?client=group`))} style={primaryBtn}>
            💬 Open the group chat
          </button>
          <button onClick={() => void dismiss()} style={quietBtn}>
            Back to my dashboard
          </button>
        </div>
      </>,
    );
  }

  // ── ANNOUNCEMENT ──────────────────────────────────────────────────────────
  if (pick.kind === "announcement") {
    const a = pick.announcement;
    return shell(
      <>
        <div style={{ background: "var(--grad-hero, var(--brand-primary))", color: "#fff", padding: "calc(28px + env(safe-area-inset-top)) 20px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, opacity: 0.85 }}>📣 FROM DUSTIN</div>
          <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 6 }}>
            {new Date(a.created_at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </div>
        </div>

        <div style={{ maxWidth: 520, margin: "0 auto", padding: "22px 18px 32px" }}>
          {/* The message as written. whiteSpace: pre-wrap so his line breaks
              survive — a paragraphed announcement rendered as one block reads
              like a wall and gets skipped. */}
          <p style={{ fontSize: 15.5, lineHeight: 1.65, color: "var(--brand-text)", whiteSpace: "pre-wrap", marginBottom: 22 }}>
            {a.body}
          </p>

          <button onClick={() => void dismiss(() => router.push(`${basePath}/messages?client=group&m=${a.id}`))} style={primaryBtn}>
            💬 Reply in the group
          </button>
          <button onClick={() => void dismiss()} style={quietBtn}>
            Got it
          </button>
        </div>
      </>,
    );
  }

  // ── CHALLENGE LAUNCH ──────────────────────────────────────────────────────
  const ch = pick.challenge;
  const unit = ch.metric === "logging" ? "days logged" : "days trained";
  const left = ch.days_left ?? 0;

  const step: React.CSSProperties = { display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5, color: "var(--brand-text)" };
  const num: React.CSSProperties = {
    flex: "0 0 auto", width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center",
    fontSize: 11, fontWeight: 800,
    background: "color-mix(in srgb, var(--brand-primary) 14%, transparent)", color: "var(--brand-primary)",
  };

  async function joinAndGo() {
    if (busy || pick?.kind !== "challenge") return;
    setBusy(true);
    try {
      if (!pick.joined && meId) {
        await supabase.from("challenge_participants").insert({ challenge_id: pick.challenge.id, client_id: meId });
      }
      fx("complete");
    } catch {
      /* unique constraint = already in */
    } finally {
      setBusy(false);
      void dismiss(() => router.push(`${basePath}/messages?client=group`));
    }
  }

  return shell(
    <>
      <div style={{ background: "var(--grad-hero, var(--brand-primary))", color: "#fff", padding: "calc(28px + env(safe-area-inset-top)) 20px 26px", textAlign: "center" }}>
        <div style={{ fontSize: 44, lineHeight: 1 }}>{ch.emoji ?? "🏁"}</div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, opacity: 0.85, marginTop: 10 }}>GROUP CHALLENGE</div>
        <div style={{ fontSize: 25, fontWeight: 900, marginTop: 4, lineHeight: 1.15 }}>{ch.title}</div>
        <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 7 }}>
          {pretty(ch.starts_on)} &ndash; {pretty(ch.ends_on)} · <b>{left > 0 ? `${left} ${left === 1 ? "day" : "days"} left` : "final day"}</b>
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 18px 32px" }}>
        <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-primary)", borderRadius: 16, padding: 16, textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", fontWeight: 700 }}>You&apos;re already on the board</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: "var(--brand-primary)", lineHeight: 1.1, marginTop: 4 }}>{pick.myScore}</div>
          <div style={{ fontSize: 12.5, color: "var(--brand-text)", fontWeight: 700 }}>
            {unit}
            {pick.myRank ? ` · currently #${pick.myRank}` : ""}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
            Everything you&apos;ve logged since {pretty(ch.starts_on)} already counts. You haven&apos;t missed it — you&apos;ve
            been in it the whole time.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <div style={step}>
            <span style={num}>1</span>
            <span><b>Every day you train and log it counts as 1.</b> Two sessions in one day is still one day — this rewards showing up often, not cramming.</span>
          </div>
          <div style={step}>
            <span style={num}>2</span>
            <span><b>Nothing to enter by hand.</b> Your score builds itself from the workouts you&apos;re already logging.</span>
          </div>
          <div style={step}>
            <span style={num}>3</span>
            <span><b>It ranks days shown up.</b> Never weight, never size, never body fat. Newest client can win it.</span>
          </div>
          <div style={step}>
            <span style={num}>4</span>
            <span><b>Highest total when the clock runs out wins.</b> Then a new one starts — every Sunday, from here on out.</span>
          </div>
          <div style={step}>
            <span style={num}>5</span>
            <span><b>The group chat is where it happens.</b> PRs, standings, trash talk. Come say something — that&apos;s the part that actually keeps people going.</span>
          </div>
        </div>

        {pick.total > 0 && (
          <div style={{ fontSize: 12.5, textAlign: "center", color: "var(--brand-text-secondary)", marginBottom: 18, lineHeight: 1.5 }}>
            The group is at <b style={{ color: "var(--brand-text)" }}>{pick.total}</b> {unit} so far
            {pick.people > 0 ? ` across ${pick.people} people` : ""}.
          </div>
        )}

        <button onClick={joinAndGo} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {pick.joined ? "💬 Take me to the group chat" : "🙌 I'm in — open the group chat"}
        </button>
        <button onClick={() => void dismiss()} style={quietBtn}>
          Got it — back to my dashboard
        </button>
      </div>
    </>,
  );
}
