"use client";

import { useCallback, useEffect, useState } from "react";
import ShareToGroup from "@/components/ShareToGroup";
import { FunLoader } from "@/components/FunMoments";
import { fx } from "@/lib/fx";

/**
 * Leaderboard — opt-in community consistency board. 2026-07-25.
 *
 * Ranks days trained, never weight or body composition, so nobody is penalised
 * for being new or smaller. Opt-in defaults to OFF; a client only appears once
 * they choose to. Self-contained: one fetch, local state, no props required.
 *
 * Mount anywhere with <Leaderboard />. Revert = remove the mount.
 */
type Row = { first: string; sessions: number; rank: number; isMe: boolean };
type Data = { rows: Row[]; me: { rank: number; sessions: number } | null; optedIn: boolean; total: number; window: number };

export default function Leaderboard() {
  const [win, setWin] = useState<7 | 30>(7);
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (w: 7 | 30) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?window=${w}`);
      if (res.ok) setD((await res.json()) as Data);
    } catch {
      /* leave previous data on screen rather than blanking it */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(win);
  }, [win, load]);

  const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : `${r}`);

  return (
    <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 18, overflow: "hidden" }}>
      <div style={{ background: "var(--grad-hero, var(--brand-primary))", padding: "14px 16px", color: "#fff" }}>
        <div style={{ fontSize: 15, fontWeight: 900 }}>Consistency Board</div>
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Days trained — not weight, not size. Just showing up.</div>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "10px 14px 4px" }}>
        {([7, 30] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => {
              setWin(w);
              fx("tap");
            }}
            style={{
              border: "1px solid var(--brand-border)",
              background: win === w ? "var(--brand-primary)" : "var(--brand-surface)",
              color: win === w ? "#fff" : "var(--brand-text)",
              borderRadius: 20,
              padding: "5px 13px",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {w} days
          </button>
        ))}
      </div>

      {loading && !d ? (
        <FunLoader label="Counting who showed up…" />
      ) : !d || !d.rows.length ? (
        <div style={{ padding: "26px 18px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--brand-text)" }}>Nobody's on the board yet</div>
          <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)", marginTop: 5, lineHeight: 1.6 }}>
            It's opt-in — turn it on in Settings and you'll show up here.
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: "6px 8px 10px" }}>
            {d.rows.map((r) => (
              <div
                key={`${r.rank}-${r.first}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "9px 12px",
                  borderRadius: 12,
                  background: r.isMe ? "var(--brand-accent-soft, rgba(0,0,0,.04))" : "transparent",
                  fontWeight: r.isMe ? 800 : 500,
                }}
              >
                <div style={{ width: 26, textAlign: "center", fontSize: r.rank <= 3 ? 16 : 12.5, color: "var(--brand-text-secondary)" }}>
                  {medal(r.rank)}
                </div>
                <div style={{ flex: 1, fontSize: 13.5, color: "var(--brand-text)" }}>
                  {r.first}
                  {r.isMe ? " (you)" : ""}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--brand-text)", fontVariantNumeric: "tabular-nums" }}>
                  {r.sessions}
                </div>
              </div>
            ))}
          </div>

          {d.me ? (
            <div style={{ padding: "0 14px 14px" }}>
              <ShareToGroup
                text={`📊 ${d.window}-day consistency: ${d.me.sessions} days trained — currently #${d.me.rank} of ${d.total}. Who's catching me?`}
                label="Post my streak"
                style={{ width: "100%", padding: "10px 0", fontSize: 13 }}
              />
            </div>
          ) : d.optedIn ? null : (
            <div style={{ padding: "0 14px 14px", fontSize: 11.5, color: "var(--brand-text-secondary)", textAlign: "center" }}>
              You're not on the board — opt in from Settings to join.
            </div>
          )}
        </>
      )}
    </div>
  );
}
