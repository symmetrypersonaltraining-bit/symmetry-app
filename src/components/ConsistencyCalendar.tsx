"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * ConsistencyCalendar — the GitHub-style heat grid. 2026-07-25.
 *
 * 26 weeks of history, one square per day, darker = more work that day.
 * Two modes: Workouts (completed workout_logs) and Nutrition (real meal logs).
 *
 * The point is emotional, not analytical: a wall of squares makes a gap
 * obvious in a way a number never does, and it makes a long run feel like
 * something you don't want to break.
 *
 * SAFETY: read-only, client-side, reads with the caller's own RLS. If either
 * query fails the card renders nothing rather than an error state.
 */

const WEEKS = 26;
const CELL = 11;
const GAP = 3;
const DOW = ["", "M", "", "W", "", "F", ""];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function dowOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function pretty(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return MON[m - 1] + " " + d;
}

type Mode = "workouts" | "nutrition";

interface Props {
  clientId: string;
  /** Shown in the empty/summary copy. Defaults to second person. */
  name?: string;
}

export default function ConsistencyCalendar({ clientId, name }: Props) {
  const [mode, setMode] = useState<Mode>("workouts");
  const [workouts, setWorkouts] = useState<Record<string, number> | null>(null);
  const [meals, setMeals] = useState<Record<string, number> | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const today = todayCT();
  // Grid starts on the Sunday of the week that is WEEKS-1 weeks back, so the
  // last column is always the current week and columns line up as whole weeks.
  const start = useMemo(() => addDays(today, -(dowOf(today) + (WEEKS - 1) * 7)), [today]);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    (async () => {
      try {
        const supabase: any = createClient();
        const [wl, ml] = await Promise.all([
          supabase
            .from("workout_logs")
            .select("log_date")
            .eq("client_id", clientId)
            .eq("completed", true)
            .gte("log_date", start)
            .lte("log_date", today),
          supabase
            .from("meal_adherence_logs")
            .select("log_date, adherence")
            .eq("client_id", clientId)
            .not("adherence", "is", null)
            .gte("log_date", start)
            .lte("log_date", today),
        ]);
        if (!alive) return;
        const w: Record<string, number> = {};
        for (const r of (wl.data || [])) w[r.log_date] = (w[r.log_date] || 0) + 1;
        const m: Record<string, number> = {};
        for (const r of (ml.data || [])) m[r.log_date] = (m[r.log_date] || 0) + 1;
        setWorkouts(w);
        setMeals(m);
      } catch {
        /* silent — a progress extra must never break the page */
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId, start, today]);

  const data = mode === "workouts" ? workouts : meals;

  const stats = useMemo(() => {
    if (!data) return null;
    const days = Object.keys(data);
    const total = days.reduce((a, k) => a + data[k], 0);
    // Weeks (Sun-start) containing at least one logged day, counted back from
    // the current week — "how many weeks in a row have you shown up".
    let streak = 0;
    for (let wk = 0; wk < WEEKS; wk++) {
      const wkStart = addDays(today, -(dowOf(today) + wk * 7));
      let hit = false;
      for (let i = 0; i < 7; i++) {
        const d = addDays(wkStart, i);
        if (d > today) break;
        if (data[d]) { hit = true; break; }
      }
      // The current week is allowed to be empty early on (it's Monday, say)
      // without killing a real streak.
      if (hit) streak++;
      else if (wk === 0) continue;
      else break;
    }
    let best = 0;
    for (let wk = 0; wk < WEEKS; wk++) {
      const wkStart = addDays(today, -(dowOf(today) + wk * 7));
      let n = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(wkStart, i);
        if (d > today) break;
        if (data[d]) n++;
      }
      if (n > best) best = n;
    }
    return { total, activeDays: days.filter((k) => data[k] > 0).length, streak, best };
  }, [data, today]);

  if (!data || !stats) return null;

  const unit = mode === "workouts" ? "sessions" : "meals logged";
  const baseColor = mode === "workouts" ? "34,197,94" : "245,158,11"; // green / amber
  const maxPerDay = mode === "workouts" ? 2 : 4;

  const shade = (n: number): string => {
    if (!n) return "var(--brand-border)";
    const step = Math.min(n / maxPerDay, 1);
    const alpha = 0.35 + step * 0.65;
    return "rgba(" + baseColor + "," + alpha.toFixed(2) + ")";
  };

  const columns: string[][] = [];
  for (let wk = 0; wk < WEEKS; wk++) {
    const col: string[] = [];
    for (let i = 0; i < 7; i++) col.push(addDays(start, wk * 7 + i));
    columns.push(col);
  }

  // Month labels above the columns where a new month begins.
  const monthLabels = columns.map((col, i) => {
    const first = col[0];
    const mo = Number(first.split("-")[1]);
    const prev = i === 0 ? null : Number(columns[i - 1][0].split("-")[1]);
    return prev === null || mo !== prev ? MON[mo - 1] : "";
  });

  const who = name ? name.split(" ")[0] : null;

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>
          🔥 Consistency
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["workouts", "nutrition"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setPicked(null); }}
              style={{
                fontSize: 11,
                fontWeight: 800,
                padding: "4px 10px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                textTransform: "capitalize",
                background: mode === m ? "var(--brand-primary)" : "var(--brand-bg)",
                color: mode === m ? "#fff" : "var(--brand-text-secondary)",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
        <div style={{ display: "inline-block", minWidth: "100%" }}>
          {/* Month row */}
          <div style={{ display: "flex", gap: GAP, marginLeft: 14, marginBottom: 3 }}>
            {monthLabels.map((lbl, i) => (
              <div
                key={i}
                style={{ width: CELL, fontSize: 8.5, color: "var(--brand-text-secondary)", whiteSpace: "nowrap", overflow: "visible" }}
              >
                {lbl}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: GAP }}>
            {/* Day-of-week gutter */}
            <div style={{ display: "flex", flexDirection: "column", gap: GAP, width: 11 }}>
              {DOW.map((d, i) => (
                <div
                  key={i}
                  style={{ height: CELL, fontSize: 8.5, lineHeight: CELL + "px", color: "var(--brand-text-secondary)" }}
                >
                  {d}
                </div>
              ))}
            </div>

            {columns.map((col, ci) => (
              <div key={ci} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                {col.map((d) => {
                  const future = d > today;
                  const n = data[d] || 0;
                  return (
                    <button
                      key={d}
                      onClick={() => setPicked(picked === d ? null : d)}
                      aria-label={pretty(d) + ": " + n + " " + unit}
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 2.5,
                        padding: 0,
                        cursor: future ? "default" : "pointer",
                        border: picked === d ? "1.5px solid var(--brand-primary)" : "none",
                        background: future ? "transparent" : shade(n),
                        opacity: future ? 0.35 : 1,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 9.5, color: "var(--brand-text-secondary)" }}>
        <span>Less</span>
        {[0, 1, maxPerDay].map((n, i) => (
          <span key={i} style={{ width: 9, height: 9, borderRadius: 2, background: shade(n), display: "inline-block" }} />
        ))}
        <span>More</span>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "var(--brand-text-secondary)", lineHeight: 1.5 }}>
        {picked ? (
          <span style={{ color: "var(--brand-text)", fontWeight: 700 }}>
            {pretty(picked)} — {data[picked] || 0} {unit}
          </span>
        ) : stats.total === 0 ? (
          <>No {mode === "workouts" ? "sessions" : "meal logs"} in the last {WEEKS} weeks yet. First square is the hardest.</>
        ) : (
          <>
            <b style={{ color: "var(--brand-text)" }}>{stats.total}</b> {unit} over{" "}
            <b style={{ color: "var(--brand-text)" }}>{stats.activeDays}</b> days ·{" "}
            <b style={{ color: "var(--brand-text)" }}>{stats.streak}</b> week
            {stats.streak === 1 ? "" : "s"} in a row · best week{" "}
            <b style={{ color: "var(--brand-text)" }}>{stats.best}</b> day
            {stats.best === 1 ? "" : "s"}
            {who ? " · " + who : ""}
          </>
        )}
      </div>
    </div>
  );
}
