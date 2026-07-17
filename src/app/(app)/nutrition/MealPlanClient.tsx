"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import GroceryListSheet from "./GroceryListSheet";
import { parseServing, servingsFor, unitsForServing } from "@/lib/units";

interface MealItem { id: string; food: string; amount: number | null; unit: string | null; is_unlimited: boolean; protein: number | null; carbs: number | null; fats: number | null; position: number; }
interface Meal { id: string; name: string; timing: string | null; position: number; swaps: string | null; meal_items: MealItem[]; }
interface MealPlan { id: string; version_number: number; meals: Meal[]; }
interface AdherenceLog { id: string; meal_id: string | null; meal_position: number; adherence: string; off_plan_details: string | null; notes: string | null; est_kcal: number | null; est_protein: number | null; est_carbs: number | null; est_fats: number | null; food_id?: string | null; servings?: number | null; macros_pending?: boolean | null; item_overrides?: Record<string, any> | null; }
interface MacroTarget { calories: number; protein: number; carbs: number; fats: number; }

const ADHERENCE_OPTIONS = [
  { key: "1/4",        label: "\u00bc",        color: "#ef4444", pct: 0.25 },
  { key: "1/2",           label: "\u00bd",        color: "#f59e0b", pct: 0.5  },
  { key: "3/4", label: "\u00be",        color: "#84cc16", pct: 0.75 },
  { key: "Full",           label: "Full",     color: "#22c55e", pct: 1.0  },
    { key: "Skipped",  label: "Skip",     color: "#6b7280", pct: 0    },
{ key: "Off-plan",       label: "Off Plan", color: "#8b5cf6", pct: null },
];

const FREE_SLOTS = [
  { position: 1, label: "Meal 1", timing: "Morning" },
  { position: 2, label: "Meal 2", timing: "Mid-Morning" },
  { position: 3, label: "Meal 3", timing: "Lunch" },
  { position: 4, label: "Meal 4", timing: "Afternoon" },
  { position: 5, label: "Meal 5", timing: "Dinner" },
  { position: 6, label: "Meal 6", timing: "Evening Snack" },
];


const CARD_STYLE: React.CSSProperties = { background: "var(--brand-surface)", border: "1px solid var(--brand-border)", boxShadow: "0 8px 26px rgba(20,30,55,0.08)" };

interface Food { id: string; name: string; serving: string | null; protein: number | null; carbs: number | null; fats: number | null; verified: boolean | null; }
// An added/swapped-in library food. `servings` is the multiplier currentMacros uses (kept unchanged);
// amount+unit+serving drive the unit-conversion UI and recompute `servings` via servingsFor().
interface AddedFood { food_id: string | null; name: string; servings: number; p: number; c: number; f: number; serving?: string | null; amount?: number; unit?: string; }
function addedFromFood(fd: Food): AddedFood {
  const ps = parseServing(fd.serving);
  return { food_id: fd.id, name: fd.name, p: fd.protein || 0, c: fd.carbs || 0, f: fd.fats || 0, serving: fd.serving || null, amount: ps.amount, unit: ps.unit, servings: servingsFor(ps.amount, ps.unit, fd.serving) };
}
function reServings(x: AddedFood): AddedFood { return { ...x, servings: servingsFor(x.amount ?? 1, x.unit ?? "serving", x.serving) }; }
interface RecentEntry { label: string; food_id: string | null; p: number; c: number; f: number; }

function quickKcal(p: number, c: number, f: number) { return Math.round(4 * p + 4 * c + 9 * f); }

function nextQuickPos(logs: AdherenceLog[]) {
  const used = new Set(logs.map((l) => l.meal_position));
  let p = 101;
  while (used.has(p)) p++;
  return p;
}

function MacroHeader({ macros, target }: { macros: { kcal: number; protein: number; carbs: number; fats: number }; target: MacroTarget | null }) {
  const kcal = Math.round(macros.kcal);
  const [shownKcal, setShownKcal] = useState(0);
  const prevKcal = useRef(0);
  useEffect(() => {
    const start = prevKcal.current, end = kcal, t0 = performance.now(), dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const x = Math.min((t - t0) / dur, 1);
      const e = 1 - Math.pow(1 - x, 3);
      setShownKcal(Math.round(start + (end - start) * e));
      if (x < 1) raf = requestAnimationFrame(tick); else prevKcal.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [kcal]);
  const tKcal = target?.calories || 0, tP = target?.protein || 0, tC = target?.carbs || 0, tF = target?.fats || 0;
  const RING_C = 2 * Math.PI * 24;
  const ARC_L = 163.4;
  const pct = (v: number, t: number) => (t > 0 ? Math.min(v / t, 1) : 0);
  function ring(label: string, value: number, tgt: number, color: string) {
    const hit = tgt > 0 && value >= tgt;
    return (
      <div className="flex flex-col items-center gap-1" style={{ width: 66 }}>
        <div className="relative" style={{ width: 58, height: 58 }}>
          <svg width="58" height="58" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="29" cy="29" r="24" fill="none" stroke="var(--brand-border)" strokeWidth="7" />
            <circle cx="29" cy="29" r="24" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={String(RING_C)} strokeDashoffset={String(RING_C * (1 - pct(value, tgt)))}
              style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)", animation: hit ? "cw-ring-pulse 0.7s ease 0.9s" : undefined }} />
          </svg>
          {hit && (
            <span aria-hidden style={{ position: "absolute", top: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: "#22c55e", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", animation: "cw-tick-in 0.3s ease 1.3s both" }}>✓</span>
          )}
          <div className="absolute inset-0 flex items-center justify-center font-extrabold" style={{ color, fontSize: 13 }}>{Math.round(value)}</div>
        </div>
        <span className="font-bold tracking-wider" style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>{label}</span>
        <span className="font-semibold" style={{ color: "var(--brand-text)", fontSize: 11 }}>{Math.round(value)} / {Math.round(tgt)}g</span>
      </div>
    );
  }
  return (
    <div className="mx-4 mt-2 rounded-3xl p-4" style={CARD_STYLE}>
      <style>{"@keyframes symFlick{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.18) rotate(-4deg)}}"}</style>
      <div className="flex items-start justify-between">
        {ring("PROTEIN", macros.protein, tP, "var(--brand-primary)")}
        <div className="flex flex-col items-center flex-1" style={{ minWidth: 128 }}>
          <div className="relative" style={{ height: 70, marginTop: -12, marginBottom: -14 }}>
            <svg width="128" height="70" viewBox="0 0 128 70">
              <path d="M 12 64 A 52 52 0 0 1 116 64" fill="none" stroke="var(--brand-border)" strokeWidth="9" strokeLinecap="round" />
              <path d="M 12 64 A 52 52 0 0 1 116 64" fill="none" stroke="url(#symKcalGrad)" strokeWidth="9" strokeLinecap="round"
                strokeDasharray={String(ARC_L)} strokeDashoffset={String(ARC_L * (1 - pct(macros.kcal, tKcal)))}
                style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
              <defs>
                <linearGradient id="symKcalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--brand-primary)" />
                  <stop offset="55%" stopColor="#5ec9a3" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>
            <span className="absolute" style={{ left: "50%", top: 14, transform: "translateX(-50%)", fontSize: 17, animation: "symFlick 1.6s ease-in-out infinite" }}>🔥</span>
          </div>
          <div className="font-extrabold leading-none relative" style={{ color: "var(--brand-text)", fontSize: 38, fontVariantNumeric: "tabular-nums", zIndex: 1 }}>{shownKcal.toLocaleString()}</div>
          <div className="mt-1" style={{ color: "var(--brand-text-secondary)", fontSize: 11 }}>
            of <b style={{ color: "var(--brand-text)" }}>{tKcal.toLocaleString()}</b> cal · <b style={{ color: "var(--brand-text)" }}>{Math.max(tKcal - kcal, 0).toLocaleString()}</b> left
          </div>
        </div>
        {ring("CARBS", macros.carbs, tC, "#5ec9a3")}
        {ring("FATS", macros.fats, tF, "#f59e0b")}
      </div>
    </div>
  );
}

function QuickLog({ clientId, selectedDate, logs, setLogs }: { clientId: string; selectedDate: string; logs: AdherenceLog[]; setLogs: React.Dispatch<React.SetStateAction<AdherenceLog[]>> }) {
  const supabase = createClient();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [picked, setPicked] = useState<Food | null>(null);
  const [serv, setServ] = useState(1);
  const [typed, setTyped] = useState("");
  const [showPortions, setShowPortions] = useState(false);
  const [portions, setPortions] = useState({ p: 0, c: 0, f: 0, v: 0 });
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      const { data } = await supabase.from("meal_adherence_logs")
        .select("food_id, servings, off_plan_details, est_protein, est_carbs, est_fats")
        .eq("client_id", clientId).gte("meal_position", 101)
        .order("id", { ascending: false }).limit(150);
      if (!on || !data) return;
      const rows = data as { food_id: string | null; off_plan_details: string | null; est_protein: number | null; est_carbs: number | null; est_fats: number | null }[];
      const foodIds = Array.from(new Set(rows.map((r) => r.food_id).filter(Boolean))) as string[];
      const foodMap: Record<string, Food> = {};
      if (foodIds.length > 0) {
        const { data: fs } = await supabase.from("foods").select("*").in("id", foodIds);
        for (const f of (fs as Food[]) || []) foodMap[f.id] = f;
      }
      const freq: Record<string, { n: number; e: RecentEntry }> = {};
      for (const r of rows) {
        const key = r.food_id || r.off_plan_details;
        if (!key) continue;
        let e: RecentEntry | null = null;
        if (r.food_id && foodMap[r.food_id]) {
          const f = foodMap[r.food_id];
          e = { label: f.name, food_id: f.id, p: f.protein || 0, c: f.carbs || 0, f: f.fats || 0 };
        } else if (!r.food_id && r.off_plan_details && (r.est_protein != null || r.est_carbs != null || r.est_fats != null)) {
          e = { label: r.off_plan_details, food_id: null, p: r.est_protein || 0, c: r.est_carbs || 0, f: r.est_fats || 0 };
        }
        if (!e) continue;
        if (!freq[key]) freq[key] = { n: 0, e };
        freq[key].n++;
      }
      if (on) setRecents(Object.values(freq).sort((a, b) => b.n - a.n).slice(0, 6).map((x) => x.e));
    })();
    return () => { on = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("foods").select("*").ilike("name", "%" + q.trim() + "%").limit(8);
      setResults((data as Food[]) || []);
    }, 250);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function insertQuick(row: Record<string, unknown>) {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        client_id: clientId, log_date: selectedDate, meal_id: null,
        meal_position: nextQuickPos(logs), adherence: "Off-plan", source: "client", ...row,
      };
      // Also persist a structured off_plan_macros JSONB (with a description) so the
      // nightly rollup / Claude can read what was eaten, not just the est_* fields.
      if (payload.est_kcal != null && payload.off_plan_macros == null) {
        payload.off_plan_macros = {
          kcal: Number(payload.est_kcal) || 0,
          protein: Number(payload.est_protein) || 0,
          carbs: Number(payload.est_carbs) || 0,
          fats: Number(payload.est_fats) || 0,
          description: (payload.off_plan_details as string) || "Off-plan meal",
          estimated: true,
        };
      }
      const { data } = await supabase.from("meal_adherence_logs").insert(payload).select().single();
      if (data) setLogs((prev) => [...prev, data as AdherenceLog]);
    } finally { setBusy(false); }
  }

  async function logRecent(r: RecentEntry) {
    await insertQuick({ food_id: r.food_id, servings: r.food_id ? 1 : null, off_plan_details: r.label, est_protein: r.p, est_carbs: r.c, est_fats: r.f, est_kcal: quickKcal(r.p, r.c, r.f), macros_pending: false });
  }
  async function logPicked() {
    if (!picked) return;
    const p = (picked.protein || 0) * serv, c = (picked.carbs || 0) * serv, f = (picked.fats || 0) * serv;
    await insertQuick({ food_id: picked.id, servings: serv, off_plan_details: picked.name, est_protein: p, est_carbs: c, est_fats: f, est_kcal: quickKcal(p, c, f), macros_pending: false });
    setPicked(null); setServ(1); setQ(""); setResults([]);
  }
  async function logTyped() {
    if (!typed.trim()) return;
    await insertQuick({ off_plan_details: typed.trim(), macros_pending: true });
    setTyped("");
  }
  async function logPortions() {
    const p = portions.p * 25, c = portions.c * 25, f = portions.f * 12;
    if (p + c + f === 0) return;
    const label = (typed.trim() || "Portion-estimated meal") + (portions.v > 0 ? " + veg" : "");
    await insertQuick({ off_plan_details: label, est_protein: p, est_carbs: c, est_fats: f, est_kcal: quickKcal(p, c, f), macros_pending: false });
    setTyped(""); setPortions({ p: 0, c: 0, f: 0, v: 0 }); setShowPortions(false);
  }
  async function handleQuickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        const res = await fetch("/api/analyze-meal-photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: base64, mimeType: file.type || "image/jpeg" }) });
        const json = await res.json();
        if (!json.error) {
          const p = json.protein_g || 0, c = json.carbs_g || 0, f = json.fats_g || 0;
          await insertQuick({ off_plan_details: json.description || json.meal_name || "Photo meal", est_protein: p, est_carbs: c, est_fats: f, est_kcal: json.calories || quickKcal(p, c, f), macros_pending: false });
        }
      } finally { setPhotoBusy(false); if (photoRef.current) photoRef.current.value = ""; }
    };
    reader.readAsDataURL(file);
  }
  async function deleteQuick(id: string) {
    await supabase.from("meal_adherence_logs").delete().eq("id", id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }

  const quickRows = logs.filter((l) => l.meal_position >= 101);

  return (
    <div className="px-4 mt-4 space-y-3 pb-6">
      <div className="rounded-3xl p-4" style={CARD_STYLE}>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-2xl px-3 py-2.5" style={{ background: "var(--brand-bg)" }}>
            <i className="ti ti-search" style={{ color: "var(--brand-text-secondary)" }} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder="Search foods..." className="w-full bg-transparent outline-none text-sm" style={{ color: "var(--brand-text)" }} />
          </div>
          <button onClick={() => photoRef.current?.click()} disabled={photoBusy} className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ border: "1px dashed var(--brand-border)", background: "var(--brand-surface)", color: "var(--brand-text-secondary)" }} aria-label="Photo (AI)">
            <i className={photoBusy ? "ti ti-loader-2 animate-spin" : "ti ti-camera"} />
          </button>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleQuickPhoto} />
        </div>
        {results.length > 0 && !picked && (
          <div className="mt-2">
            {results.map((f) => (
              <button key={f.id} onClick={() => { setPicked(f); setServ(1); }} className="w-full flex items-center justify-between py-2.5 text-left" style={{ borderBottom: "1px solid var(--brand-border)" }}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--brand-text)" }}>{f.name}{f.verified ? " ✓" : ""}</p>
                  <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{f.serving || "1 serving"} · P{Math.round(f.protein || 0)} C{Math.round(f.carbs || 0)} F{Math.round(f.fats || 0)} · {quickKcal(f.protein || 0, f.carbs || 0, f.fats || 0)} cal</p>
                </div>
                <i className="ti ti-circle-plus" style={{ color: "var(--brand-primary)", fontSize: 20 }} />
              </button>
            ))}
          </div>
        )}
        {picked && (
          <div className="mt-3 rounded-2xl p-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>{picked.name}</p>
            <p className="text-xs mb-2" style={{ color: "var(--brand-text-secondary)" }}>{serv} × {picked.serving || "serving"} · P{Math.round((picked.protein || 0) * serv)} C{Math.round((picked.carbs || 0) * serv)} F{Math.round((picked.fats || 0) * serv)} · {quickKcal((picked.protein || 0) * serv, (picked.carbs || 0) * serv, (picked.fats || 0) * serv)} cal</p>
            <div className="flex items-center justify-center gap-4 mb-2">
              <button onClick={() => setServ(Math.max(0.5, serv - 0.5))} className="w-9 h-9 rounded-xl font-bold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>-</button>
              <span className="text-lg font-extrabold text-center" style={{ color: "var(--brand-text)", minWidth: 48 }}>{serv}</span>
              <button onClick={() => setServ(serv + 0.5)} className="w-9 h-9 rounded-xl font-bold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>+</button>
            </div>
            <button onClick={logPicked} disabled={busy} className="w-full py-2.5 rounded-full text-sm font-bold text-white" style={{ background: "var(--brand-primary)" }}>{busy ? "Logging..." : "Log it"}</button>
          </div>
        )}
      </div>

      {recents.length > 0 && (
        <div className="rounded-3xl p-4" style={CARD_STYLE}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: "var(--brand-text-secondary)" }}>Recents — one tap to re-log</p>
          <div className="grid grid-cols-2 gap-2">
            {recents.map((r, i) => (
              <button key={i} onClick={() => logRecent(r)} disabled={busy} className="rounded-2xl p-2.5 text-left" style={{ border: "1px solid var(--brand-border)", background: "var(--brand-surface)" }}>
                <p className="text-xs font-bold truncate" style={{ color: "var(--brand-text)" }}>{r.label}</p>
                <p style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>P{Math.round(r.p)} C{Math.round(r.c)} F{Math.round(r.f)} · {quickKcal(r.p, r.c, r.f)} cal</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-3xl p-4" style={CARD_STYLE}>
        <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: "var(--brand-text-secondary)" }}>Type it</p>
        <textarea value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. leftover jambalaya, big bowl" rows={2} className="w-full rounded-2xl p-3 text-sm outline-none resize-none" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
        <div className="flex gap-2 mt-2">
          <button onClick={() => setShowPortions(!showPortions)} className="flex-1 py-2.5 rounded-full text-xs font-bold" style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>Portions ✋</button>
          <button onClick={logTyped} disabled={busy || !typed.trim()} className="flex-1 py-2.5 rounded-full text-xs font-bold text-white" style={{ background: "var(--brand-primary)", opacity: typed.trim() ? 1 : 0.5 }}>Save — macros tonight</button>
        </div>
        {showPortions && (
          <div className="mt-3 pt-3" style={{ borderTop: "1px dashed var(--brand-border)" }}>
            <div className="grid grid-cols-2 gap-2">
              {([
                { k: "p", icon: "✋", lab: "Palm protein", sub: "~25g P each" },
                { k: "c", icon: "🤲", lab: "Cupped carbs", sub: "~25g C each" },
                { k: "f", icon: "👍", lab: "Thumb fats", sub: "~12g F each" },
                { k: "v", icon: "🥦", lab: "Veggies", sub: "free" },
              ] as { k: "p" | "c" | "f" | "v"; icon: string; lab: string; sub: string }[]).map((cell) => (
                <div key={cell.k} className="rounded-2xl p-2.5 flex items-center justify-between" style={{ border: "1px solid var(--brand-border)" }}>
                  <div>
                    <p className="font-bold" style={{ color: "var(--brand-text)", fontSize: 11 }}>{cell.icon} {cell.lab}</p>
                    <p style={{ color: "var(--brand-text-secondary)", fontSize: 9 }}>{cell.sub}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setPortions({ ...portions, [cell.k]: Math.max(0, portions[cell.k] - 1) })} className="w-6 h-6 rounded-lg text-xs font-bold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>-</button>
                    <span className="text-sm font-bold text-center" style={{ color: "var(--brand-text)", minWidth: 14 }}>{portions[cell.k]}</span>
                    <button onClick={() => setPortions({ ...portions, [cell.k]: portions[cell.k] + 1 })} className="w-6 h-6 rounded-lg text-xs font-bold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center mt-2" style={{ color: "var(--brand-text-secondary)", fontSize: 11 }}>Estimated: P{portions.p * 25} C{portions.c * 25} F{portions.f * 12} · {quickKcal(portions.p * 25, portions.c * 25, portions.f * 12)} cal</p>
            <button onClick={logPortions} disabled={busy} className="w-full mt-2 py-2.5 rounded-full text-xs font-bold text-white" style={{ background: "var(--brand-primary)" }}>Log with portion estimate</button>
          </div>
        )}
        <p className="text-center mt-2" style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>Save is instant — entries show a pending chip until macros are filled in tonight</p>
      </div>

      {quickRows.length > 0 && (
        <div className="rounded-3xl p-4" style={CARD_STYLE}>
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--brand-text-secondary)" }}>Logged today</p>
          {quickRows.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-2.5" style={{ borderBottom: "1px solid var(--brand-border)" }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--brand-text)" }}>{l.off_plan_details || "Quick entry"}</p>
                <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                  {l.macros_pending ? "macros tonight" : "P" + Math.round(l.est_protein || 0) + " C" + Math.round(l.est_carbs || 0) + " F" + Math.round(l.est_fats || 0) + " · " + Math.round(l.est_kcal || 0) + " cal"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {l.macros_pending ? <span className="font-extrabold px-2 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#b45309", fontSize: 9 }}>PENDING</span> : null}
                <button onClick={() => deleteQuick(l.id)} aria-label="Delete entry" style={{ color: "var(--brand-text-secondary)" }}><i className="ti ti-trash" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  clientId: string;
  clientName: string;
  mealPlan: MealPlan | null;
  todayLogs: AdherenceLog[];
  macroTarget: MacroTarget | null;
  weekLogs: { log_date: string; adherence: string }[];
  today: string;
  isTrainer?: boolean;
}

export default function MealPlanClient({ clientId, clientName, mealPlan, todayLogs, macroTarget, weekLogs, today, isTrainer }: Props) {
  const supabase = createClient();
  const [logs, setLogs] = useState<AdherenceLog[]>(todayLogs);

  const MACRO_RANGES = [
    { key: "1d", label: "1D", days: 1 },
    { key: "1w", label: "1W", days: 7 },
    { key: "2w", label: "2W", days: 14 },
    { key: "4w", label: "4W", days: 28 },
    { key: "8w", label: "8W", days: 56 },
  ];
  const [macroRange, setMacroRange] = useState<string>("1d");
  const [rangeAvg, setRangeAvg] = useState<{ kcal: number; protein: number; carbs: number; fats: number; loggedDays: number; totalDays: number } | null>(null);
  useEffect(() => {
    if (macroRange === "1d") { setRangeAvg(null); return; }
    const rangeDef = MACRO_RANGES.find((r) => r.key === macroRange);
    const days = rangeDef ? rangeDef.days : 1;
    const [ey, em, ed] = today.split("-").map(Number);
    const startDate = new Date(Date.UTC(ey, em - 1, ed));
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    const startStr = startDate.toISOString().slice(0, 10);
    let cancelled = false;
    (async () => {
      const { data: rLogs } = await supabase
        .from("meal_adherence_logs")
        .select("log_date, meal_id, adherence, est_kcal, est_protein, est_carbs, est_fats")
        .eq("client_id", clientId).gte("log_date", startStr).lte("log_date", today);
      const logsArr = (rLogs as any[]) || [];
      const mealIds = Array.from(new Set(logsArr.map((l) => l.meal_id).filter(Boolean)));
      const itemsByMeal: Record<string, { protein: number; carbs: number; fats: number }> = {};
      if (mealIds.length) {
        const { data: items } = await supabase.from("meal_items").select("meal_id, protein, carbs, fats").in("meal_id", mealIds);
        for (const it of ((items as any[]) || [])) {
          const k = it.meal_id;
          if (!itemsByMeal[k]) itemsByMeal[k] = { protein: 0, carbs: 0, fats: 0 };
          itemsByMeal[k].protein += Number(it.protein) || 0;
          itemsByMeal[k].carbs += Number(it.carbs) || 0;
          itemsByMeal[k].fats += Number(it.fats) || 0;
        }
      }
      const dayset = new Set<string>();
      let kcal = 0, protein = 0, carbs = 0, fats = 0;
      for (const log of logsArr) {
        dayset.add(log.log_date);
        const opt = ADHERENCE_OPTIONS.find((o) => o.key === log.adherence);
        if (log.adherence === "Off-plan") {
          kcal += log.est_kcal || 0; protein += log.est_protein || 0; carbs += log.est_carbs || 0; fats += log.est_fats || 0;
        } else if (opt && opt.pct !== null && itemsByMeal[log.meal_id]) {
          const m = itemsByMeal[log.meal_id];
          protein += m.protein * opt.pct; carbs += m.carbs * opt.pct; fats += m.fats * opt.pct;
          kcal += (m.protein * 4 + m.carbs * 4 + m.fats * 9) * opt.pct;
        }
      }
      const denom = dayset.size || 1;
      if (!cancelled) setRangeAvg({ kcal: kcal / denom, protein: protein / denom, carbs: carbs / denom, fats: fats / denom, loggedDays: dayset.size, totalDays: days });
    })();
    return () => { cancelled = true; };
  }, [macroRange, clientId, today]);
  const [saving, setSaving] = useState<string | null>(null);

  // Multi-option bottom sheet (Mockup B). Only used for slots that have >1 option;
  // single-option plans (e.g. Dustin's) never open this and render exactly as before.
  const [slotSheet, setSlotSheet] = useState<{ position: number; timing: string; extra?: boolean } | null>(null);
  const [sheetOptId, setSheetOptId] = useState<string>("");
  const [sheetAdh, setSheetAdh] = useState<string>("Full");
  // Draft per-item amounts + added items for the option being logged in the sheet.
  const [sheetItems, setSheetItems] = useState<Record<string, number>>({});
  const [sheetAdds, setSheetAdds] = useState<AddedFood[]>([]);
  const [sheetQ, setSheetQ] = useState("");
  const [sheetResults, setSheetResults] = useState<Food[]>([]);
  const [showGrocery, setShowGrocery] = useState(false);

  const [notesMap, setNotesMap] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    for (const l of todayLogs) if (l.notes) m[l.meal_position] = l.notes;
    return m;
  });

  const [offPlanModal, setOffPlanModal] = useState<{ mealId: string | null; position: number; mealName: string } | null>(null);
  const [offPlanDetails, setOffPlanDetails] = useState("");
  const [offPlanKcal, setOffPlanKcal] = useState("");
  const [offPlanP,    setOffPlanP]    = useState("");
  const [offPlanC,    setOffPlanC]    = useState("");
  const [offPlanF,    setOffPlanF]    = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoResult,  setPhotoResult]  = useState<string | null>(null);
  const [offPlanNotes, setOffPlanNotes] = useState("");
  // Per-day food-amount overrides (feedback 8ec01614) — plan rows stay canonical.
  const [amountsModal, setAmountsModal] = useState<{ mealId: string; position: number; mealName: string } | null>(null);
  const [amountEdits, setAmountEdits] = useState<Record<string, string>>({});
  const [savingAmounts, setSavingAmounts] = useState(false);
  // Add/swap items from the food library inside the adjust-amounts sheet (per-day only).
  const [amountAdds, setAmountAdds] = useState<AddedFood[]>([]);
  const [amtQ, setAmtQ] = useState("");
  const [amtResults, setAmtResults] = useState<Food[]>([]);
  useEffect(() => {
    if (!amountsModal || amtQ.trim().length < 2) { setAmtResults([]); return; }
    const tmr = setTimeout(async () => {
      try {
        const { data } = await supabase.from("foods").select("*").ilike("name", "%" + amtQ.trim() + "%").limit(6);
        setAmtResults((data as Food[]) || []);
      } catch { /* noop */ }
    }, 250);
    return () => clearTimeout(tmr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amtQ, amountsModal]);

  // Food-library search inside the multi-option slot sheet (add/swap items).
  useEffect(() => {
    if (!slotSheet || sheetQ.trim().length < 2) { setSheetResults([]); return; }
    const tmr = setTimeout(async () => {
      try {
        const { data } = await supabase.from("foods").select("*").ilike("name", "%" + sheetQ.trim() + "%").limit(6);
        setSheetResults((data as Food[]) || []);
      } catch { /* noop */ }
    }, 250);
    return () => clearTimeout(tmr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetQ, slotSheet]);

  // Restore the last viewed date so navigating away + Back doesn't reset to today.
  const [selectedDate, setSelectedDate] = useState(() => {
    try {
      if (typeof window === "undefined") return today;
      const saved = sessionStorage.getItem("sym:nutrition:date:" + clientId);
      return saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : today;
    } catch { return today; }
  });
  const [tab, setTab] = useState<"plan" | "quick">(mealPlan ? "plan" : "quick");
  // Plan always shows the single-day view. (The forward plan-range selector was removed —
  // the top macro-range selector drives the graphs; a second range picker here was redundant.)
  const planRange = "day" as "day" | "1w" | "4w" | "8w" | "custom";
  function shiftDate(s: string, delta: number) { const [y,m,d]=s.split("-").map(Number); const dt=new Date(y, m-1, d); dt.setDate(dt.getDate()+delta); const mm=String(dt.getMonth()+1).padStart(2,"0"); const dd=String(dt.getDate()).padStart(2,"0"); return dt.getFullYear()+"-"+mm+"-"+dd; }
  function formatNutritionDate(s: string) { const [y,m,d]=s.split("-").map(Number); const dt=new Date(y, m-1, d); return dt.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}); }
  useEffect(() => {
    let active = true;
    try { sessionStorage.setItem("sym:nutrition:date:" + clientId, selectedDate); } catch { /* noop */ }
    (async () => {
      const { data } = await supabase.from("meal_adherence_logs").select("*").eq("client_id", clientId).eq("log_date", selectedDate);
      if (!active) return;
      const rows = (data as AdherenceLog[]) || [];
      setLogs(rows);
      const m: Record<number, string> = {}; for (const l of rows) if ((l as any).notes) m[(l as any).meal_position] = (l as any).notes; setNotesMap(m);
    })();
    return () => { active = false; };
  }, [selectedDate, clientId]);
  const cameraRef = useRef<HTMLInputElement>(null);

  const sortedMeals = useMemo(() => {
    if (!mealPlan?.meals) return [];
    return [...mealPlan.meals].sort((a, b) => a.position - b.position);
  }, [mealPlan]);

  // Group meals into slots by position. A slot with >1 meal is a multi-option slot
  // (Gerard/Jerry) → compact row + bottom-sheet dropdown. A slot with exactly 1 meal
  // renders through the original single-meal card path, untouched.
  const slots = useMemo(() => {
    const byPos: Record<number, Meal[]> = {};
    for (const m of sortedMeals) { (byPos[m.position] ||= []).push(m); }
    return Object.keys(byPos)
      .map(Number)
      .sort((a, b) => a - b)
      .map((position) => ({ position, options: byPos[position] }));
  }, [sortedMeals]);
  const slotTitle = (slot: { position: number; options: Meal[] }) =>
    (slot.options[0].timing && slot.options[0].timing.length <= 24 ? slot.options[0].timing : null) || `Meal ${slot.position}`;

  function getMealMacros(meal: Meal) {
    let protein = 0, carbs = 0, fats = 0;
    for (const item of meal.meal_items || []) {
      protein += item.protein || 0;
      carbs   += item.carbs   || 0;
      fats    += item.fats    || 0;
    }
    const kcal = protein * 4 + carbs * 4 + fats * 9;
    return { kcal, protein, carbs, fats };
  }

  const currentMacros = useMemo(() => {
    let kcal = 0, protein = 0, carbs = 0, fats = 0;
    for (const log of logs) {
      const opt = ADHERENCE_OPTIONS.find(o => o.key === log.adherence);
      if (!opt) continue;
      if (log.adherence === "Off-plan") {
        kcal    += log.est_kcal    || 0;
        protein += log.est_protein || 0;
        carbs   += log.est_carbs   || 0;
        fats    += log.est_fats    || 0;
      } else if (opt.pct !== null && log.meal_id) {
        const meal = sortedMeals.find(m => m.id === log.meal_id);
        if (meal) {
          const ov = log.item_overrides || null;
          if (ov && Object.keys(ov).length) {
            // Per-item adjusted amounts: scale each item's macros by newAmount/plannedAmount.
            let p = 0, c = 0, f = 0;
            for (const item of meal.meal_items || []) {
              const oAmt = ov[item.id]?.amount;
              const scale = (oAmt != null && item.amount) ? (oAmt / item.amount) : 1;
              p += (item.protein || 0) * scale;
              c += (item.carbs   || 0) * scale;
              f += (item.fats    || 0) * scale;
            }
            for (const ad of (ov.__added as { servings?: number; p?: number; c?: number; f?: number }[]) || []) {
              const sv = ad.servings || 1;
              p += (ad.p || 0) * sv;
              c += (ad.c || 0) * sv;
              f += (ad.f || 0) * sv;
            }
            kcal    += (p * 4 + c * 4 + f * 9) * opt.pct;
            protein += p * opt.pct;
            carbs   += c * opt.pct;
            fats    += f * opt.pct;
          } else {
            const m = getMealMacros(meal);
            kcal    += m.kcal    * opt.pct;
            protein += m.protein * opt.pct;
            carbs   += m.carbs   * opt.pct;
            fats    += m.fats    * opt.pct;
          }
        }
      }
    }
    return { kcal, protein, carbs, fats };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, sortedMeals]);

  const kcalTarget = macroTarget?.calories || 0;
  const kcalPct    = kcalTarget > 0 ? Math.min(currentMacros.kcal / kcalTarget, 1) : 0;
  const ringR      = 56;
  const ringCirc   = 2 * Math.PI * ringR;
  const loggedCount = logs.length;
  const totalMeals  = mealPlan ? sortedMeals.length : 0;

  async function logAdherence(meal: Meal, adherenceKey: string) {
    if (adherenceKey === "Off-plan") {
      const existing = logs.find(l => l.meal_id === meal.id);
      setOffPlanDetails(existing?.off_plan_details || "");
      setOffPlanKcal(existing?.est_kcal?.toString() || "");
      setOffPlanP(existing?.est_protein?.toString() || "");
      setOffPlanC(existing?.est_carbs?.toString() || "");
      setOffPlanF(existing?.est_fats?.toString() || "");
      setPhotoResult(null);
      setOffPlanModal({ mealId: meal.id, position: meal.position, mealName: meal.name });
      return;
    }
    setSaving(meal.id);
    try {
      const { data } = await supabase.from("meal_adherence_logs").upsert({
        client_id: clientId, log_date: selectedDate, meal_id: meal.id,
        meal_position: meal.position, adherence: adherenceKey,
        off_plan_details: null, est_kcal: null, est_protein: null,
        est_carbs: null, est_fats: null, source: "client",
        notes: notesMap[meal.position] || null,
      }, { onConflict: "client_id,log_date,meal_position" }).select().single();
      if (data) setLogs(prev => [...prev.filter(l => l.meal_position !== meal.position), data as AdherenceLog]);
    } finally { setSaving(null); }
  }

  async function saveAmounts() {
    if (!amountsModal) return;
    setSavingAmounts(true);
    try {
      const meal = sortedMeals.find(m => m.id === amountsModal.mealId);
      const overrides: Record<string, { amount: number }> = {};
      for (const it of meal?.meal_items || []) {
        const v = amountEdits[it.id];
        if (v == null || v === "") continue;
        const n = parseFloat(v);
        if (!isFinite(n) || n < 0) continue;
        if (it.amount != null && Math.abs(n - it.amount) < 1e-9) continue; // unchanged from plan
        overrides[it.id] = { amount: n };
      }
      const existing = logs.find(l => l.meal_position === amountsModal.position);
      const cleanAdds = amountAdds.filter(a => a.name && a.servings > 0);
      const ovPayload: Record<string, any> = { ...overrides };
      if (cleanAdds.length) ovPayload.__added = cleanAdds;
      const { data, error } = await supabase.from("meal_adherence_logs").upsert({
        client_id: clientId, log_date: selectedDate, meal_id: amountsModal.mealId,
        meal_position: amountsModal.position,
        adherence: existing?.adherence || "Full",
        item_overrides: (Object.keys(overrides).length || cleanAdds.length) ? ovPayload : null,
        source: "client",
      }, { onConflict: "client_id,log_date,meal_position" }).select().single();
      if (error) { alert("Couldn't save the adjusted amounts. Please try again."); return; }
      if (data) setLogs(prev => [...prev.filter(l => l.meal_position !== amountsModal.position), data as AdherenceLog]);
      setAmountsModal(null);
    } finally { setSavingAmounts(false); }
  }

  async function saveNotes(position: number) {
    const note = notesMap[position] || null;
    const existing = logs.find(l => l.meal_position === position);
    if (!existing) return;
    await supabase.from("meal_adherence_logs").update({ notes: note }).eq("id", existing.id);
  }

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    setPhotoResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        const res = await fetch("/api/analyze-meal-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type || "image/jpeg" }),
        });
        const json = await res.json();
        if (json.error) {
          setPhotoResult("Could not analyze photo.");
        } else {
          setOffPlanKcal(json.calories?.toString() || "");
          setOffPlanP(json.protein_g?.toString() || "");
          setOffPlanC(json.carbs_g?.toString() || "");
          setOffPlanF(json.fat_g?.toString() || "");
          setOffPlanDetails(json.description || "");
          setPhotoResult(`AI detected: ${json.description}`);
        }
      } catch {
        setPhotoResult("Error analyzing photo.");
      } finally {
        setPhotoLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function saveOffPlan() {
    if (!offPlanModal) return;
    const key = offPlanModal.mealId || `pos-${offPlanModal.position}`;
    setSaving(key);
    try {
      const kc = offPlanKcal ? parseFloat(offPlanKcal) : null;
      const pr = offPlanP ? parseFloat(offPlanP) : null;
      const cb = offPlanC ? parseFloat(offPlanC) : null;
      const ft = offPlanF ? parseFloat(offPlanF) : null;
      const { data } = await supabase.from("meal_adherence_logs").upsert({
        client_id: clientId, log_date: selectedDate, meal_id: offPlanModal.mealId,
        meal_position: offPlanModal.position, adherence: "Off-plan",
        off_plan_details: offPlanDetails || null,
        est_kcal:    kc,
        est_protein: pr,
        est_carbs:   cb,
        est_fats:    ft,
        // Structured JSONB (with description) for the nightly rollup / Claude.
        off_plan_macros: kc != null
          ? { kcal: kc, protein: pr || 0, carbs: cb || 0, fats: ft || 0, description: offPlanDetails || "Off-plan meal", estimated: true }
          : null,
        notes: notesMap[offPlanModal.position] || null,
        source: "client",
        photo_url: null,
        off_plan_notes: offPlanNotes || null,
      }, { onConflict: "client_id,log_date,meal_position" }).select().single();
      if (data) setLogs(prev => [...prev.filter(l => l.meal_position !== offPlanModal.position), data as AdherenceLog]);
      setOffPlanModal(null); setOffPlanNotes("");
    } finally { setSaving(null); }
  }

  function openFreeSlot(slot: typeof FREE_SLOTS[0]) {
    const existing = logs.find(l => l.meal_position === slot.position);
    setOffPlanDetails(existing?.off_plan_details || "");
    setOffPlanKcal(existing?.est_kcal?.toString() || "");
    setOffPlanP(existing?.est_protein?.toString() || "");
    setOffPlanC(existing?.est_carbs?.toString() || "");
    setOffPlanF(existing?.est_fats?.toString() || "");
    setPhotoResult(null);
    setOffPlanModal({ mealId: null, position: slot.position, mealName: slot.label });
  }

  async function deleteLog(position: number) {
    const existing = logs.find(l => l.meal_position === position);
    if (!existing) return;
    setSaving(`del-${position}`);
    try {
      await supabase.from("meal_adherence_logs").delete().eq("id", existing.id);
      setLogs(prev => prev.filter(l => l.meal_position !== position));
    } finally { setSaving(null); }
  }

  // ---- Multi-option slot bottom sheet (Mockup B) ----
  // Sensible +/- step per unit (grams jump by 10, cups by 0.25, etc.).
  function stepFor(unit: string | null) {
    const u = (unit || "").toLowerCase();
    if (u === "g" || u === "gram" || u === "grams") return 10;
    if (u.includes("cup")) return 0.25;
    if (u.includes("tbsp") || u.includes("tsp") || u.includes("scoop")) return 0.5;
    if (u === "oz") return 1;
    return 1;
  }
  // Seed the draft item amounts + added items for a given option (applying any
  // existing per-day override only when the existing log is for that same option).
  function seedSheetDraft(meal: Meal, existing: AdherenceLog | null | undefined) {
    const seed: Record<string, number> = {};
    for (const it of meal.meal_items || []) {
      const ov = existing?.item_overrides?.[it.id]?.amount;
      seed[it.id] = ov != null ? Number(ov) : (it.amount != null ? Number(it.amount) : 0);
    }
    setSheetItems(seed);
    setSheetAdds((existing?.item_overrides?.__added as typeof sheetAdds) || []);
  }
  function openSlotSheet(slot: { position: number; options: Meal[] }) {
    const existing = logs.find(l => l.meal_position === slot.position);
    const validAdh = existing?.adherence && ADHERENCE_OPTIONS.some(o => o.key === existing.adherence);
    const chosenId = existing?.meal_id || slot.options[0].id;
    const chosen = slot.options.find(o => o.id === chosenId) || slot.options[0];
    setSheetOptId(chosen.id);
    setSheetAdh(validAdh ? existing!.adherence : "Full");
    seedSheetDraft(chosen, existing?.meal_id === chosen.id ? existing : null);
    setSheetQ(""); setSheetResults([]);
    setSlotSheet({ position: slot.position, timing: slot.options[0].timing || "" });
  }
  function pickSheetOption(slot: { position: number; options: Meal[] }, optId: string) {
    setSheetOptId(optId);
    const opt = slot.options.find(o => o.id === optId);
    const existing = logs.find(l => l.meal_position === slot.position);
    if (opt) seedSheetDraft(opt, existing?.meal_id === optId ? existing : null);
    setSheetQ(""); setSheetResults([]);
  }
  function closeSlotSheet() { setSlotSheet(null); }
  // Live macros for the drafted option (full option; adherence scaling handled by currentMacros).
  function draftOptionMacros(meal: Meal) {
    let p = 0, c = 0, f = 0;
    for (const it of meal.meal_items || []) {
      const amt = sheetItems[it.id];
      const scale = (amt != null && it.amount) ? amt / it.amount : (amt === 0 ? 0 : 1);
      p += (it.protein || 0) * scale; c += (it.carbs || 0) * scale; f += (it.fats || 0) * scale;
    }
    for (const ad of sheetAdds) { const sv = ad.servings || 1; p += ad.p * sv; c += ad.c * sv; f += ad.f * sv; }
    return { protein: p, carbs: c, fats: f, kcal: p * 4 + c * 4 + f * 9 };
  }
  function buildOverridePayload(chosen: Meal): Record<string, any> | null {
    const overrides: Record<string, { amount: number }> = {};
    for (const it of chosen.meal_items || []) {
      const amt = sheetItems[it.id];
      if (amt == null) continue;
      if (it.amount != null && Math.abs(amt - it.amount) < 1e-9) continue;
      overrides[it.id] = { amount: amt };
    }
    const cleanAdds = sheetAdds.filter(a => a.name && a.servings > 0);
    const ovPayload: Record<string, any> = { ...overrides };
    if (cleanAdds.length) ovPayload.__added = cleanAdds;
    const hasOv = Object.keys(overrides).length > 0 || cleanAdds.length > 0;
    return hasOv ? ovPayload : null;
  }
  async function writeOptionLog(chosen: Meal, targetPos: number): Promise<boolean> {
    setSaving(chosen.id);
    try {
      const { data, error } = await supabase.from("meal_adherence_logs").upsert({
        client_id: clientId, log_date: selectedDate, meal_id: chosen.id,
        meal_position: targetPos, adherence: sheetAdh,
        item_overrides: buildOverridePayload(chosen),
        off_plan_details: null, est_kcal: null, est_protein: null, est_carbs: null, est_fats: null,
        source: "client", notes: notesMap[targetPos] || null,
      }, { onConflict: "client_id,log_date,meal_position" }).select().single();
      if (error) { alert("Couldn't save this meal. Please try again."); return false; }
      if (data) setLogs(prev => [...prev.filter(l => l.meal_position !== targetPos), data as AdherenceLog]);
      return true;
    } finally { setSaving(null); }
  }
  function openOffPlanAt(pos: number, mealName: string) {
    setOffPlanDetails(""); setOffPlanKcal(""); setOffPlanP(""); setOffPlanC(""); setOffPlanF("");
    setPhotoResult(null); setOffPlanNotes("");
    setOffPlanModal({ mealId: null, position: pos, mealName });
    closeSlotSheet();
  }
  async function saveSlotSheet(slot: { position: number; options: Meal[] }) {
    const chosen = slot.options.find(o => o.id === sheetOptId);
    if (!chosen) return;
    // Extra meals land on a fresh 101+ position; plan slots keep their own position.
    const targetPos = slotSheet?.extra ? slotSheet.position : chosen.position;
    if (sheetAdh === "Off-plan") { openOffPlanAt(targetPos, chosen.name); return; }
    if (await writeOptionLog(chosen, targetPos)) closeSlotSheet();
  }
  // "+2nd" — log the drafted option as a SECOND entry (fresh position, never overwrites the slot).
  async function saveSlotAsSecond() {
    const chosen = slots.flatMap(s => s.options).find(o => o.id === sheetOptId);
    if (!chosen) return;
    const pos = nextQuickPos(logs);
    if (sheetAdh === "Off-plan") { openOffPlanAt(pos, chosen.name); return; }
    if (await writeOptionLog(chosen, pos)) closeSlotSheet();
  }
  function openExtraSheet() {
    const pos = nextQuickPos(logs);
    setSheetOptId(""); setSheetAdh("Full"); setSheetItems({}); setSheetAdds([]);
    setSheetQ(""); setSheetResults([]);
    setSlotSheet({ position: pos, timing: "Extra meal / snack", extra: true });
  }
  // Row renderer for extra meals / snacks (positions 100+) shown in the plan day view.
  function renderExtraRow(l: AdherenceLog) {
    const meal = l.meal_id ? sortedMeals.find(m => m.id === l.meal_id) : null;
    const opt = ADHERENCE_OPTIONS.find(o => o.key === l.adherence);
    const color = opt?.color || "#8b5cf6";
    const name = meal ? meal.name : (l.off_plan_details || "Extra entry");
    const mac = meal ? loggedOptionMacros(meal, l) : { kcal: Number(l.est_kcal) || 0, protein: Number(l.est_protein) || 0, carbs: Number(l.est_carbs) || 0, fats: Number(l.est_fats) || 0 };
    return (
      <div key={`extra-${l.id}`} className="rounded-2xl p-3 flex items-center justify-between" style={{ background: "var(--brand-surface)", border: `1.5px solid ${color}30` }}>
        <div className="min-w-0 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--brand-text)" }}>{name}</p>
            <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{Math.round(mac.kcal)} cal · {Math.round(mac.protein)}P · {Math.round(mac.carbs)}C · {Math.round(mac.fats)}F{l.macros_pending ? " · pending" : ""}</p>
          </div>
        </div>
        <button onClick={() => deleteLog(l.meal_position)} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }} title="Delete"><i className="ti ti-trash text-sm" /></button>
      </div>
    );
  }
  // Macros for a logged option, applying any per-day item_overrides (mirrors currentMacros).
  function loggedOptionMacros(meal: Meal, log: AdherenceLog | undefined) {
    const ov = log?.item_overrides;
    if (!ov || !Object.keys(ov).length) return getMealMacros(meal);
    let p = 0, c = 0, f = 0;
    for (const it of meal.meal_items || []) {
      const o = ov[it.id]?.amount;
      const scale = (o != null && it.amount) ? o / it.amount : 1;
      p += (it.protein || 0) * scale; c += (it.carbs || 0) * scale; f += (it.fats || 0) * scale;
    }
    for (const ad of (ov.__added as { servings?: number; p?: number; c?: number; f?: number }[]) || []) {
      const sv = ad.servings || 1; p += (ad.p || 0) * sv; c += (ad.c || 0) * sv; f += (ad.f || 0) * sv;
    }
    return { kcal: p * 4 + c * 4 + f * 9, protein: p, carbs: c, fats: f };
  }
  // Compact row for a multi-option slot.
  function renderMultiSlot(slot: { position: number; options: Meal[] }) {
    const slotLog = logs.find(l => l.meal_position === slot.position);
    const picked = slotLog ? slot.options.find(o => o.id === slotLog.meal_id) : null;
    const logOpt = slotLog ? ADHERENCE_OPTIONS.find(o => o.key === slotLog.adherence) : null;
    const logColor = logOpt?.color || null;
    const isOffPlan = slotLog?.adherence === "Off-plan";
    const macros = picked
      ? loggedOptionMacros(picked, slotLog)
      : (slotLog && isOffPlan)
        ? { kcal: Number(slotLog.est_kcal) || 0, protein: Number(slotLog.est_protein) || 0, carbs: Number(slotLog.est_carbs) || 0, fats: Number(slotLog.est_fats) || 0 }
        : null;
    const subtitle = picked
      ? picked.name
      : isOffPlan
        ? (slotLog?.off_plan_details || "Off-plan")
        : `${slot.options.length} options · tap to choose`;
    return (
      <div key={`slot-${slot.position}`} onClick={() => openSlotSheet(slot)}
        className="rounded-2xl overflow-hidden cursor-pointer"
        style={{ background: "var(--brand-surface)", border: slotLog && logColor ? `1.5px solid ${logColor}40` : "1px solid var(--brand-border)" }}>
        <div className="flex items-start justify-between gap-2 p-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: slotLog && logColor ? `${logColor}20` : "var(--brand-card)" }}>
              {slotLog && logColor
                ? <div className="w-3 h-3 rounded-full" style={{ background: logColor }} />
                : <span className="text-sm font-bold" style={{ color: "var(--brand-text-secondary)" }}>M{slot.position}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate leading-tight" style={{ color: "var(--brand-text)" }}>{slotTitle(slot)}</p>
              <p className="text-xs mt-0.5 truncate leading-tight" style={{ color: "var(--brand-text-secondary)" }}>{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0" style={{ maxWidth: "44%" }}>
            {logOpt
              ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${logOpt.color}20`, color: logOpt.color }}>{logOpt.label}</span>
              : <i className="ti ti-chevron-right text-lg" style={{ color: "var(--brand-text-secondary)" }} />}
            {macros && (
              <div className="text-right leading-tight">
                <p className="text-xs font-bold whitespace-nowrap" style={{ color: "var(--brand-text)" }}>{Math.round(macros.kcal)} cal</p>
                <p className="text-xs whitespace-nowrap" style={{ color: "var(--brand-text-secondary)" }}>{Math.round(macros.protein)}P·{Math.round(macros.carbs)}C·{Math.round(macros.fats)}F</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const offPlanSavingKey = offPlanModal ? (offPlanModal.mealId || `pos-${offPlanModal.position}`) : null;

  return (
    <div className="pb-24" style={{ background: "var(--brand-bg)", minHeight: "100vh" }}>

      {/* Date navigation (supports back-filling previous days) */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} aria-label="Previous day" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}><i className="ti ti-chevron-left" /></button>
        <div className="text-center">
          <div className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{formatNutritionDate(selectedDate)}</div>
          {selectedDate !== today ? (<button onClick={() => setSelectedDate(today)} className="text-xs underline" style={{ color: "var(--brand-primary)" }}>Back to today</button>) : (<div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Today</div>)}
        </div>
        <button onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} disabled={selectedDate >= today} aria-label="Next day" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", opacity: selectedDate >= today ? 0.4 : 1 }}><i className="ti ti-chevron-right" /></button>
      </div>

      {/* Shared animated macro header (both tabs) */}
      <div style={{ display: "flex", gap: 4, margin: "0 16px 8px" }}>
        {MACRO_RANGES.map((r) => (
          <button key={r.key} onClick={() => setMacroRange(r.key)} style={{ flex: 1, padding: "6px 4px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: macroRange === r.key ? "var(--brand-primary)" : "rgba(127,140,170,0.14)", color: macroRange === r.key ? "#fff" : "var(--brand-text)" }}>{r.label}</button>
        ))}
      </div>
      {macroRange !== "1d" && rangeAvg && (
        <div style={{ textAlign: "center", fontSize: 11, opacity: 0.6, marginBottom: 4 }}>avg / day · logged {rangeAvg.loggedDays} of {rangeAvg.totalDays} days</div>
      )}
      <MacroHeader macros={macroRange !== "1d" && rangeAvg ? rangeAvg : currentMacros} target={macroTarget} />

      {/* Segmented tabs */}
      <div className="mx-4 mt-3 flex rounded-full p-1 relative" style={{ background: "rgba(127,140,170,0.14)", border: "1px solid var(--brand-border)" }}>
        <div aria-hidden className="absolute top-1 bottom-1 rounded-full transition-transform duration-300 ease-out" style={{ left: 4, width: "calc(50% - 4px)", background: "var(--brand-surface)", boxShadow: "0 3px 10px rgba(20,30,55,0.10)", transform: tab === "plan" ? "translateX(0)" : "translateX(100%)" }} />
        <button onClick={() => setTab("plan")} className="flex-1 py-2.5 rounded-full text-sm font-bold transition-all relative z-10" style={tab === "plan" ? { color: "var(--brand-text)" } : { color: "var(--brand-text-secondary)" }}>My plan</button>
        <button onClick={() => setTab("quick")} className="flex-1 py-2.5 rounded-full text-sm font-bold transition-all relative z-10" style={tab === "quick" ? { color: "var(--brand-text)" } : { color: "var(--brand-text-secondary)" }}>Quick log</button>
      </div>

      {/* Hidden camera input */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handlePhotoCapture} />

      {/* Off-Plan Modal */}
      {offPlanModal && (
        <div className="fixed inset-0 z-[1100] flex items-end" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setOffPlanModal(null)}>
          <div className="w-full rounded-t-3xl p-5" style={{ background: "var(--brand-surface)", maxHeight: "85vh", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", paddingBottom: "calc(28px + env(safe-area-inset-bottom))" }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-base" style={{ color: "var(--brand-text)" }}>
                {mealPlan ? `Off-Plan: ${offPlanModal.mealName}` : `Log ${offPlanModal.mealName}`}
              </h3>
              <button onClick={() => setOffPlanModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
              {mealPlan ? "What did you have instead?" : "What did you eat?"} Snap a photo and the AI fills in the macros.
            </p>
            {/* Prominent camera / AI photo button — the primary off-plan entry */}
            <button
              onClick={() => cameraRef.current?.click()}
              disabled={photoLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold mb-3"
              style={{ background: "#0EA5E920", color: "#0EA5E9", border: "1px solid #0EA5E940" }}>
              {photoLoading
                ? <><i className="ti ti-loader-2 animate-spin" /> Analyzing photo…</>
                : <><i className="ti ti-camera" /> Snap a photo for AI macro analysis</>
              }
            </button>
            {photoResult && (
              <div className="mb-3 px-3 py-2 rounded-xl text-xs"
                style={{ background: "#0EA5E910", color: "#0EA5E9", border: "1px solid #0EA5E930" }}>
                {photoResult}
              </div>
            )}
            <textarea value={offPlanDetails} onChange={e => setOffPlanDetails(e.target.value)}
              placeholder="Describe what you ate..." className="w-full rounded-xl p-3 text-sm outline-none resize-none mb-3" rows={2}
              style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: "kcal",      value: offPlanKcal, set: setOffPlanKcal },
                { label: "Protein g", value: offPlanP,    set: setOffPlanP    },
                { label: "Carbs g",   value: offPlanC,    set: setOffPlanC    },
                { label: "Fats g",    value: offPlanF,    set: setOffPlanF    },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-xs mb-1 text-center" style={{ color: "var(--brand-text-secondary)" }}>{f.label}</p>
                  <input type="number" value={f.value} onChange={e => f.set(e.target.value)}
                    placeholder="0" inputMode="decimal"
                    className="w-full text-center text-sm py-2 rounded-xl outline-none"
                    style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                </div>
              ))}
            </div>
                        <textarea
              placeholder="What did you have? (optional)"
              className="w-full border rounded-lg p-2 text-sm resize-none mb-2"
              rows={2}
              value={offPlanNotes}
              onChange={e => setOffPlanNotes(e.target.value)}
            />
<button onClick={saveOffPlan} disabled={saving === offPlanSavingKey}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white"
              style={{ background: "#8b5cf6" }}>
              {saving === offPlanSavingKey ? "Saving..." : mealPlan ? "Log Off-Plan" : "Save Meal"}
            </button>
          </div>
        </div>
      )}

      {/* Adjust-amounts sheet (per-day override; the trainer's plan is never edited) */}
      {amountsModal && (
        <div className="fixed inset-0 z-[1100] flex items-end" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setAmountsModal(null)}>
          <div className="w-full rounded-t-3xl p-5" style={{ background: "var(--brand-surface)", maxHeight: "85vh", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", paddingBottom: "calc(28px + env(safe-area-inset-bottom))" }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-base" style={{ color: "var(--brand-text)" }}>
                Adjust amounts: {amountsModal.mealName}
              </h3>
              <button onClick={() => setAmountsModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
              Change how much you actually ate — your plan stays the same, and today&apos;s macros scale to match.
            </p>
            {(sortedMeals.find(m => m.id === amountsModal.mealId)?.meal_items || [])
              .filter(it => !it.is_unlimited)
              .sort((a, b) => a.position - b.position)
              .map(it => (
                <div key={it.id} className="flex items-center gap-2 mb-2">
                  <span className="flex-1 text-sm truncate" style={{ color: "var(--brand-text)" }}>{it.food}</span>
                  <input type="number" value={amountEdits[it.id] ?? ""} inputMode="decimal"
                    onChange={e => setAmountEdits(prev => ({ ...prev, [it.id]: e.target.value }))}
                    className="w-20 text-center text-sm py-2 rounded-xl outline-none"
                    style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                  <span className="text-xs w-16 truncate" style={{ color: "var(--brand-text-secondary)" }}>{it.unit || ""}</span>
                </div>
              ))}
            <div className="mt-3 mb-1">
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--brand-text)" }}>Add / swap in from library</p>
              <input type="text" value={amtQ} onChange={e => setAmtQ(e.target.value)} placeholder="Search foods to add..."
                className="w-full text-sm px-3 py-2 rounded-xl outline-none"
                style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
              {amtResults.length > 0 && (
                <div className="mt-1 rounded-xl overflow-hidden" style={{ border: "1px solid var(--brand-border)" }}>
                  {amtResults.map(fd => (
                    <button key={fd.id}
                      onClick={() => { setAmountAdds(prev => [...prev, addedFromFood(fd)]); setAmtQ(""); setAmtResults([]); }}
                      className="w-full text-left px-3 py-2 text-sm"
                      style={{ background: "var(--brand-surface)", color: "var(--brand-text)", borderBottom: "1px solid var(--brand-border)" }}>
                      {fd.name}
                      <span className="ml-1 text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                        {Math.round(fd.protein || 0)}P · {Math.round(fd.carbs || 0)}C · {Math.round(fd.fats || 0)}F{fd.serving ? ` / ${fd.serving}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {amountAdds.map((ad, i) => (
                <div key={i} className="flex items-center gap-1.5 mt-2">
                  <span className="flex-1 text-sm truncate" style={{ color: "var(--brand-text)" }}>&#65291; {ad.name}</span>
                  <input type="number" value={ad.amount ?? 1} inputMode="decimal"
                    onChange={e => { const v = parseFloat(e.target.value); setAmountAdds(prev => prev.map((x, j) => j === i ? reServings({ ...x, amount: isFinite(v) && v >= 0 ? v : 0 }) : x)); }}
                    className="w-14 text-center text-sm py-2 rounded-xl outline-none"
                    style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                  <select value={ad.unit ?? "serving"} onChange={e => setAmountAdds(prev => prev.map((x, j) => j === i ? reServings({ ...x, unit: e.target.value }) : x))}
                    className="text-xs py-2 rounded-xl outline-none" style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)", maxWidth: 74 }}>
                    {unitsForServing(ad.serving).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <button onClick={() => setAmountAdds(prev => prev.filter((_, j) => j !== i))}
                    className="text-sm" style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>&#10005;</button>
                </div>
              ))}
            </div>
            <button onClick={saveAmounts} disabled={savingAmounts}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white mt-2"
              style={{ background: "var(--brand-primary)", opacity: savingAmounts ? 0.6 : 1 }}>
              {savingAmounts ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {/* Multi-option slot bottom sheet (Mockup B) */}
      {slotSheet && (() => {
        const slot = slotSheet.extra
          ? { position: slotSheet.position, options: slots.flatMap(s => s.options) }
          : slots.find(s => s.position === slotSheet.position);
        if (!slot) return null;
        const chosen = slot.options.find(o => o.id === sheetOptId) || null;
        const draft = chosen ? draftOptionMacros(chosen) : { kcal: 0, protein: 0, carbs: 0, fats: 0 };
        const existingLog = !slotSheet.extra ? logs.find(l => l.meal_position === slotSheet.position) : undefined;
        return (
          <div className="fixed inset-0 z-[1100] flex items-end" style={{ background: "rgba(0,0,0,0.7)" }}
            onClick={closeSlotSheet}>
            <div className="w-full rounded-t-3xl p-5" style={{ background: "var(--brand-surface)", maxHeight: "88vh", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", paddingBottom: "calc(28px + env(safe-area-inset-bottom))" }}
              onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-base" style={{ color: "var(--brand-text)" }}>{slotSheet.extra ? slotSheet.timing : slotTitle(slot)}</h3>
                <div className="flex items-center gap-3">
                  {existingLog && (
                    <button onClick={() => { deleteLog(slotSheet.position); closeSlotSheet(); }}
                      className="text-xs font-semibold flex items-center gap-1" style={{ color: "#d0384f" }}
                      title="Delete this logged meal">
                      <i className="ti ti-trash text-sm" /> Remove
                    </button>
                  )}
                  <button onClick={closeSlotSheet} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>
              </div>
              <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Which option?</label>
              <select value={sheetOptId} onChange={e => pickSheetOption(slot, e.target.value)}
                className="w-full px-3 py-3 rounded-xl text-sm outline-none"
                style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
                {slotSheet.extra && <option value="">Choose an option…</option>}
                {slot.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {chosen && (
                <>
                  <label className="text-xs font-bold uppercase tracking-wider block mt-4 mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Items — adjust, add or remove</label>
                  <div className="rounded-xl p-2" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                    {(chosen.meal_items || []).slice().sort((a, b) => a.position - b.position).map(it => {
                      if (it.is_unlimited) {
                        return (
                          <div key={it.id} className="flex items-center justify-between py-2 px-1" style={{ borderBottom: "1px dashed var(--brand-border)" }}>
                            <span className="text-sm min-w-0 truncate mr-2" style={{ color: "var(--brand-text)" }}>{it.food}</span>
                            <span className="text-xs flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>unlimited</span>
                          </div>
                        );
                      }
                      const amt = sheetItems[it.id] ?? 0;
                      const removed = amt === 0;
                      const st = stepFor(it.unit);
                      return (
                        <div key={it.id} className="flex items-center gap-2 py-2 px-1" style={{ borderBottom: "1px dashed var(--brand-border)" }}>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate" style={{ color: removed ? "var(--brand-text-secondary)" : "var(--brand-text)", textDecoration: removed ? "line-through" : "none" }}>{it.food}</p>
                            <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{it.unit || ""}{it.amount != null ? ` · plan ${it.amount}` : ""}</p>
                          </div>
                          {removed ? (
                            <button onClick={() => setSheetItems(prev => ({ ...prev, [it.id]: it.amount ?? st }))}
                              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: "var(--brand-card)", color: "var(--brand-primary)" }}>Restore</button>
                          ) : (
                            <>
                              <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0" style={{ border: "1px solid var(--brand-border)" }}>
                                <button onClick={() => setSheetItems(prev => ({ ...prev, [it.id]: Math.max(0, +((prev[it.id] ?? 0) - st).toFixed(2)) }))}
                                  className="w-8 h-8 text-base font-bold" style={{ background: "var(--brand-card)", color: "var(--brand-primary)" }}>−</button>
                                <input type="number" inputMode="decimal" value={amt}
                                  onChange={e => { const v = parseFloat(e.target.value); setSheetItems(prev => ({ ...prev, [it.id]: isFinite(v) && v >= 0 ? v : 0 })); }}
                                  className="w-12 text-center text-sm outline-none" style={{ background: "var(--brand-surface)", color: "var(--brand-text)", height: 32, border: "none" }} />
                                <button onClick={() => setSheetItems(prev => ({ ...prev, [it.id]: +(((prev[it.id] ?? 0) + st).toFixed(2)) }))}
                                  className="w-8 h-8 text-base font-bold" style={{ background: "var(--brand-card)", color: "var(--brand-primary)" }}>＋</button>
                              </div>
                              <button onClick={() => setSheetItems(prev => ({ ...prev, [it.id]: 0 }))}
                                className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: "#fbe9ec", color: "#d0384f" }} title="Remove"><i className="ti ti-x text-xs" /></button>
                            </>
                          )}
                        </div>
                      );
                    })}
                    {sheetAdds.map((ad, i) => (
                      <div key={"add-" + i} className="flex items-center gap-1.5 py-2 px-1" style={{ borderBottom: "1px dashed var(--brand-border)" }}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate" style={{ color: "var(--brand-text)" }}>＋ {ad.name}</p>
                          <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{Math.round(ad.p * (ad.servings || 0))}P · {Math.round(ad.c * (ad.servings || 0))}C · {Math.round(ad.f * (ad.servings || 0))}F</p>
                        </div>
                        <input type="number" inputMode="decimal" value={ad.amount ?? 1}
                          onChange={e => { const v = parseFloat(e.target.value); setSheetAdds(prev => prev.map((x, j) => j === i ? reServings({ ...x, amount: isFinite(v) && v >= 0 ? v : 0 }) : x)); }}
                          className="w-12 text-center text-sm py-1.5 rounded-lg outline-none flex-shrink-0" style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                        <select value={ad.unit ?? "serving"} onChange={e => setSheetAdds(prev => prev.map((x, j) => j === i ? reServings({ ...x, unit: e.target.value }) : x))}
                          className="text-xs py-1.5 rounded-lg outline-none flex-shrink-0" style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)", maxWidth: 72 }}>
                          {unitsForServing(ad.serving).map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <button onClick={() => setSheetAdds(prev => prev.filter((_, j) => j !== i))}
                          className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: "#fbe9ec", color: "#d0384f" }}><i className="ti ti-x text-xs" /></button>
                      </div>
                    ))}
                    {/* Add item from library */}
                    <div className="pt-2 px-1">
                      <input type="text" value={sheetQ} onChange={e => setSheetQ(e.target.value)} placeholder="Add / swap in a food…"
                        className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={{ background: "var(--brand-surface)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                      {sheetResults.length > 0 && (
                        <div className="mt-1 rounded-lg overflow-hidden" style={{ border: "1px solid var(--brand-border)" }}>
                          {sheetResults.map(fd => (
                            <button key={fd.id}
                              onClick={() => { setSheetAdds(prev => [...prev, addedFromFood(fd)]); setSheetQ(""); setSheetResults([]); }}
                              className="w-full text-left px-3 py-2 text-sm" style={{ background: "var(--brand-surface)", color: "var(--brand-text)", borderBottom: "1px solid var(--brand-border)" }}>
                              {fd.name}<span className="ml-1 text-xs" style={{ color: "var(--brand-text-secondary)" }}>{Math.round(fd.protein || 0)}P · {Math.round(fd.carbs || 0)}C · {Math.round(fd.fats || 0)}F</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {chosen.swaps && <p className="text-xs mt-2 px-1" style={{ color: "var(--brand-text-secondary)" }}><span className="font-medium">Swap: </span>{chosen.swaps}</p>}
                  </div>
                  <div className="flex justify-between text-sm mt-2 px-1">
                    <span style={{ color: "var(--brand-text-secondary)" }}>This option</span>
                    <b style={{ color: "var(--brand-text)" }}>{Math.round(draft.kcal)} cal · {Math.round(draft.protein)}P · {Math.round(draft.carbs)}C · {Math.round(draft.fats)}F</b>
                  </div>
                  <label className="text-xs font-bold uppercase tracking-wider block mt-4 mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>How much did you eat?</label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {ADHERENCE_OPTIONS.map(opt => {
                      const active = sheetAdh === opt.key;
                      return (
                        <button key={opt.key} onClick={() => setSheetAdh(opt.key)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                          style={{ background: active ? `${opt.color}25` : "var(--brand-card)", color: active ? opt.color : "var(--brand-text-secondary)", border: `1.5px solid ${active ? opt.color : "transparent"}` }}>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => saveSlotSheet(slot)} disabled={saving === chosen.id}
                      className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white"
                      style={{ background: "var(--brand-primary)", opacity: saving === chosen.id ? 0.6 : 1 }}>
                      {saving === chosen.id ? "Saving..." : sheetAdh === "Off-plan" ? "Log off-plan…" : slotSheet.extra ? "Add extra meal" : "Log meal"}
                    </button>
                    {!slotSheet.extra && (
                      <button onClick={saveSlotAsSecond} disabled={saving === chosen.id}
                        className="px-4 rounded-2xl text-sm font-bold flex-shrink-0"
                        style={{ background: "var(--brand-card)", color: "var(--brand-primary)", border: "1px solid var(--brand-border)" }}
                        title="Log a second option for this meal too">+2nd</button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Weekly grocery-list sheet */}
      {showGrocery && mealPlan && (
        <GroceryListSheet plan={mealPlan as unknown as { id: string; meals: { id: string; name: string; timing: string | null; position: number; meal_items: { id: string; food: string; amount: number | null; unit: string | null; is_unlimited: boolean; position: number }[] }[] }} onClose={() => setShowGrocery(false)} />
      )}

      {/* Header */}
      {!isTrainer && (
        <div className="px-4 pt-6 pb-4" style={{ background: "var(--brand-surface)", borderBottom: "1px solid var(--brand-border)" }}>
          <h1 className="text-xl font-bold mb-0.5" style={{ color: "var(--brand-text)" }}>Nutrition</h1>
          <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            {new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </p>
        </div>
      )}
      {isTrainer && (
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{clientName}</p>
          <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            {new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </p>
        </div>
      )}

      {/* === NO MEAL PLAN === */}
      {tab === "plan" && !mealPlan && (
        <div className="px-4 mt-4">
          {logs.length === 0 && (
            <div className="rounded-2xl p-5 mb-4 text-center" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <i className="ti ti-salad text-3xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} />
              <p className="font-semibold text-sm mb-1" style={{ color: "var(--brand-text)" }}>No Meal Plan Yet</p>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Your trainer will assign your meal plan soon. You can still log your meals below.</p>
            </div>
          )}
          <p className="text-xs font-semibold uppercase tracking-widest mb-3 px-1" style={{ color: "var(--brand-text-secondary)" }}>
            Log Today&apos;s Meals
          </p>
          <div className="space-y-2">
            {FREE_SLOTS.map(slot => {
              const logged = logs.find(l => l.meal_position === slot.position);
              return (
                <div key={slot.position} className="rounded-2xl overflow-hidden"
                  style={{ background: "var(--brand-surface)", border: logged ? "1.5px solid #8b5cf640" : "1px solid var(--brand-border)" }}>
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: logged ? "#8b5cf620" : "var(--brand-card)" }}>
                        {logged
                          ? <i className="ti ti-check text-base" style={{ color: "#8b5cf6" }} />
                          : <span className="text-sm font-bold" style={{ color: "var(--brand-text-secondary)" }}>M{slot.position}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm" style={{ color: "var(--brand-text)" }}>{slot.label}</p>
                        {logged?.off_plan_details
                          ? <p className="text-xs mt-0.5 truncate" style={{ color: "var(--brand-text-secondary)" }}>{logged.off_plan_details}</p>
                          : <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{slot.timing}</p>
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {logged && (
                        <button onClick={() => deleteLog(slot.position)}
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}>
                          <i className="ti ti-trash text-xs" />
                        </button>
                      )}
                      <button onClick={() => openFreeSlot(slot)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{ background: logged ? "#8b5cf620" : "var(--brand-primary)", color: logged ? "#8b5cf6" : "white" }}>
                        {logged ? "Edit" : "+ Log"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === WITH MEAL PLAN === */}
      {tab === "plan" && mealPlan && (
        <>
          {/* Weekly grocery-list generator */}
          {planRange === "day" && (
            <div className="px-4 mt-3">
              <button onClick={() => setShowGrocery(true)}
                className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-primary)" }}>
                <i className="ti ti-shopping-cart" /> Weekly grocery list
              </button>
            </div>
          )}

          {/* Meal cards */}
          <div className="px-4 mt-4 space-y-3" style={{ display: planRange === "day" ? undefined : "none" }}>
            {slots.map(slot => {
              if (slot.options.length > 1) return renderMultiSlot(slot);
              const meal = slot.options[0];
              const mealLog  = logs.find(l => l.meal_id === meal.id);
              const macros   = getMealMacros(meal);
              const isLogged = !!mealLog;
              const logOpt   = mealLog ? ADHERENCE_OPTIONS.find(o => o.key === mealLog.adherence) : null;
              const logColor = logOpt?.color || null;
              const isSaving = saving === meal.id;
              const noteVal  = notesMap[meal.position] || "";

              return (
                <div key={meal.id} className="rounded-2xl overflow-hidden"
                  style={{
                    background: "var(--brand-surface)",
                    border: isLogged && logColor ? `1.5px solid ${logColor}40` : "1px solid var(--brand-border)",
                  }}>

                  {/* Card header */}
                  <div className="flex items-start justify-between p-4 pb-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: isLogged && logColor ? `${logColor}20` : "var(--brand-card)" }}>
                        {isLogged && logColor
                          ? <div className="w-3 h-3 rounded-full" style={{ background: logColor }} />
                          : <span className="text-sm font-bold" style={{ color: "var(--brand-text-secondary)" }}>M{meal.position}</span>
                        }
                      </div>
                      <div>
                        <p className="font-semibold text-sm" style={{ color: "var(--brand-text)" }}>{meal.name}</p>
                        {meal.timing && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{meal.timing}</p>
                        )}
                        {macros.kcal > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                            {Math.round(macros.kcal)} cal &middot; {Math.round(macros.protein)}P &middot; {Math.round(macros.carbs)}C &middot; {Math.round(macros.fats)}F
                          </p>
                        )}
                      </div>
                    </div>
                    {isLogged && logColor && logOpt && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                        style={{ background: `${logColor}20`, color: logColor }}>
                        {logOpt.label}
                      </span>
                    )}
                  </div>

                  {/* Food items */}
                  {(meal.meal_items || []).sort((a, b) => a.position - b.position).map(item => (
                    <div key={item.id} className="px-4 py-1.5 flex items-start gap-2"
                      style={{ borderTop: "1px solid var(--brand-border)" }}>
                      <i className="ti ti-point-filled text-xs mt-0.5 flex-shrink-0" style={{ color: "var(--brand-primary)" }} />
                      <span className="text-sm" style={{ color: "var(--brand-text)" }}>
                        {item.food}
                        {!item.is_unlimited && item.amount && (() => {
                          const ov = mealLog?.item_overrides?.[item.id]?.amount;
                          const adjusted = ov != null && ov !== item.amount;
                          return (
                            <span className="ml-1 text-xs" style={{ color: adjusted ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>
                              {adjusted ? (<><s style={{ opacity: 0.55 }}>{item.amount}</s> {ov}</>) : item.amount}{item.unit ? ` ${item.unit}` : ""}{adjusted ? " (adjusted)" : ""}
                            </span>
                          );
                        })()}
                        {item.is_unlimited && (
                          <span className="ml-1 text-xs" style={{ color: "var(--brand-text-secondary)" }}>(unlimited)</span>
                        )}
                      </span>
                    </div>
                  ))}

                  {/* Items added for this day via the adjust-amounts sheet */}
                  {(mealLog?.item_overrides?.__added as { name?: string; servings?: number; amount?: number; unit?: string }[] | undefined)?.map((ad, adi) => (
                    <div key={"added-" + adi} className="px-4 py-1.5 flex items-start gap-2"
                      style={{ borderTop: "1px solid var(--brand-border)" }}>
                      <i className="ti ti-plus text-xs mt-0.5 flex-shrink-0" style={{ color: "var(--brand-primary)" }} />
                      <span className="text-sm" style={{ color: "var(--brand-text)" }}>
                        {ad.name}
                        <span className="ml-1 text-xs" style={{ color: "var(--brand-primary)" }}>
                          {ad.amount != null && ad.unit ? `${ad.amount} ${ad.unit} ` : (ad.servings && ad.servings !== 1 ? `×${ad.servings} ` : "")}(added)
                        </span>
                      </span>
                    </div>
                  ))}

                  {/* Swaps */}
                  {meal.swaps && (
                    <div className="mx-4 my-2 px-3 py-2 rounded-xl text-xs"
                      style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}>
                      <span className="font-medium">Swap: </span>{meal.swaps}
                    </div>
                  )}

                  {/* Off-plan details */}
                  {mealLog?.adherence === "Off-plan" && mealLog.off_plan_details && (
                    <div className="mx-4 my-2 px-3 py-2 rounded-xl text-xs"
                      style={{ background: "#8b5cf610", color: "#8b5cf6", border: "1px solid #8b5cf630" }}>
                      <span className="font-medium">Had: </span>{mealLog.off_plan_details}
                      {(mealLog.est_protein || mealLog.est_carbs || mealLog.est_fats) && (
                        <span className="ml-2 opacity-80">
                          {mealLog.est_kcal ? `${Math.round(mealLog.est_kcal)} cal \u00b7 ` : ""}
                          {mealLog.est_protein ? `${Math.round(mealLog.est_protein)}P` : ""}
                          {mealLog.est_carbs   ? ` ${Math.round(mealLog.est_carbs)}C`  : ""}
                          {mealLog.est_fats    ? ` ${Math.round(mealLog.est_fats)}F`   : ""}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Adherence pill chips: \u00bc \u00b7 \u00bd \u00b7 \u00be \u00b7 Full \u00b7 Off Plan + Camera */}
                  <div className="px-3 pt-2 pb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {ADHERENCE_OPTIONS.map(opt => {
                        const isActive = mealLog?.adherence === opt.key;
                        return (
                          <button key={opt.key}
                            onClick={() => logAdherence(meal, opt.key)}
                            disabled={isSaving}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                            style={{
                              background: isActive ? `${opt.color}25` : "var(--brand-card)",
                              color: isActive ? opt.color : "var(--brand-text-secondary)",
                              border: `1.5px solid ${isActive ? opt.color : "transparent"}`,
                              opacity: isSaving ? 0.5 : 1,
                            }}>
                            {opt.label}
                          </button>
                        );
                      })}
                      {/* Camera button \u2014 beside Off Plan */}
                      <button
                        onClick={() => {
                          const existing = logs.find(l => l.meal_id === meal.id);
                          setOffPlanDetails(existing?.off_plan_details || "");
                          setOffPlanKcal(existing?.est_kcal?.toString() || "");
                          setOffPlanP(existing?.est_protein?.toString() || "");
                          setOffPlanC(existing?.est_carbs?.toString() || "");
                          setOffPlanF(existing?.est_fats?.toString() || "");
                          setPhotoResult(null);
                          setOffPlanModal({ mealId: meal.id, position: meal.position, mealName: meal.name });
                          setTimeout(() => cameraRef.current?.click(), 120);
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}
                        title="Snap photo for AI macro analysis">
                        <i className="ti ti-camera text-sm" />
                      </button>
                      {/* Adjust food amounts (per-day override; plan stays canonical) */}
                      <button
                        onClick={() => {
                          const existing = logs.find(l => l.meal_position === meal.position);
                          const seed: Record<string, string> = {};
                          for (const it of meal.meal_items || []) {
                            const ov = existing?.item_overrides?.[it.id]?.amount;
                            seed[it.id] = ov != null ? String(ov) : (it.amount != null ? String(it.amount) : "");
                          }
                          setAmountEdits(seed);
                          setAmountAdds(existing?.item_overrides?.__added || []);
                          setAmtQ(""); setAmtResults([]);
                          setAmountsModal({ mealId: meal.id, position: meal.position, mealName: meal.name });
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}
                        title="Adjust food amounts">
                        <i className="ti ti-pencil text-sm" />
                      </button>
                    </div>
                  </div>

                  {/* Notes field */}
                  <div className="px-3 pb-3">
                    <input
                      type="text"
                      value={noteVal}
                      placeholder="Add a note..."
                      onChange={e => setNotesMap(prev => ({ ...prev, [meal.position]: e.target.value }))}
                      onBlur={() => saveNotes(meal.position)}
                      className="w-full text-xs px-3 py-2 rounded-xl outline-none"
                      style={{
                        background: "var(--brand-bg)",
                        color: "var(--brand-text)",
                        border: "1px solid var(--brand-border)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Extra meals / snacks (positions 100+) + add button */}
          {planRange === "day" && (
            <div className="px-4 mt-3">
              {logs.filter(l => l.meal_position >= 100).length > 0 && (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--brand-text-secondary)" }}>Extra meals &amp; snacks</p>
                  <div className="space-y-2 mb-3">
                    {logs.filter(l => l.meal_position >= 100).slice().sort((a, b) => a.meal_position - b.meal_position).map(l => renderExtraRow(l))}
                  </div>
                </>
              )}
              <button onClick={openExtraSheet}
                className="w-full py-3.5 rounded-2xl text-sm font-bold"
                style={{ background: "var(--brand-surface)", border: "1px dashed var(--brand-border)", color: "var(--brand-primary)" }}>
                ＋ Add an extra meal / snack
              </button>
            </div>
          )}

          {/* 7-day summary */}
          {planRange === "day" && weekLogs.length > 0 && (
            <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--brand-text-secondary)" }}>This Week</p>
              <div className="flex gap-2 flex-wrap">
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day, i) => {
                  const d = new Date();
                  const dow = d.getDay();
                  const diff = i + 1 - (dow === 0 ? 7 : dow);
                  const clone = new Date(d);
                  clone.setDate(d.getDate() + diff);
                  const dateStr = clone.toISOString().split("T")[0];
                  const dayLogs = weekLogs.filter(l => l.log_date === dateStr);
                  const hasLog  = dayLogs.length > 0;
                  const allFull = hasLog && dayLogs.every(l => l.adherence === "Full");
                  return (
                    <div key={day} className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{
                          background: !hasLog ? "var(--brand-card)" : allFull ? "#22c55e20" : "#f59e0b20",
                          border: `1px solid ${!hasLog ? "var(--brand-border)" : allFull ? "#22c55e" : "#f59e0b"}`,
                        }}>
                        <span className="text-xs">{!hasLog ? "-" : allFull ? "check" : "~"}</span>
                      </div>
                      <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      {tab === "quick" && (
        <QuickLog clientId={clientId} selectedDate={selectedDate} logs={logs} setLogs={setLogs} />
      )}
    </div>
  );
}
