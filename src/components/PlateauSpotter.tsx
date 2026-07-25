"use client";

import { useEffect, useState } from "react";

/**
 * PlateauSpotter — lifts that haven't gone up in a month. 2026-07-25.
 *
 * TRAINER ONLY. Mounted on the client profile, never on a client-facing screen.
 * The API enforces this too (403 for anyone but the trainer), so the guard
 * doesn't depend on where it happens to be mounted.
 *
 * This is a programming prompt, not a scoreboard. A lift holding steady during
 * a cut or a rehab block is correct — the copy is deliberately neutral ("hasn't
 * moved"), never "stalled" or "failing".
 *
 * Read-only. Renders nothing when there is nothing to flag.
 */

interface Row {
  exercise: string;
  best: number;
  reps: number;
  lastIncrease: string | null;
  daysStuck: number;
  sessionsSince: number;
  totalSessions: number;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function pretty(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-").map(Number);
  return MON[m - 1] + " " + d;
}

export default function PlateauSpotter({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/plateaus?clientId=" + encodeURIComponent(clientId), { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        setRows(Array.isArray(json?.rows) ? (json.rows as Row[]) : []);
      } catch {
        /* silent — a coaching hint must never break the profile page */
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (!rows || rows.length === 0) return null;

  const shown = expanded ? rows : rows.slice(0, 4);

  return (
    <div
      style={{
        margin: "12px 16px 0",
        background: "var(--brand-surface)",
        border: "1px solid var(--brand-border)",
        borderRadius: 16,
        padding: "13px 15px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: "var(--brand-text)" }}>
          📉 Lifts that haven&apos;t moved
        </div>
        <div style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>{rows.length} flagged</div>
      </div>
      <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginBottom: 10, lineHeight: 1.4 }}>
        Top weight is unchanged for a month or more, and they&apos;ve trained it since. Worth a load bump, a
        rep-range change, or a swap — unless it&apos;s holding on purpose.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {shown.map((r) => {
          const weeks = Math.floor(r.daysStuck / 7);
          const hot = r.daysStuck >= 56;
          return (
            <div
              key={r.exercise}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 11px",
                borderRadius: 12,
                background: "var(--brand-bg)",
                border: "1px solid var(--brand-border)",
                borderLeft: "3px solid " + (hot ? "#ef4444" : "#f59e0b"),
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.exercise}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--brand-text-secondary)", marginTop: 2 }}>
                  {r.sessionsSince} session{r.sessionsSince === 1 ? "" : "s"} since · last PR {pretty(r.lastIncrease)}
                </div>
              </div>
              <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--brand-text)" }}>
                  {Math.round(r.best)} lb{r.reps ? " × " + r.reps : ""}
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: hot ? "#ef4444" : "#f59e0b" }}>
                  {weeks} wk{weeks === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {rows.length > 4 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            width: "100%",
            marginTop: 8,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--brand-primary)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          {expanded ? "Show less ▴" : "Show all " + rows.length + " ▾"}
        </button>
      )}
    </div>
  );
}
