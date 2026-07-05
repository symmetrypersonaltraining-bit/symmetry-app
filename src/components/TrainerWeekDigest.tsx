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
  daysSinceLog: number; thisWeekCount: number; focus: string | null; risk: "r" | "a" | "g"; status: string;
}

export default function TrainerWeekDigest() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showPop, setShowPop] = useState(false);
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
        const lastWkStart = addDays(thisWk, -7);
        const lastWkEnd = addDays(thisWk, -1);
        const thisWkEnd = addDays(thisWk, 6);
        const recent = addDays(today, -14);

        const [clientsRes, swLast, swThis, wlogs, meals] = await Promise.all([
          supabase.from("clients").select("id, name, weekly_focus"),
          supabase.from("scheduled_workouts").select("client_id, status").gte("scheduled_date", lastWkStart).lte("scheduled_date", lastWkEnd),
          supabase.from("scheduled_workouts").select("client_id").gte("scheduled_date", thisWk).lte("scheduled_date", thisWkEnd),
          supabase.from("workout_logs").select("client_id, log_date, completed, status").gte("log_date", recent),
          supabase.from("meal_adherence_logs").select("client_id, adherence, log_date").gte("log_date", lastWkStart).lte("log_date", lastWkEnd),
        ]);

        const clients = clientsRes.data || [];
        const lastByC: Record<string, { t: number; d: number }> = {};
        const thisByC: Record<string, number> = {};
        const lastLog: Record<string, string> = {};
        const mealsByC: Record<string, { on: number; tot: number }> = {};

        for (const w of (swLast.data || [])) { const k = w.client_id; (lastByC[k] = lastByC[k] || { t: 0, d: 0 }); lastByC[k].t++; if (w.status === "completed") lastByC[k].d++; }
        for (const w of (swThis.data || [])) { thisByC[w.client_id] = (thisByC[w.client_id] || 0) + 1; }
        const weekDone: Record<string, Set<string>> = {};
        for (const l of (wlogs.data || [])) { if (l.completed || l.status === "completed") { const c = lastLog[l.client_id]; if (!c || l.log_date > c) lastLog[l.client_id] = l.log_date; if (l.log_date >= lastWkStart && l.log_date <= lastWkEnd) { (weekDone[l.client_id] = weekDone[l.client_id] || new Set<string>()).add(l.log_date); } } }
        for (const m of (meals.data || [])) { const c = lastLog[m.client_id]; if (!c || m.log_date > c) lastLog[m.client_id] = m.log_date; const k = m.client_id; (mealsByC[k] = mealsByC[k] || { on: 0, tot: 0 }); mealsByC[k].tot++; const a = (m.adherence || "").toLowerCase(); if (a === "full" || a === "partial" || a === "on-plan" || a === "on plan") mealsByC[k].on++; }

        const out: Row[] = [];
        for (const c of clients) {
          if (/dustin/i.test(c.name || "")) continue;
          const lw = lastByC[c.id] || { t: 0, d: 0 };
          const total = lw.t;
          const done = weekDone[c.id] ? weekDone[c.id].size : 0;
          const twc = thisByC[c.id] || 0;
          const ll = lastLog[c.id];
          const daysSinceLog = ll ? Math.round((new Date(today + "T00:00:00").getTime() - new Date(ll + "T00:00:00").getTime()) / 86400000) : 999;
          const mb = mealsByC[c.id];
          const nutPct = mb && mb.tot ? Math.round((mb.on / mb.tot) * 100) : null;
          if (total === 0 && twc === 0 && daysSinceLog > 13) continue;
          let risk: "r" | "a" | "g" = "g";
          if (daysSinceLog >= 6) risk = "r";
          else if (daysSinceLog >= 3 || (nutPct != null && nutPct < 60)) risk = "a";
          let status: string;
          if (risk === "r") status = done + "/" + (total || 0) + " workouts · " + (daysSinceLog > 13 ? "no recent logs" : "no logs in " + daysSinceLog + "d");
          else if (risk === "a") status = done + "/" + (total || 0) + " workouts" + (nutPct != null ? " · nutrition " + nutPct + "%" : "");
          else status = done + "/" + (total || 0) + (nutPct != null ? " · " + nutPct + "%" : "") + " · on track";
          out.push({ id: c.id, name: c.name, done, total, nutPct, daysSinceLog, thisWeekCount: twc, focus: c.weekly_focus || null, risk, status });
        }
        const order: Record<string, number> = { r: 0, a: 1, g: 2 };
        out.sort((a, b) => (order[a.risk] - order[b.risk]) || a.name.localeCompare(b.name));
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
  function dismissPop() {
    try { localStorage.setItem("symmetry_trainerdigest_v1_" + weekStartOf(todayCT()), "1"); } catch { /* ignore */ }
    setShowPop(false);
  }

  const dotColor = (r: string) => (r === "r" ? "#ef4444" : r === "a" ? "#f59e0b" : "#22c55e");
  const activeCount = rows.length;
  const needCount = rows.filter((r) => r.risk === "r").length;

  // Called as a FUNCTION (not a nested component) so the focus textarea never remounts.
  const renderRoster = () => (
    <div>
      {rows.map((r) => (
        <div key={r.id} style={{ borderBottom: "1px solid var(--brand-border)", padding: "10px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: dotColor(r.risk), flex: "0 0 auto" }} />
            <span style={{ width: 34, height: 34, borderRadius: 999, background: "linear-gradient(135deg,var(--brand-primary),#6366f1)", color: "#fff", fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{initials(r.name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--brand-text)" }}>{r.name}</div>
              <div style={{ fontSize: 11, color: dotColor(r.risk) }}>{r.status}</div>
            </div>
            <button onClick={() => { setEditing(editing === r.id ? null : r.id); setDraft(r.focus || ""); }} style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-primary)", background: "none", border: "1px dashed var(--brand-primary)", borderRadius: 9, padding: "4px 8px", cursor: "pointer", flex: "0 0 auto" }}>{r.focus ? "Focus ✎" : "+ focus"}</button>
          </div>
          {r.focus && editing !== r.id && (
            <div style={{ marginLeft: 54, marginTop: 6, fontSize: 12, color: "var(--brand-text-secondary)", fontStyle: "italic" }}>“{r.focus}”</div>
          )}
          {editing === r.id && (
            <div style={{ marginLeft: 54, marginTop: 8 }}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="This week's focus for this client…" style={{ width: "100%", fontSize: 12.5, padding: 8, borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", resize: "vertical" }} />
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
        {renderRoster()}
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
            {renderRoster()}
            <button onClick={dismissPop} style={{ display: "block", width: "100%", textAlign: "center", background: "var(--brand-primary)", color: "#fff", fontWeight: 800, padding: 14, borderRadius: 15, fontSize: 15, border: "none", cursor: "pointer", marginTop: 14 }}>Start the week →</button>
          </div>
        </div>
      )}
    </>
  );
}
