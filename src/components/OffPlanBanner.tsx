"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface SwapDay { id: string; label: string; }
interface OffPlanRow { id: string; description: string; details: string | null; status: string; }

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

export default function OffPlanBanner({ clientId, dayId }: { clientId: string; dayId: string }) {
  const supabase = createClient();
  const [mode, setMode] = useState<"closed" | "menu" | "swap" | "type">("closed");
  const [library, setLibrary] = useState<SwapDay[]>([]);
  const [typed, setTyped] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRows, setPendingRows] = useState<OffPlanRow[]>([]);

  useEffect(() => {
    let on = true;
    (async () => {
      const { data } = await supabase.from("offplan_workout_logs").select("id, description, details, status")
        .eq("client_id", clientId).eq("log_date", CT_TODAY());
      if (on && data) setPendingRows(data as OffPlanRow[]);
    })();
    return () => { on = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function openSwap() {
    setMode("swap");
    if (library.length === 0) {
      const { data } = await (supabase as any).from("days").select("id, label").eq("swappable", true).neq("id", dayId).order("label");
      setLibrary((data as SwapDay[]) || []);
    }
  }

  async function doSwap(target: SwapDay) {
    if (!window.confirm("Swap today's workout for \"" + target.label + "\"? Your program stays unchanged - this only affects today.")) return;
    setBusy(true);
    try {
      const today = CT_TODAY();
      const { data: origRows } = await (supabase as any).from("scheduled_workouts")
        .select("id, position").eq("client_id", clientId).eq("day_id", dayId)
        .eq("scheduled_date", today).eq("status", "scheduled").order("id");
      const orig = origRows && origRows[0] ? origRows[0] : null;
      await (supabase as any).from("scheduled_workouts").insert({
        client_id: clientId, day_id: target.id, scheduled_date: today,
        status: "scheduled", source: "client_self_assign", position: orig ? orig.position : 0,
      });
      if (orig) await (supabase as any).from("scheduled_workouts").update({ status: "skipped" }).eq("id", orig.id);
      window.location.href = "/workout/" + target.id + window.location.search;
    } finally { setBusy(false); }
  }

  async function saveOffPlan() {
    if (!typed.trim()) return;
    setBusy(true);
    try {
      const today = CT_TODAY();
      const { data } = await supabase.from("offplan_workout_logs").insert({
        client_id: clientId, log_date: today, description: typed.trim(), details: details.trim() || null,
      }).select().single();
      if (data) setPendingRows((prev) => [...prev, data as OffPlanRow]);
      // Replace the scheduled workout for today: mark the original as 'skipped' so it's
      // not left sitting as an unlogged/pending workout (mirrors the library-swap flow).
      // Only touches today's still-'scheduled' instance for this day; reversible.
      try {
        await (supabase as any).from("scheduled_workouts")
          .update({ status: "skipped" })
          .eq("client_id", clientId).eq("day_id", dayId)
          .eq("scheduled_date", today).eq("status", "scheduled");
      } catch { /* off-plan log still saved even if this fails */ }
      setTyped(""); setDetails(""); setMode("closed");
    } finally { setBusy(false); }
  }

  async function deleteRow(id: string) {
    await supabase.from("offplan_workout_logs").delete().eq("id", id);
    setPendingRows((prev) => prev.filter((r) => r.id !== id));
  }

  const box: React.CSSProperties = { background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 18 };

  return (
    <div className="px-4 pt-3">
      {pendingRows.map((r) => (
        <div key={r.id} className="flex items-center justify-between p-3 mb-2" style={box}>
          <div className="min-w-0">
            <p className="text-xs font-bold truncate" style={{ color: "var(--brand-text)" }}>Off-plan: {r.description}</p>
            <p style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>becomes a library workout tonight 🌙</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-extrabold px-2 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#b45309", fontSize: 9 }}>PENDING</span>
            <button onClick={() => deleteRow(r.id)} aria-label="Delete" style={{ color: "var(--brand-text-secondary)" }}><i className="ti ti-trash text-sm" /></button>
          </div>
        </div>
      ))}
      <button onClick={() => setMode(mode === "closed" ? "menu" : "closed")}
        className="w-full flex items-center justify-between px-3.5 py-2.5"
        style={{ background: "rgba(124,156,245,0.06)", border: "1.5px dashed var(--brand-border)", borderRadius: 16 }}>
        <span className="text-xs font-bold" style={{ color: "var(--brand-text-secondary)" }}>🤔 Not doing this today?</span>
        <i className={mode === "closed" ? "ti ti-chevron-down" : "ti ti-chevron-up"} style={{ color: "var(--brand-text-secondary)" }} />
      </button>
      {mode === "menu" && (
        <div className="p-2 mt-2" style={box}>
          <button onClick={openSwap} className="w-full flex items-center gap-3 p-2.5 text-left rounded-2xl">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "#e8edfd" }}>⇄</span>
            <span><span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>Swap from library</span>
            <span className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>Pick a different cardio or basic workout for today</span></span>
          </button>
          <button onClick={() => setMode("type")} className="w-full flex items-center gap-3 p-2.5 text-left rounded-2xl">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "#fef3c7" }}>✍️</span>
            <span><span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>I did something else</span>
            <span className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>Type it - it becomes a library workout tonight</span></span>
          </button>
        </div>
      )}
      {mode === "swap" && (
        <div className="p-3 mt-2" style={box}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--brand-text-secondary)" }}>Swap today for:</p>
          {library.length === 0 && <p className="text-xs py-2" style={{ color: "var(--brand-text-secondary)" }}>Loading…</p>}
          {library.map((d) => (
            <button key={d.id} onClick={() => doSwap(d)} disabled={busy}
              className="w-full flex items-center justify-between py-2.5 px-1 text-left"
              style={{ borderBottom: "1px solid var(--brand-border)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{d.label}</span>
              <i className="ti ti-arrows-exchange" style={{ color: "var(--brand-primary)" }} />
            </button>
          ))}
          <p className="text-center mt-2" style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>Your programmed workout stays in your plan - this only changes today.</p>
        </div>
      )}
      {mode === "type" && (
        <div className="p-3 mt-2" style={box}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--brand-text-secondary)" }}>What did you do?</p>
          <textarea value={typed} onChange={(e) => setTyped(e.target.value)} rows={2}
            placeholder="e.g. 45 min hike with a 20lb pack, hilly trail"
            className="w-full rounded-2xl p-3 text-sm outline-none resize-none"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
          <input value={details} onChange={(e) => setDetails(e.target.value)} type="text"
            placeholder="Optional details - duration, intensity, equipment…"
            className="w-full rounded-xl px-3 py-2 mt-2 text-xs outline-none"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
          <button onClick={saveOffPlan} disabled={busy || !typed.trim()}
            className="w-full mt-2 py-2.5 rounded-full text-xs font-bold text-white"
            style={{ background: "var(--brand-primary)", opacity: typed.trim() ? 1 : 0.5 }}>
            {busy ? "Saving…" : "Log it - I'll take it from here 🌙"}
          </button>
          <p className="text-center mt-2" style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>Saved instantly with a pending chip. Tonight it becomes a real library workout logged for today.</p>
        </div>
      )}
    </div>
  );
}
