"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * AttentionFeed — "Who needs you today". Trainer home, 2026-07-25.
 *
 * Reads /api/attention, which applies the SAME segmentation the nudge engine
 * uses. That's deliberate: the trainer's list and the automated check-ins can
 * never disagree about who is slipping, because there is one rule set.
 *
 * Deliberately compact. The Week ahead card below it is the full roster with
 * focus editing; this is the short "act on these first" strip, ranked by
 * severity. Collapsed to the top 3 until tapped.
 *
 * SAFETY: read-only. It never writes, never messages anyone, and if the fetch
 * fails for any reason it renders nothing at all rather than an error state.
 */

interface Row {
  id: string;
  name: string;
  reason: string;
  detail: string;
  severity: 1 | 2 | 3;
  tag: string;
}

const SEV_COLOR: Record<number, string> = {
  3: "#ef4444",
  2: "#f59e0b",
  1: "#7c9cf5",
};

const TAG_ICON: Record<string, string> = {
  escalate: "ti-alert-triangle",
  onboard: "ti-user-plus",
  rest: "ti-bed",
  quiet: "ti-clock-pause",
  slipping: "ti-trending-down",
  nutrition: "ti-salad",
};

export default function AttentionFeed() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/attention", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        setRows(Array.isArray(json?.rows) ? (json.rows as Row[]) : []);
      } catch {
        /* silent — this card is a convenience, never a blocker */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // "Handled" is a per-day, local-only dismissal. Nothing is written to the
  // database, so tomorrow's list is computed fresh from real activity.
  useEffect(() => {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const raw = window.localStorage.getItem("symmetry_attention_done");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { day?: string; ids?: string[] };
      if (parsed && parsed.day === today && Array.isArray(parsed.ids)) setDone(parsed.ids);
    } catch {
      /* ignore */
    }
  }, []);

  function markHandled(id: string) {
    setDone((prev) => {
      const next = prev.includes(id) ? prev : prev.concat(id);
      try {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        window.localStorage.setItem("symmetry_attention_done", JSON.stringify({ day: today, ids: next }));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  if (!rows) return null;

  const live = rows.filter((r) => !done.includes(r.id));
  if (live.length === 0) return null;

  const urgent = live.filter((r) => r.severity === 3).length;
  const shown = expanded ? live : live.slice(0, 3);

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
        <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>
          👀 Who needs you today
        </div>
        <div style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>
          {live.length} flagged{urgent > 0 ? " · " + urgent + " urgent" : ""}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.map((r) => {
          const color = SEV_COLOR[r.severity] || SEV_COLOR[1];
          const icon = TAG_ICON[r.tag] || "ti-alert-circle";
          return (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 11px",
                borderRadius: 13,
                background: "var(--brand-bg)",
                border: "1px solid var(--brand-border)",
                borderLeft: "3px solid " + color,
              }}
            >
              <i className={"ti " + icon} style={{ color: color, fontSize: 16, marginTop: 1, flex: "0 0 auto" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--brand-text)" }}>
                  {r.name}
                  <span style={{ color: color, fontWeight: 700 }}>{" · " + r.reason}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginTop: 2, lineHeight: 1.35 }}>
                  {r.detail}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 7 }}>
                  <Link
                    href={"/messages?client=" + r.id}
                    style={{ fontSize: 11.5, fontWeight: 800, color: "var(--brand-primary)", textDecoration: "none" }}
                  >
                    Message →
                  </Link>
                  <Link
                    href={"/clients/" + r.id}
                    style={{ fontSize: 11.5, fontWeight: 800, color: "var(--brand-text-secondary)", textDecoration: "none" }}
                  >
                    Open profile
                  </Link>
                  <button
                    onClick={() => markHandled(r.id)}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: "var(--brand-text-secondary)",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      marginLeft: "auto",
                    }}
                  >
                    Handled ✓
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {live.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            width: "100%",
            textAlign: "center",
            marginTop: 9,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--brand-primary)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          {expanded ? "Show less ▴" : "Show all " + live.length + " ▾"}
        </button>
      )}
    </div>
  );
}
