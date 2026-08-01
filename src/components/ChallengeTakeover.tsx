"use client";

// One-time full-screen announcement, shown to each client exactly once.
//
// The group challenge has been running since 25 July and most of the roster
// never saw it, because it lived behind a bottom-nav tab nobody opened. A card
// on the dashboard would have the same problem: it competes with everything
// else on the page and loses. This does not compete — it is the page, once,
// and then it is never seen again.
//
// "Seen" is tracked per PERSON in client_announcements_seen, not in
// localStorage. localStorage would re-show this on their phone after they
// dismissed it on the iPad, and a full-page takeover that comes back is worse
// than one that never fired.
//
// Everything is defensive: this renders inside the dashboard, so a throw here
// is a broken home screen. Every failure path renders nothing.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fx } from "@/lib/fx";

const KEY = "challenge-launch-2026-08";

interface Challenge {
  id: string;
  title: string;
  emoji: string | null;
  metric: string;
  starts_on: string;
  ends_on: string;
  days_left: number | null;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function pretty(iso: string): string {
  const [, m, d] = (iso || "").split("-").map(Number);
  return MON[m - 1] ? MON[m - 1] + " " + d : iso;
}

export default function ChallengeTakeover({ basePath = "" }: { basePath?: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [show, setShow] = useState(false);
  const [ch, setCh] = useState<Challenge | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [people, setPeople] = useState(0);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: me } = await supabase.rpc("my_client_id");
        const cid = (me as string | null) ?? null;
        if (!cid) return;

        // Already seen? Nothing else needs to happen.
        const { data: seen } = await supabase
          .from("client_announcements_seen")
          .select("key")
          .eq("client_id", cid)
          .eq("key", KEY)
          .maybeSingle();
        if (seen) return;

        const { data: c } = await supabase.from("v_active_challenge").select("*").maybeSingle();
        const chRow = (c as Challenge | null) ?? null;
        if (!chRow) return; // no live challenge — nothing to announce

        const [{ data: rows }, { data: tot }] = await Promise.all([
          supabase.rpc("challenge_leaderboard", { p_challenge_id: chRow.id }),
          supabase.rpc("challenge_group_total", { p_challenge_id: chRow.id }),
        ]);
        const mine = ((rows as { is_me: boolean; rnk: number; score: number }[]) ?? []).find((r) => r.is_me);
        const t = Array.isArray(tot) ? tot[0] : tot;

        if (!alive) return;
        setMeId(cid);
        setCh(chRow);
        setMyScore(Number(mine?.score) || 0);
        setMyRank(mine?.rnk ?? null);
        setTotal(Number(t?.group_total) || 0);
        setPeople(Number(t?.contributors) || 0);
        setJoined(!!t?.joined);
        setShow(true);
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
      setShow(false);
      try {
        if (meId) await supabase.from("client_announcements_seen").insert({ client_id: meId, key: KEY });
      } catch {
        /* if the write fails they see it once more — better than a crash */
      }
      then?.();
    },
    [supabase, meId],
  );

  async function joinAndGo() {
    if (busy || !ch) return;
    setBusy(true);
    try {
      if (!joined && meId) {
        await supabase.from("challenge_participants").insert({ challenge_id: ch.id, client_id: meId });
      }
      fx("complete");
    } catch {
      /* unique constraint = already in */
    } finally {
      setBusy(false);
      void dismiss(() => router.push(`${basePath}/messages?client=group`));
    }
  }

  if (!show || !ch) return null;

  const unit = ch.metric === "logging" ? "days logged" : "days trained";
  const left = ch.days_left ?? 0;

  const step: React.CSSProperties = {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--brand-text)",
  };
  const num: React.CSSProperties = {
    flex: "0 0 auto",
    width: 22,
    height: 22,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    fontWeight: 800,
    background: "color-mix(in srgb, var(--brand-primary) 14%, transparent)",
    color: "var(--brand-primary)",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "var(--brand-bg)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Hero */}
      <div
        style={{
          background: "var(--grad-hero, var(--brand-primary))",
          color: "#fff",
          padding: "calc(28px + env(safe-area-inset-top)) 20px 26px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 44, lineHeight: 1 }}>{ch.emoji ?? "🏁"}</div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, opacity: 0.85, marginTop: 10 }}>
          GROUP CHALLENGE
        </div>
        <div style={{ fontSize: 25, fontWeight: 900, marginTop: 4, lineHeight: 1.15 }}>{ch.title}</div>
        <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 7 }}>
          {pretty(ch.starts_on)} &ndash; {pretty(ch.ends_on)} ·{" "}
          <b>{left > 0 ? `${left} ${left === 1 ? "day" : "days"} left` : "final day"}</b>
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 18px 32px" }}>
        {/* Their own standing — the hook. Nobody reads past a generic pitch. */}
        <div
          style={{
            background: "var(--brand-surface)",
            border: "1px solid var(--brand-primary)",
            borderRadius: 16,
            padding: 16,
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", fontWeight: 700 }}>
            You&apos;re already on the board
          </div>
          <div style={{ fontSize: 38, fontWeight: 900, color: "var(--brand-primary)", lineHeight: 1.1, marginTop: 4 }}>
            {myScore}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--brand-text)", fontWeight: 700 }}>
            {unit}
            {myRank ? ` · currently #${myRank}` : ""}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
            Everything you&apos;ve logged since {pretty(ch.starts_on)} already counts. You haven&apos;t missed it —
            you&apos;ve been in it the whole time.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <div style={step}>
            <span style={num}>1</span>
            <span>
              <b>Every day you train and log it counts as 1.</b> Two sessions in one day is still one day — this
              rewards showing up often, not cramming.
            </span>
          </div>
          <div style={step}>
            <span style={num}>2</span>
            <span>
              <b>Nothing to enter by hand.</b> Your score builds itself from the workouts you&apos;re already logging.
            </span>
          </div>
          <div style={step}>
            <span style={num}>3</span>
            <span>
              <b>It ranks days shown up.</b> Never weight, never size, never body fat. Newest client can win it.
            </span>
          </div>
          <div style={step}>
            <span style={num}>4</span>
            <span>
              <b>Highest total when the clock runs out wins.</b> Then a new one starts — every Sunday, from here on
              out.
            </span>
          </div>
          <div style={step}>
            <span style={num}>5</span>
            <span>
              <b>The group chat is where it happens.</b> PRs, standings, trash talk. Come say something — that&apos;s
              the part that actually keeps people going.
            </span>
          </div>
        </div>

        {total > 0 && (
          <div
            style={{
              fontSize: 12.5,
              textAlign: "center",
              color: "var(--brand-text-secondary)",
              marginBottom: 18,
              lineHeight: 1.5,
            }}
          >
            The group is at <b style={{ color: "var(--brand-text)" }}>{total}</b> {unit} so far
            {people > 0 ? ` across ${people} people` : ""}.
          </div>
        )}

        <button
          onClick={joinAndGo}
          disabled={busy}
          style={{
            width: "100%",
            padding: 15,
            borderRadius: 14,
            border: "none",
            background: "var(--brand-primary)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 800,
            cursor: "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {joined ? "💬 Take me to the group chat" : "🙌 I'm in — open the group chat"}
        </button>

        <button
          onClick={() => void dismiss()}
          style={{
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
          }}
        >
          Got it — back to my dashboard
        </button>
      </div>
    </div>
  );
}
