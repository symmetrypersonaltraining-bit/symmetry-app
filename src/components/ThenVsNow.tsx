"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * ThenVsNow — "you vs 3 months ago". 2026-07-25. (#67)
 *
 * Two 30-day windows side by side: the last 30 days, and the 30 days that ended
 * three months back. Sessions, sets, total weight moved, days logged.
 *
 * Why two fixed windows instead of a running chart: a chart asks you to
 * interpret it. Two columns and a delta answer the actual question — am I
 * getting anywhere — in about a second.
 *
 * BEHAVIOUR ONLY. Sessions, sets, volume, days. No weight, no measurements, no
 * body composition. That's a deliberate line across this whole app and it holds
 * here too.
 *
 * HONEST ABOUT THIN DATA — two separate traps, both handled:
 *
 *  1. If the older window is empty the client simply wasn't training here yet.
 *     They're told that, rather than handed a meaningless "+100%".
 *
 *  2. Set-level logging only began 2026-06-25; 320 completed sessions predate
 *     it. So an older window can hold real SESSIONS while holding zero sets and
 *     zero volume. Reporting that difference would tell someone they went from
 *     moving 0 lb to moving 115,000 lb, which is a lie about them — the app
 *     just wasn't recording sets yet. When the older window has sessions but no
 *     sets, those two rows are withheld and the reason is stated. This fixes
 *     itself: once the comparison window sits entirely after set tracking
 *     began, the rows come back on their own.
 *
 * SAFETY: read-only, client-side, caller's own RLS. Renders nothing on failure.
 */

interface Window {
  sessions: number;
  sets: number;
  volume: number;
  daysLogged: number;
}

function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function shift(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

const EMPTY: Window = { sessions: 0, sets: 0, volume: 0, daysLogged: 0 };

function fmt(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 10000) return Math.round(n / 1000) + "k";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(Math.round(n));
}

export default function ThenVsNow({ clientId }: { clientId: string }) {
  const [now, setNow] = useState<Window | null>(null);
  const [then, setThen] = useState<Window>(EMPTY);
  const [tooNew, setTooNew] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    (async () => {
      try {
        const supabase: any = createClient();
        const today = todayCT();
        const nowStart = shift(today, -29);
        const thenEnd = shift(today, -90);
        const thenStart = shift(thenEnd, -29);

        const logs = await supabase
          .from("workout_logs")
          .select("id, log_date")
          .eq("client_id", clientId)
          .eq("completed", true)
          .gte("log_date", thenStart)
          .lte("log_date", today);

        const rows = ((logs.data || []) as { id: string; log_date: string }[]).filter((r) => r.log_date);
        const inNow = rows.filter((r) => r.log_date >= nowStart);
        const inThen = rows.filter((r) => r.log_date >= thenStart && r.log_date <= thenEnd);

        // Nothing at all in the older window means they simply weren't training
        // with us yet. Say that instead of inventing a percentage.
        if (!inThen.length) {
          if (alive) {
            setTooNew(true);
            setNow({
              sessions: new Set(inNow.map((r) => r.log_date)).size,
              sets: 0,
              volume: 0,
              daysLogged: new Set(inNow.map((r) => r.log_date)).size,
            });
          }
          return;
        }

        async function measure(list: { id: string; log_date: string }[]): Promise<Window> {
          const w: Window = {
            sessions: list.length,
            sets: 0,
            volume: 0,
            daysLogged: new Set(list.map((r) => r.log_date)).size,
          };
          const ids = list.map((r) => r.id);
          for (let i = 0; i < ids.length; i += 100) {
            const r = await supabase
              .from("set_logs")
              .select("weight_lbs, reps")
              .in("workout_log_id", ids.slice(i, i + 100))
              .eq("completed", true);
            for (const s of ((r.data || []) as Record<string, unknown>[])) {
              w.sets++;
              w.volume += (Number(s.weight_lbs) || 0) * (Number(s.reps) || 0);
            }
          }
          return w;
        }

        const [a, b] = await Promise.all([measure(inNow), measure(inThen)]);
        if (!alive) return;
        setNow(a);
        setThen(b);
      } catch {
        /* silent */
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (!now) return null;
  if (tooNew && now.sessions === 0) return null;

  // Sessions existed before set tracking did. If the older window logged
  // sessions but not a single set, set-level history simply wasn't being kept
  // then — so those two comparisons are withheld rather than faked.
  const setsTrackedThen = then.sets > 0;

  const METRICS: { label: string; key: keyof Window; fmt: (n: number) => string }[] = [
    { label: "Sessions", key: "sessions", fmt: (n) => String(Math.round(n)) },
    { label: "Days trained", key: "daysLogged", fmt: (n) => String(Math.round(n)) },
    ...(setsTrackedThen
      ? ([
          { label: "Sets", key: "sets" as keyof Window, fmt: (n: number) => String(Math.round(n)) },
          { label: "Lbs moved", key: "volume" as keyof Window, fmt },
        ])
      : []),
  ];

  if (tooNew) {
    return (
      <div
        style={{
          background: "var(--brand-surface)",
          border: "1px solid var(--brand-border)",
          borderRadius: 18,
          padding: "14px 16px",
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)", marginBottom: 4 }}>
          ⏳ You vs 3 months ago
        </div>
        <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", lineHeight: 1.5 }}>
          You weren&apos;t training here three months ago yet, so there&apos;s nothing honest to compare to.
          Keep logging — this fills in on its own, and it&apos;s worth the wait.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--brand-surface)",
        border: "1px solid var(--brand-border)",
        borderRadius: 18,
        padding: "14px 16px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2, gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>📈 You vs 3 months ago</div>
      </div>
      <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginBottom: 11 }}>
        Last 30 days against the same stretch three months back
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {METRICS.map((m) => {
          const a = now[m.key];
          const b = then[m.key];
          const diff = a - b;
          const pct = b > 0 ? Math.round((diff / b) * 100) : null;
          const up = diff > 0;
          const flat = diff === 0;
          const color = flat ? "var(--brand-text-secondary)" : up ? "#22c55e" : "#f59e0b";
          return (
            <div
              key={m.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 11px",
                borderRadius: 12,
                background: "var(--brand-bg)",
                border: "1px solid var(--brand-border)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: "var(--brand-text)" }}>
                {m.label}
              </div>
              <div style={{ textAlign: "right", width: 62, flex: "0 0 auto" }}>
                <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)" }}>{m.fmt(b)}</div>
                <div style={{ fontSize: 9, color: "var(--brand-text-secondary)", opacity: 0.7 }}>then</div>
              </div>
              <div style={{ flex: "0 0 auto", color: "var(--brand-text-secondary)", fontSize: 12 }}>→</div>
              <div style={{ textAlign: "right", width: 66, flex: "0 0 auto" }}>
                <div style={{ fontSize: 14.5, fontWeight: 900, color: "var(--brand-text)" }}>{m.fmt(a)}</div>
                <div style={{ fontSize: 9, color: "var(--brand-text-secondary)", opacity: 0.7 }}>now</div>
              </div>
              <div style={{ width: 52, textAlign: "right", flex: "0 0 auto", fontSize: 11.5, fontWeight: 800, color }}>
                {flat ? "even" : (up ? "+" : "") + (pct != null ? pct + "%" : m.fmt(diff))}
              </div>
            </div>
          );
        })}
      </div>

      {!setsTrackedThen && (
        <div style={{ marginTop: 9, fontSize: 10.5, color: "var(--brand-text-secondary)", lineHeight: 1.45 }}>
          Sets and weight moved aren&apos;t compared yet — set-by-set logging started more recently than
          this window, so there&apos;s nothing real to hold it against. It&apos;ll appear here on its own
          once there&apos;s a full three months of it.
        </div>
      )}
    </div>
  );
}
