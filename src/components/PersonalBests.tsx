"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * PersonalBests — every lift's best, one screen. 2026-07-25. (#64)
 *
 * The app already stores every set anyone has ever logged, and until now it
 * never told them what their best was. This is the screen people screenshot.
 *
 * What counts as a "best": the heaviest single completed set of that movement,
 * with the reps done at that weight. Not estimated 1RM — a formula that tells
 * someone they can lift a number they've never touched is a way to get someone
 * hurt, and it isn't a fact about them the way a logged set is.
 *
 * Bodyweight and cardio movements are excluded, because a "best" of 0 lb is
 * noise. Movements with only one logged set are excluded too — one set isn't a
 * best yet, it's a starting point.
 *
 * SAFETY: read-only, client-side, under the caller's own RLS. Renders nothing
 * on failure or when there's nothing worth showing.
 */

interface Best {
  name: string;
  weight: number;
  reps: number;
  date: string;
  sets: number;
  isRecent: boolean; // set in the last 30 days — worth a nudge of colour
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function pretty(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return MON[m - 1] + " " + d;
}
function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function daysAgo(iso: string): number {
  return Math.round((Date.parse(todayCT()) - Date.parse(iso)) / 86400000);
}

type Sort = "weight" | "recent" | "name";

export default function PersonalBests({ clientId }: { clientId: string }) {
  const [bests, setBests] = useState<Best[] | null>(null);
  const [sort, setSort] = useState<Sort>("weight");
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    (async () => {
      try {
        const supabase: any = createClient();

        // Completed sessions first, so a set logged inside an abandoned session
        // can never become someone's "best".
        const logs = await supabase
          .from("workout_logs")
          .select("id, log_date")
          .eq("client_id", clientId)
          .eq("completed", true);
        const rows = ((logs.data || []) as { id: string; log_date: string }[]).filter((r) => r.log_date);
        if (!rows.length) {
          if (alive) setBests([]);
          return;
        }
        const dateOf = new Map(rows.map((r) => [r.id, r.log_date]));

        // Chunked: a long-tenured client can have hundreds of sessions, and an
        // unbounded .in() list eventually blows the query string.
        const ids = rows.map((r) => r.id);
        const best = new Map<string, Best>();
        const setCount = new Map<string, number>();

        for (let i = 0; i < ids.length; i += 100) {
          const slice = ids.slice(i, i + 100);
          const r = await supabase
            .from("set_logs")
            .select("workout_log_id, weight_lbs, reps, exercises(name)")
            .in("workout_log_id", slice)
            .eq("completed", true)
            .gt("weight_lbs", 0);
          for (const s of ((r.data || []) as Record<string, unknown>[])) {
            const name = (((s.exercises as { name?: string } | null)?.name) || "").trim();
            const w = Number(s.weight_lbs) || 0;
            if (!name || w <= 0) continue;
            const reps = Number(s.reps) || 0;
            const date = dateOf.get(s.workout_log_id as string);
            if (!date) continue;

            setCount.set(name, (setCount.get(name) || 0) + 1);
            const cur = best.get(name);
            // Ties go to the EARLIER date — the first time you hit a number is
            // when you set it, not the most recent time you repeated it.
            if (!cur || w > cur.weight || (w === cur.weight && date < cur.date)) {
              best.set(name, { name, weight: w, reps, date, sets: 0, isRecent: false });
            }
          }
        }
        if (!alive) return;

        const out: Best[] = [];
        for (const b of best.values()) {
          const n = setCount.get(b.name) || 0;
          if (n < 2) continue; // one set is a starting point, not a best
          out.push({ ...b, sets: n, isRecent: daysAgo(b.date) <= 30 });
        }
        setBests(out);
      } catch {
        /* silent — a bonus screen must never break Progress */
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId]);

  const sorted = useMemo(() => {
    if (!bests) return [];
    const list = bests.slice();
    if (sort === "weight") list.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
    else if (sort === "recent") list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    else list.sort((a, b) => a.name.localeCompare(b.name));
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((b) => b.name.toLowerCase().includes(needle)) : list;
  }, [bests, sort, q]);

  if (!bests || bests.length === 0) return null;

  const shown = expanded ? sorted : sorted.slice(0, 6);
  const recentCount = bests.filter((b) => b.isRecent).length;

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>🏋️ Personal bests</div>
        <div style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>
          {bests.length} lifts{recentCount > 0 ? " · " + recentCount + " set this month" : ""}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {([["weight", "Heaviest"], ["recent", "Newest"], ["name", "A–Z"]] as const).map(([k, lbl]) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            style={{
              fontSize: 11,
              fontWeight: 800,
              padding: "4px 10px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: sort === k ? "var(--brand-primary)" : "var(--brand-bg)",
              color: sort === k ? "#fff" : "var(--brand-text-secondary)",
            }}
          >
            {lbl}
          </button>
        ))}
        {bests.length > 6 && (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a lift"
            style={{
              flex: 1,
              minWidth: 110,
              fontSize: 11.5,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid var(--brand-border)",
              background: "var(--brand-bg)",
              color: "var(--brand-text)",
            }}
          />
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {shown.map((b) => (
          <div
            key={b.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 11px",
              borderRadius: 12,
              // Was var(--brand-bg) behind a 1px neutral border. Once the page
              // deepened, that background sat within a few percent of the card
              // it lives on, so six lifts read as one list with no edges. A
              // scheme-tinted fill and a scheme-tinted ring separate them, and
              // the left bar still marks "new this month".
              background: "color-mix(in srgb, var(--brand-primary) 6%, var(--brand-surface))",
              border: "1px solid color-mix(in srgb, var(--brand-primary) 30%, var(--brand-border))",
              borderLeft: b.isRecent ? "3px solid var(--brand-primary)" : "3px solid color-mix(in srgb, var(--brand-primary) 30%, var(--brand-border))",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "var(--brand-text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {b.name}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--brand-text-secondary)", marginTop: 2 }}>
                {pretty(b.date)} · {b.sets} sets logged
                {b.isRecent ? " · new this month" : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", flex: "0 0 auto" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "var(--brand-text)", lineHeight: 1.1 }}>
                {Math.round(b.weight)}
                <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}> lb</span>
              </div>
              {b.reps > 0 && (
                <div style={{ fontSize: 10.5, color: "var(--brand-text-secondary)" }}>× {b.reps}</div>
              )}
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", padding: "6px 0" }}>
            Nothing matches that.
          </div>
        )}
      </div>

      {sorted.length > 6 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            width: "100%",
            marginTop: 9,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--brand-primary)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          {expanded ? "Show less ▴" : "Show all " + sorted.length + " ▾"}
        </button>
      )}
    </div>
  );
}
