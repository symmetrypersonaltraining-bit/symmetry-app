"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LibDay = { id: string; label: string };

function ctToday() { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); }
function daysAgoCT(n: number) {
  const t = ctToday(); const [y, m, d] = t.split("-").map(Number);
  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export default function AddWorkoutButton({ dateStr, label = "+ Add workout", clientId }: { dateStr?: string; label?: string; clientId?: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [lib, setLib] = useState<LibDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickedDate, setPickedDate] = useState<string>(dateStr || ctToday());
  const [markDone, setMarkDone] = useState(false);
  const minDate = daysAgoCT(90);

  async function resolveClientId(): Promise<string | null> {
    const { data: u } = await supabase.auth.getUser();
    const uid = u && u.user ? u.user.id : null;
    if (!uid) return null;
    const { data } = await supabase.from("clients").select("id").eq("auth_user_id", uid).limit(1);
    return data && data[0] ? (data[0] as any).id : null;
  }

  // Trainer override: when a clientId is passed (managing a client), act on that
  // client; otherwise fall back to the logged-in user's own profile.
  async function effectiveClientId(): Promise<string | null> {
    return clientId || (await resolveClientId());
  }

  async function openSheet() {
    setOpen(true);
    if (lib.length) return;
    setLoading(true);
    const cid = await effectiveClientId();
    const days: LibDay[] = [];
    if (cid) {
      const asn = await supabase.from("program_assignments").select("program_id").eq("client_id", cid);
      const progIds = Array.from(new Set(((asn.data as any[]) || []).map((a) => a.program_id).filter(Boolean)));
      if (progIds.length) {
        const ph = await supabase.from("phases").select("id").in("program_id", progIds as string[]);
        const phaseIds = ((ph.data as any[]) || []).map((p) => p.id);
        if (phaseIds.length) {
          const own = await supabase.from("days").select("id, label").in("phase_id", phaseIds as string[]).order("position");
          for (const d of ((own.data as LibDay[]) || [])) days.push(d);
        }
      }
    }
    const shared = await supabase.from("days").select("id, label").order("label").limit(400); // full library (Dustin 7/13)
    for (const s of ((shared.data as LibDay[]) || [])) if (!days.find((d) => d.id === s.id)) days.push(s);
    setLib(days);
    setLoading(false);
  }

  async function addLibrary(d: LibDay) {
    if (busy) return;
    setBusy(true);
    try {
      const cid = await effectiveClientId();
      if (!cid) { window.alert("Could not find your client profile."); return; }
      const ex = await supabase.from("scheduled_workouts").select("position").eq("client_id", cid).eq("scheduled_date", pickedDate).order("position", { ascending: false }).limit(1);
      const last = (ex.data as any[]) || [];
      const pos = last[0] && last[0].position ? last[0].position + 1 : 1;
      if (markDone) {
        // Backlog a FINISHED workout: mirror completeWorkout() — write a completed
        // workout_logs row and a completed scheduled_workouts row linked to it, so it
        // counts in history/progress/tracking. Dated to the picked day (noon UTC keeps
        // the same calendar date in Central).
        const completedAt = new Date(pickedDate + "T12:00:00Z").toISOString();
        const wl = await (supabase as any).from("workout_logs").insert({ client_id: cid, day_id: d.id, log_date: pickedDate, completed: true, completed_at: completedAt, started_at: completedAt, status: "Done as planned", source: "trainer_backfill" }).select("id").single();
        if (wl.error || !wl.data) { window.alert("Could not add: " + (wl.error ? wl.error.message : "no log created")); return; }
        const insC = await (supabase as any).from("scheduled_workouts").insert({ client_id: cid, day_id: d.id, scheduled_date: pickedDate, position: pos, status: "completed", workout_log_id: wl.data.id, source: "trainer" });
        if (insC.error) { window.alert("Could not add: " + insC.error.message); return; }
        window.location.reload();
        return;
      }
      const ins = await (supabase as any).from("scheduled_workouts").insert({ client_id: cid, day_id: d.id, scheduled_date: pickedDate, position: pos, status: "scheduled", source: clientId ? "trainer" : "client_self_assign" });
      if (ins.error) { window.alert("Could not add: " + ins.error.message); return; }
      window.location.reload();
    } finally { setBusy(false); }
  }

  async function addCustom() {
    if (busy || !text.trim()) return;
    setBusy(true);
    try {
      const cid = await effectiveClientId();
      if (!cid) { window.alert("Could not find your client profile."); return; }
      const ins = await (supabase as any).from("offplan_workout_logs").insert({ client_id: cid, log_date: pickedDate, description: text.trim().slice(0, 80), details: text.trim(), status: "pending" });
      if (ins.error) { window.alert("Could not add: " + ins.error.message); return; }
      window.location.reload();
    } finally { setBusy(false); }
  }

  const filtered = lib.filter((d) => d.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button onClick={openSheet} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, background: "var(--brand-primary, #7c9cf5)", color: "#fff" }}>{label}</button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--brand-surface, #ffffff)", color: "var(--brand-text, #1c2440)", width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: 16, paddingBottom: "calc(16px + env(safe-area-inset-bottom))", maxHeight: "85vh", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Add a workout</div>
              <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", fontSize: 13, cursor: "pointer", color: "inherit", opacity: 0.6 }}>Close</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, opacity: 0.75 }}>Date</label>
              <input type="date" value={pickedDate} min={minDate} max={ctToday()} onChange={(e) => setPickedDate(e.target.value)} style={{ flex: 1, minWidth: 150, padding: "9px 10px", borderRadius: 10, border: "1px solid rgba(140,150,180,.3)", background: "transparent", color: "inherit", fontSize: 14, fontFamily: "inherit" }} />
              {pickedDate !== ctToday() && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--brand-primary, #7c9cf5)" }}>backdated</span>}
            </div>
            {!custom ? (
              <>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your workouts" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(140,150,180,.3)", background: "transparent", color: "inherit", marginBottom: 10 }} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} style={{ width: 16, height: 16 }} />
                  Mark completed on this date (backlog a finished workout)
                </label>
                {loading ? (
                  <div style={{ padding: 20, textAlign: "center", opacity: 0.6 }}>Loading...</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {filtered.map((d) => (
                      <button key={d.id} disabled={busy} onClick={() => addLibrary(d)} style={{ textAlign: "left", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(140,150,180,.2)", background: "rgba(140,150,180,.06)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "inherit" }}>{d.label}</button>
                    ))}
                    {filtered.length === 0 && <div style={{ padding: 12, opacity: 0.6, fontSize: 13 }}>No matching workouts.</div>}
                  </div>
                )}
                <button onClick={() => setCustom(true)} style={{ marginTop: 12, width: "100%", padding: "12px", borderRadius: 12, border: "1px dashed rgba(140,150,180,.5)", background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "inherit" }}>+ Custom workout (type what you did)</button>
              </>
            ) : (
              <>
                <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What did you do? e.g. 30 min incline walk, 3x12 goblet squats" rows={4} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(140,150,180,.3)", background: "transparent", color: "inherit", marginBottom: 10, resize: "vertical" }} />
                <button disabled={busy || !text.trim()} onClick={addCustom} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "var(--brand-primary, #7c9cf5)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, opacity: busy || !text.trim() ? 0.5 : 1 }}>Add workout</button>
                <button onClick={() => setCustom(false)} style={{ marginTop: 8, width: "100%", padding: "10px", borderRadius: 12, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: "inherit", opacity: 0.7 }}>Back to library</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
