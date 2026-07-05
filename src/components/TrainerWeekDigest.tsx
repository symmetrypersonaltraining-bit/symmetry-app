"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
}
function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return addDays(dateStr, -dt.getDay());
}
function prettyDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return MON[m - 1] + " " + d;
}
function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/);
  const a = parts[0] ? parts[0][0] : "";
  const b = parts[1] ? parts[1][0] : "";
  return ((a + b).toUpperCase()) || "?";
}

interface Row {
  id: string; name: string; done: number; total: number; nutPct: number | null;
  daysSinceLog: number; everLogsFood: boolean; foodThisWeek: boolean;
  focus: string | null; risk: "r" | "a" | "g"; status: string;
}

// Generate up to 3 tailored focus suggestions from a client's actual gaps.
// Food suggestions ONLY for clients who actually log food (never for never-loggers).
function suggestFocus(r: Row): string[] {
  const s: string[] = [];
  const total = r.total || 0;
  if (r.daysSinceLog >= 6) {
    s.push("Let's get you back in the app — open it daily and log a workout so we stay on track.");
    s.push("First priority this week: get in and log a session. Consistency is where results come from.");
  } else if (r.daysSinceLog >= 3) {
    s.push("Get back to daily check-ins — log each workout as you finish it this week.");
    s.push("Stay consistent this week: hit your scheduled sessions and log every one.");
  } else if (total > 0 && r.done < total) {
    s.push("Great start — finish out all " + total + " sessions this week and log each one.");
    s.push("Keep the momentum going and log every workout so we can track your progress.");
  } else {
    s.push("Strong consistency — keep showing up and logging everything this week.");
    s.push("Dial in your form and log your sets so we can push your weights next week.");
  }
  if (r.everLogsFood) {
    if (!r.foodThisWeek) s.push("You've logged meals before — get back to it this week so we can fine-tune your nutrition.");
    else if (r.nutPct != null && r.nutPct < 70) s.push("Tighten up the nutrition this week — aim to stay on-plan with your meals.");
    else s.push("Keep logging your meals — that nutrition consistency is paying off.");
  }
  s.push("Check the app daily this week — messages, group chat, and your workouts are all in there.");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of s) { if (!seen.has(x)) { seen.add(x); out.push(x); } if (out.length === 3) break; }
  return out;
}

export default function TrainerWeekDigest() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showPop, setShowPop] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const supabase: any = createClient();
        const today = todayCT();
        const thisWk = weekStartOf(today);
        const thisWkEnd = addDays(thisWk, 6);
        const recent = addDays(today, -14);
        const foodWindow = addDays(today, -180);

        const [clientsRes, swThis, wlogs, mealsWeek, foodEver] = await Promise.all([
          supabase.from("clients").select("id, name, weekly_focus, digest_snoozed_until"),
          supabase.from("scheduled_workouts").select("client_id").gte("scheduled_date", thisWk).lte("scheduled_date", thisWkEnd),
          supabase.from("workout_logs").select("client_id, log_date, completed, status").gte("log_date", recent),
          supabase.from("meal_adherence_logs").select("client_id, adherence, log_date").gte("log_date", thisWk).lte("log_date", today),
          supabase.from("meal_adherence_logs").select("client_id").gte("log_date", foodWindow).limit(10000),
        ]);

        const clients = clientsRes.data || [];
        const thisTotal: Record<string, number> = {};
        const lastLog: Record<string, string> = {};
        const weekDone: Record<string, Set<string>> = {};
        const mealsByC: Record<string, { on: number; tot: number }> = {};
        const foodEverSet = new Set<string>();

        for (const w of (swThis.data || [])) { thisTotal[w.client_id] = (thisTotal[w.client_id] || 0) + 1; }
        for (const l of (wlogs.data || [])) {
          if (l.completed || l.status === "completed") {
            const c = lastLog[l.client_id];
            if (!c || l.log_date > c) lastLog[l.client_id] = l.log_date;
            if (l.log_date >= thisWk && l.log_date <= today) (weekDone[l.client_id] = weekDone[l.client_id] || new Set<string>()).add(l.log_date);
          }
        }
        for (const m of (mealsWeek.data || [])) { const k = m.client_id; (mealsByC[k] = mealsByC[k] || { on: 0, tot: 0 }); mealsByC[k].tot++; const a = (m.adherence || "").toLowerCase(); if (a === "full" || a === "partial" || a === "on-plan" || a === "on plan") mealsByC[k].on++; }
        for (const f of (foodEver.data || [])) foodEverSet.add(f.client_id);

        const out: Row[] = [];
        for (const c of clients) {
          if (/dustin/i.test(c.name || "")) continue;
          if (c.digest_snoozed_until && c.digest_snoozed_until >= today) continue;
          const total = thisTotal[c.id] || 0;
          const done = weekDone[c.id] ? weekDone[c.id].size : 0;
          const ll = lastLog[c.id];
          const daysSinceLog = ll ? daysBetween(ll, today) : 999;
          const mb = mealsByC[c.id];
          const nutPct = mb && mb.tot ? Math.round((mb.on / mb.tot) * 100) : null;
          if (total === 0 && done === 0 && daysSinceLog > 13) continue;
          let risk: "r" | "a" | "g" = "g";
          if (daysSinceLog >= 6) risk = "r";
          else if (daysSinceLog >= 3 || (nutPct != null && nutPct < 60)) risk = "a";
          let status: string;
          if (risk === "r") status = "no logs in " + (daysSinceLog > 13 ? "14+" : daysSinceLog) + "d — reach out";
          else if (risk === "a") status = "quiet " + daysSinceLog + "d" + (nutPct != null ? " · nutrition " + nutPct + "%" : "");
          else status = (done > 0 ? done + "/" + (total || 0) + " this wk · " : "") + "on track";
          out.push({ id: c.id, name: c.name, done, total, nutPct, daysSinceLog, everLogsFood: foodEverSet.has(c.id), foodThisWeek: !!mb, focus: c.weekly_focus || null, risk, status });
        }
        const order: Record<string, number> = { r: 0, a: 1, g: 2 };
        out.sort((a, b) => (order[a.risk] - order[b.risk]) || b.daysSinceLog - a.daysSinceLog || a.name.localeCompare(b.name));
        if (!on) return;
        setRows(out);
        try {
          const dow = new Date(today + "T00:00:00").getDay();
          const key = "symmetry_trainerdigest_v1_" + thisWk;
          if (dow === 1 && out.length && !localStorage.getItem(key)) setShowPop(true);
        } catch { /* ignore */ }
      } catch { /* fail silent -> render nothing */ }
    })();
    return () => { on = false; };
  }, []);

  if (!rows) return null;

  async function saveFocus(id: string) {
    if (saving) return;
    setSaving(true);
    try {
      const supabase: any = createClient();
      const val = draft.trim();
      await supabase.from("clients").update({ weekly_focus: val || null }).eq("id", id);
      setRows((rs) => (rs ? rs.map((r) => (r.id === id ? { ...r, focus: val || null } : r)) : rs));
      setEditing(null); setDraft("");
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }
  async function dismissClient(id: string) {
    const until = addDays(todayCT(), 7);
    setRows((rs) => (rs ? rs.filter((r) => r.id !== id) : rs));
    if (editing === id) { setEditing(null); setDraft(""); }
    try {
      const supabase: any = createClient();
      await supabase.from("clients").update({ digest_snoozed_until: until }).eq("id", id);
    } catch { /* ignore */ }
  }
  function dismissPop() {
    try { localStorage.setItem("symmetry_trainerdigest_v1_" + weekStartOf(todayCT()), "1"); } catch { /* ignore */ }
    setShowPop(false);
  }

  const dotColor = (r: string) => (r === "r" ? "#ef4444" : r === "a" ? "#f59e0b" : "#22c55e");
  const activeCount = rows.length;
  const needCount = rows.filter((r) => r.risk === "r").length;

  const renderRoster = (list: Row[]) => (
    <div>
      {list.map((r) => (
        <div key={r.id} style={{ borderBottom: "1px solid var(--brand-border)", padding: "10px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: dotColor(r.risk), flex: "0 0 auto" }} />
            <span style={{ width: 34, height: 34, borderRadius: 999, background: "linear-gradient(135deg,var(--brand-primary),#6366f1)", color: "#fff", fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{initials(r.name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--brand-text)" }}>{r.name}</div>
              <div style={{ fontSize: 11, color: dotColor(r.risk) }}>{r.status}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
              <button onClick={() => { setEditing(editing === r.id ? null : r.id); setDraft(r.focus || ""); }} style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-primary)", background: "none", border: "1px dashed var(--brand-primary)", borderRadius: 9, padding: "4px 8px", cursor: "pointer" }}>{r.focus ? "Focus ✎" : "+ focus"}</button>
              <button onClick={() => dismissClient(r.id)} title="Dismiss — temporarily out (hides from Week ahead for a week)" style={{ fontSize: 14, fontWeight: 700, lineHeight: 1, color: "var(--brand-text-secondary)", background: "none", border: "1px solid var(--brand-border)", borderRadius: 999, width: 24, height: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
          </div>
          {r.focus && editing !== r.id && (
            <div style={{ marginLeft: 54, marginTop: 6, fontSize: 12, color: "var(--brand-text-secondary)", fontStyle: "italic" }}>“{r.focus}”</div>
          )}
          {editing === r.id && (
            <div style={{ marginLeft: 54, marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-text-secondary)", marginBottom: 5 }}>Suggested — tap to use, then tweak:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                {suggestFocus(r).map((sug, i) => (
                  <button key={i} onClick={() => setDraft(sug)} style={{ textAlign: "left", fontSize: 12, lineHeight: 1.4, color: "var(--brand-text)", background: "var(--brand-bg)", border: "1px solid var(--brand-border)", borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}>{sug}</button>
                ))}
              </div>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Pick one above or write your own…" style={{ width: "100%", fontSize: 12.5, padding: 8, borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button onClick={() => saveFocus(r.id)} disabled={saving} style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "var(--brand-primary)", border: "none", borderRadius: 9, padding: "5px 12px", cursor: "pointer" }}>{saving ? "Saving…" : "Save"}</button>
                <button onClick={() => { setEditing(null); setDraft(""); }} style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 18, boxShadow: "0 8px 26px rgba(20,30,55,0.08)", padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>📋 Week ahead</div>
          <div style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>{activeCount} active · {needCount} need a check-in</div>
        </div>
        {renderRoster(expanded ? rows : rows.slice(0, 3))}
        {rows.length > 3 && (
          <button onClick={() => setExpanded((v) => !v)} style={{ width: "100%", textAlign: "center", marginTop: 8, fontSize: 12, fontWeight: 700, color: "var(--brand-primary)", background: "none", border: "none", cursor: "pointer" }}>
            {expanded ? "Show less ▴" : "Show all " + rows.length + " ▾"}
          </button>
        )}
      </div>

      {showPop && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "var(--brand-bg)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{ background: "linear-gradient(135deg,#7c9cf5,#8b6ff0)", color: "#fff", padding: "20px 18px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 600 }}>MONDAY BRIEFING</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>Your week — {prettyDate(weekStartOf(todayCT()))}</div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>{activeCount} active · {needCount} need a check-in</div>
            </div>
            <button onClick={dismissPop} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 20, width: 32, height: 32, borderRadius: 999, cursor: "pointer", flex: "0 0 auto" }}>×</button>
          </div>
          <div style={{ padding: "6px 16px 16px", flex: 1 }}>
            {renderRoster(rows)}
            <button onClick={dismissPop} style={{ display: "block", width: "100%", textAlign: "center", background: "var(--brand-primary)", color: "#fff", fontWeight: 800, padding: 14, borderRadius: 15, fontSize: 15, border: "none", cursor: "pointer", marginTop: 14 }}>Start the week →</button>
          </div>
        </div>
      )}
    </>
  );
}
