"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * LiveSessions — who's in the gym right now. Trainer home. 2026-07-25. (#77)
 *
 * Sits above the attention feed, because someone training this minute is more
 * immediately useful than someone who went quiet last Tuesday.
 *
 * Polls every 45s while the tab is visible and stops entirely when it isn't —
 * a card nobody is looking at shouldn't be hitting the database every minute
 * on a phone in someone's pocket.
 *
 * Renders nothing when nobody is training, which is most of the day. That's the
 * intended resting state, not a bug.
 *
 * SAFETY: read-only, trainer-only (the API 403s anyone else), and the workout
 * logger is not touched — this reads rows the logger already writes.
 */

interface Row {
  clientId: string;
  name: string;
  workout: string | null;
  startedMinutesAgo: number;
  lastSetMinutesAgo: number | null;
  sets: number;
  volume: number;
  active: boolean;
}

const POLL_MS = 45000;

function dur(min: number): string {
  if (min < 60) return min + "m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? h + "h " + m + "m" : h + "h";
}

export default function LiveSessions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/live-sessions", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setRows(Array.isArray(j?.rows) ? (j.rows as Row[]) : []);
    } catch {
      /* silent — never break the home screen over a nice-to-have */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let timer: number | null = null;

    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };

    void load();
    timer = window.setInterval(tick, POLL_MS);

    // Refresh immediately when the tab comes back, so returning to the app
    // never shows a stale "training now" from twenty minutes ago.
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  if (!loaded || rows.length === 0) return null;

  const activeCount = rows.filter((r) => r.active).length;

  return (
    <div
      style={{
        background: "var(--brand-surface)",
        border: "1px solid var(--brand-border)",
        borderRadius: 18,
        boxShadow: "0 8px 26px rgba(20,30,55,0.08)",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: activeCount > 0 ? "#22c55e" : "var(--brand-text-secondary)",
              animation: activeCount > 0 ? "cw-live-pulse 1.8s ease-in-out infinite" : undefined,
              flex: "0 0 auto",
            }}
          />
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>Training right now</div>
        </div>
        <div style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>
          {rows.length} in session{activeCount !== rows.length ? " · " + activeCount + " active" : ""}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {rows.map((r) => (
          <Link
            key={r.clientId + r.startedMinutesAgo}
            href={"/clients/" + r.clientId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 11px",
              borderRadius: 12,
              background: "var(--brand-bg)",
              border: "1px solid var(--brand-border)",
              borderLeft: "3px solid " + (r.active ? "#22c55e" : "var(--brand-border)"),
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand-text)" }}>
                {r.name}
                {r.workout ? (
                  <span style={{ fontWeight: 600, color: "var(--brand-text-secondary)" }}>{" · " + r.workout}</span>
                ) : null}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--brand-text-secondary)", marginTop: 2 }}>
                {dur(r.startedMinutesAgo)} in
                {r.sets > 0 ? " · " + r.sets + " sets · " + r.volume.toLocaleString() + " lb" : " · no sets yet"}
                {!r.active && r.lastSetMinutesAgo != null ? " · quiet " + dur(r.lastSetMinutesAgo) : ""}
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                padding: "3px 8px",
                borderRadius: 999,
                flex: "0 0 auto",
                background: r.active ? "rgba(34,197,94,0.16)" : "rgba(140,150,180,0.16)",
                color: r.active ? "#22c55e" : "var(--brand-text-secondary)",
              }}
            >
              {r.active ? "LIVE" : "IDLE"}
            </span>
          </Link>
        ))}
      </div>
      <style>{"@keyframes cw-live-pulse{0%,100%{opacity:1}50%{opacity:.35}}"}</style>
    </div>
  );
}
