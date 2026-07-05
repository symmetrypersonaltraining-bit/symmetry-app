"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return dt.getFullYear() + "-" + p(dt.getMonth() + 1) + "-" + p(dt.getDate());
}
function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return addDays(dateStr, -dt.getDay());
}
function fmtRange(a: string, b: string): string {
  const pa = a.split("-").map(Number);
  const pb = b.split("-").map(Number);
  return MON[pa[1] - 1] + " " + pa[2] + " – " + MON[pb[1] - 1] + " " + pb[2];
}

interface Summary {
  done: number; total: number; thisWeekCount: number;
  nutritionPct: number | null; weightDelta: number | null; streak: number;
  focus: string | null; firstName: string;
  lastWkStart: string; lastWkEnd: string; thisWk: string; thisWkEnd: string;
}

export default function ClientWeekSummary() {
  const [s, setS] = useState<Summary | null>(null);
  const [showBrief, setShowBrief] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const supabase: any = createClient();
        const today = todayCT();
        let clientId: string | null = null;
        let clientName = "";
        let focus: string | null = null;
        try { clientId = new URLSearchParams(window.location.search).get("forClient"); } catch { clientId = null; }
        if (!clientId) {
          const { data: userData } = await supabase.auth.getUser();
          const user = userData ? userData.user : null;
          if (!user) return;
          const col = "id, name, weekly_focus";
          if ((user.email || "") === TRAINER_EMAIL) {
            const { data: c } = await supabase.from("clients").select(col).ilike("name", "%Dustin%").limit(1);
            if (c && c[0]) { clientId = c[0].id; clientName = c[0].name; focus = c[0].weekly_focus; }
          } else {
            const { data: c } = await supabase.from("clients").select(col).eq("auth_user_id", user.id).limit(1);
            if (c && c[0]) { clientId = c[0].id; clientName = c[0].name; focus = c[0].weekly_focus; }
          }
        } else {
          const { data: c } = await supabase.from("clients").select("id, name, weekly_focus").eq("id", clientId).limit(1);
          if (c && c[0]) { clientName = c[0].name; focus = c[0].weekly_focus; }
        }
        if (!clientId || !on) return;

        const thisWk = weekStartOf(today);
        const lastWkStart = addDays(thisWk, -7);
        const lastWkEnd = addDays(thisWk, -1);
        const thisWkEnd = addDays(thisWk, 6);
        const metricWindow = addDays(today, -21);

        const [swLast, swThis, mealsLast, metricsRows, wlogs] = await Promise.all([
          supabase.from("scheduled_workouts").select("status, scheduled_date").eq("client_id", clientId).gte("scheduled_date", lastWkStart).lte("scheduled_date", lastWkEnd),
          supabase.from("scheduled_workouts").select("id").eq("client_id", clientId).gte("scheduled_date", thisWk).lte("scheduled_date", thisWkEnd),
          supabase.from("meal_adherence_logs").select("adherence, log_date").eq("client_id", clientId).gte("log_date", lastWkStart).lte("log_date", lastWkEnd),
          supabase.from("metrics").select("metric_date, weight").eq("client_id", clientId).gte("metric_date", metricWindow).order("metric_date", { ascending: true }),
          supabase.from("workout_logs").select("log_date, completed, status").eq("client_id", clientId).gte("log_date", addDays(today, -60)).order("log_date", { ascending: false }),
        ]);

        const lastRows = swLast.data || [];
        const total = lastRows.length;
        const done = lastRows.filter((r: any) => r.status === "completed").length;
        const thisWeekCount = (swThis.data || []).length;

        const meals = mealsLast.data || [];
        let nutritionPct: number | null = null;
        if (meals.length) {
          const onplan = meals.filter((m: any) => { const a = (m.adherence || "").toLowerCase(); return a === "full" || a === "partial" || a === "on-plan" || a === "on plan"; }).length;
          nutritionPct = Math.round((onplan / meals.length) * 100);
        }

        const mts = (metricsRows.data || []).filter((r: any) => r.weight != null);
        let weightDelta: number | null = null;
        if (mts.length >= 2) weightDelta = +(Number(mts[mts.length - 1].weight) - Number(mts[0].weight)).toFixed(1);

        const doneDates = new Set((wlogs.data || []).filter((w: any) => w.completed || w.status === "completed").map((w: any) => w.log_date));
        let streak = 0;
        let cursor = doneDates.has(today) ? today : addDays(today, -1);
        if (doneDates.has(cursor)) { while (doneDates.has(cursor)) { streak++; cursor = addDays(cursor, -1); } }

        const firstName = (clientName || "").split(" ")[0] || "there";
        if (!on) return;
        setS({ done, total, thisWeekCount, nutritionPct, weightDelta, streak, focus: focus || null, firstName, lastWkStart, lastWkEnd, thisWk, thisWkEnd });

        const hasActivity = total > 0 || meals.length > 0 || streak > 0 || thisWeekCount > 0;
        try {
          const key = "symmetry_weekbrief_v1_" + clientId + "_" + today;
          let isPreview = false;
          try { isPreview = !!new URLSearchParams(window.location.search).get("forClient"); } catch { isPreview = false; }
          if (hasActivity && !isPreview && !localStorage.getItem(key)) { try { localStorage.setItem(key, "1"); } catch { /* ignore */ } setShowBrief(true); }
        } catch { /* ignore */ }
      } catch { /* fail silent -> render nothing */ }
    })();
    return () => { on = false; };
  }, []);

  if (!s) return null;

  function dismissBrief() {
    setShowBrief(false);
  }

  const focusText = s.focus && s.focus.trim() ? s.focus.trim() : null;
  const stat = (n: React.ReactNode, l: string, d?: React.ReactNode) => (
    <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 16, padding: 12 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--brand-text)" }}>{n}</div>
      <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 2 }}>{l}</div>
      {d != null && <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: "#22c55e" }}>{d}</div>}
    </div>
  );

  return (
    <>
      {/* C2 — always-on "This Week" home card */}
      <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 18, padding: 14, boxShadow: "0 8px 26px rgba(20,30,55,0.08)", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>📋 This week</div>
          <div style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>{fmtRange(s.thisWk, s.thisWkEnd)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: focusText || s.thisWeekCount ? 10 : 0 }}>
          <div style={{ flex: 1, textAlign: "center", background: "var(--brand-card)", borderRadius: 11, padding: 7 }}>
            <div style={{ fontWeight: 800, color: "var(--brand-text)" }}>{s.done}/{s.total || 0}</div>
            <div style={{ fontSize: 10, color: "var(--brand-text-secondary)" }}>last wk</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", background: "var(--brand-card)", borderRadius: 11, padding: 7 }}>
            <div style={{ fontWeight: 800, color: "var(--brand-text)" }}>{s.nutritionPct != null ? s.nutritionPct + "%" : "—"}</div>
            <div style={{ fontSize: 10, color: "var(--brand-text-secondary)" }}>nutrition</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", background: "var(--brand-card)", borderRadius: 11, padding: 7 }}>
            <div style={{ fontWeight: 800, color: "var(--brand-text)" }}>{s.streak}🔥</div>
            <div style={{ fontSize: 10, color: "var(--brand-text-secondary)" }}>streak</div>
          </div>
        </div>
        {(focusText || s.thisWeekCount > 0) && (
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "#eef2ff", border: "1px solid #dbe4ff", borderRadius: 14, padding: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,var(--brand-primary),#6366f1)", color: "#fff", fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>DG</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--brand-text)" }}>
              <b>Focus:</b> {focusText || (s.thisWeekCount + " session" + (s.thisWeekCount === 1 ? "" : "s") + " on the calendar this week — let's go.")}
            </div>
          </div>
        )}
      </div>

      {/* C1 — once-weekly full-screen briefing */}
      {showBrief && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "var(--brand-bg)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{ background: "linear-gradient(135deg,#7c9cf5,#8b6ff0)", color: "#fff", padding: "20px 18px 18px" }}>
            <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 600 }}>{fmtRange(s.lastWkStart, s.lastWkEnd).toUpperCase()}</div>
            <div style={{ fontSize: 23, fontWeight: 800, marginTop: 2 }}>Your week in review 💪</div>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {stat(<span>{s.done}<span style={{ fontSize: 14, color: "var(--brand-text-secondary)" }}>/{s.total || 0}</span></span>, "workouts done")}
              {stat(s.nutritionPct != null ? s.nutritionPct + "%" : "—", "nutrition on-plan")}
              {stat(s.weightDelta != null ? (s.weightDelta > 0 ? "+" : "") + s.weightDelta + " lb" : "—", "body weight", s.weightDelta != null && s.weightDelta < 0 ? "▼ trending down" : undefined)}
              {stat(<span>{s.streak}🔥</span>, "day streak")}
            </div>
            <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)", marginTop: 2 }}>This week's focus</div>
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "#eef2ff", border: "1px solid #dbe4ff", borderRadius: 14, padding: 11 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,var(--brand-primary),#6366f1)", color: "#fff", fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>DG</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--brand-text)" }}>
                <b>Dustin:</b> {focusText || ("You've got " + s.thisWeekCount + " session" + (s.thisWeekCount === 1 ? "" : "s") + " scheduled this week. Show up and stack another good one.")}
              </div>
            </div>
            <button onClick={dismissBrief} style={{ display: "block", textAlign: "center", background: "var(--brand-primary)", color: "#fff", fontWeight: 800, padding: 14, borderRadius: 15, fontSize: 15, border: "none", width: "100%", cursor: "pointer", marginTop: "auto" }}>
              Let&apos;s crush it →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
