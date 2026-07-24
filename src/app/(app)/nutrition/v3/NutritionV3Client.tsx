"use client";

// ============================================================================
// Nutrition Logger v3 — One-Tap Checklist (mockup-01 v5, ship candidate).
// Feature-flagged via client_app_settings.nutrition_v3. The day is a clean
// vertical checklist: one tap on the circle logs a meal Full; everything else
// (partials, off-plan photo/text, editing, plan tooling) lives one tap deeper
// in bottom sheets. All logging writes to meal_adherence_logs via the v3
// protocol documented in src/lib/nutrition/dailyTotals.ts.
// ============================================================================

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import toast, { Toaster } from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import Confetti from "@/components/Confetti";
import {
  PlanMeal, LogRow, CustomMeta, CustomItem, ItemOverrides, Macros,
  computeDayTotals, planMealMacros, customMealMacros, adherencePct,
  kcalOf, EXTRA_POSITIONS, INSERT_POSITION_MIN, INSERT_POSITION_MAX,
} from "@/lib/nutrition/dailyTotals";
import { parseFoodText } from "@/lib/nutrition/parseClient";
import Sheet from "./Sheet";
import FoodSearchSheet from "./FoodSearchSheet";
import ComposerSheet from "./ComposerSheet";
import GroceryListSheet from "../GroceryListSheet";
import PlanRangeView from "../PlanRangeView";
import AveragesStrip from "@/components/nutrition/AveragesStrip";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface MealPlanShape {
  id: string;
  version_number: number;
  effective_date?: string | null;
  meals: PlanMeal[];
}
interface MacroTarget { calories: number; protein: number; carbs: number; fats: number; }
interface DbLog extends LogRow { id: string; log_date: string; client_id?: string; off_plan_macros?: Record<string, unknown> | null; }

interface Props {
  clientId: string;
  clientName: string;
  mealPlan: MealPlanShape | null;
  incomingPlan: { id: string; version_number: number | null; effective_date: string | null; change_reason?: string | null } | null;
  todayLogs: DbLog[];
  macroTarget: MacroTarget | null;
  today: string; // America/Chicago logical date
  isTrainer?: boolean;
}

type SheetState =
  | { kind: "meal"; rowKey: string }
  | { kind: "offplan"; rowKey: string | null; extra?: boolean }
  | { kind: "adjust"; rowKey: string }
  | { kind: "composer"; mode: "swap" | "insert" | "extra" | "slot"; rowKey?: string; at?: number; logNow?: boolean }
  | { kind: "replace"; rowKey: string }
  | { kind: "copyto"; rowKey: string }
  | { kind: "addmeal"; at: number }
  | { kind: "mymeals"; at: number | null; replaceRowKey?: string }
  | { kind: "foodsearch"; target: "adjust" | "extra" | "slot"; rowKey?: string }
  | { kind: "menu" }
  | { kind: "trends" }
  | { kind: "versions" }
  | { kind: "forward" }
  | { kind: "extrapick" }
  | { kind: "saveplan" }
  | null;

interface Row {
  key: string;
  kind: "plan" | "custom" | "openslot";
  position: number;
  options?: PlanMeal[];       // plan slot options (>1 = option-based)
  chosen?: PlanMeal;
  meta?: CustomMeta;
  log?: DbLog;
  defaultOrd: number;
}

const OPEN_SLOTS = [
  { position: 1, name: "Breakfast", time: "8:00 AM" },
  { position: 2, name: "Snack 1", time: "10:30 AM" },
  { position: 3, name: "Lunch", time: "1:00 PM" },
  { position: 4, name: "Snack 2", time: "4:00 PM" },
  { position: 5, name: "Dinner", time: "7:30 PM" },
];

const GREEN = "#22c55e", GOLD = "#C69E3C", BLUE = "#42A5F5", ORANGE = "#f59e0b";
const CARD: React.CSSProperties = { background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 16 };

function shiftDateStr(s: string, delta: number) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
}
function fmtDateLong(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function r(x: number) { return Math.round(x); }

// Photo helpers (same approach as the current logger — compress before upload).
async function compressPhoto(file: File): Promise<{ base64: string; blob: Blob }> {
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.8));
    return { base64: dataUrl.split(",")[1], blob: blob || file };
  } catch {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const rd = new FileReader();
      rd.onload = () => resolve(rd.result as string);
      rd.onerror = reject;
      rd.readAsDataURL(file);
    });
    return { base64: dataUrl.split(",")[1], blob: file };
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function NutritionV3Client(props: Props) {
  const { clientId, clientName, mealPlan, incomingPlan, todayLogs, macroTarget, today } = props;
  const supabase = useMemo(() => createClient(), []);
  const openMode = !mealPlan || !(mealPlan.meals || []).length;

  const [selectedDate, setSelectedDate] = useState(() => {
    try {
      if (typeof window === "undefined") return today;
      const saved = sessionStorage.getItem("sym:nutrition:date:" + clientId);
      const savedOn = sessionStorage.getItem("sym:nutrition:dateSavedOn:" + clientId);
      if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) && savedOn === today) return saved;
      return today;
    } catch { return today; }
  });
  const [logs, setLogs] = useState<DbLog[]>(todayLogs);
  const [sheetStack, setSheetStack] = useState<NonNullable<SheetState>[]>([]);
  const sheet = sheetStack.length ? sheetStack[sheetStack.length - 1] : null;
  const [myMeals, setMyMeals] = useState<{ id: string; name: string; items: CustomItem[] }[]>([]);
  const [myMealsOk, setMyMealsOk] = useState(true);
  const [showGrocery, setShowGrocery] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [coachOn, setCoachOn] = useState(true);
  const [coachApi, setCoachApi] = useState<{ message: string; kind?: string } | null>(null);
  const [versions, setVersions] = useState<{ id: string; version_number: number | null; effective_date: string | null; status: string | null; change_reason: string | null }[]>([]);
  const [optSel, setOptSel] = useState<Record<number, string>>({}); // position → meal_id (option slots, pre-log)
  const [popKey, setPopKey] = useState<string | null>(null);

  const planMeals = useMemo(() => [...(mealPlan?.meals || [])].sort((a, b) => a.position - b.position), [mealPlan]);
  const planPositions = useMemo(() => new Set(planMeals.map((m) => m.position)), [planMeals]);

  // ---- data loading -------------------------------------------------------
  useEffect(() => {
    let on = true;
    try {
      sessionStorage.setItem("sym:nutrition:date:" + clientId, selectedDate);
      sessionStorage.setItem("sym:nutrition:dateSavedOn:" + clientId, today);
    } catch { /* noop */ }
    (async () => {
      const { data } = await supabase.from("meal_adherence_logs").select("*").eq("client_id", clientId).eq("log_date", selectedDate);
      if (on) setLogs((data as DbLog[]) || []);
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, clientId]);

  const loadMyMeals = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("my_meals").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      setMyMeals(((data as Record<string, unknown>[]) || []).map((m) => ({
        id: String(m.id),
        name: String(m.name ?? "My meal"),
        items: (Array.isArray(m.items) ? (m.items as CustomItem[]) : []),
      })));
      setMyMealsOk(true);
    } catch { setMyMealsOk(false); }
  }, [supabase, clientId]);
  useEffect(() => { loadMyMeals(); }, [loadMyMeals]);

  async function saveMyMeal(name: string, items: CustomItem[]) {
    if (!myMealsOk) return;
    try {
      const { data } = await supabase.from("my_meals").insert({ client_id: clientId, name, items }).select().single();
      if (data) setMyMeals((prev) => [{ id: String((data as { id: string }).id), name, items }, ...prev]);
    } catch { /* table not ready — non-fatal */ }
  }

  // ---- day rows -----------------------------------------------------------
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const logAt = (pos: number) => logs.find((l) => l.meal_position === pos);

    if (openMode) {
      for (let i = 0; i < OPEN_SLOTS.length; i++) {
        const s = OPEN_SLOTS[i];
        const log = logAt(s.position);
        if (log?.item_overrides?.__removed) continue;
        out.push({ key: "s" + s.position, kind: "openslot", position: s.position, log, meta: log?.item_overrides?.__custom, defaultOrd: i * 10 });
      }
    } else {
      const byPos: Record<number, PlanMeal[]> = {};
      for (const m of planMeals) (byPos[m.position] ||= []).push(m);
      const positions = Object.keys(byPos).map(Number).sort((a, b) => a - b);
      positions.forEach((pos, i) => {
        const log = logAt(pos);
        if (log?.item_overrides?.__removed) return;
        const options = byPos[pos];
        const meta = log?.item_overrides?.__custom;
        if (meta) {
          out.push({ key: "p" + pos, kind: "custom", position: pos, meta, log, options, defaultOrd: i * 10 });
          return;
        }
        const chosen = options.find((o) => o.id === log?.meal_id) || options.find((o) => o.id === optSel[pos]) || options[0];
        out.push({ key: "p" + pos, kind: "plan", position: pos, options, chosen, log, defaultOrd: i * 10 });
      });
    }

    // Inserted day-custom meals (positions 21–40).
    for (const log of logs) {
      if (log.meal_position < INSERT_POSITION_MIN || log.meal_position > INSERT_POSITION_MAX) continue;
      if (log.item_overrides?.__removed) continue;
      const meta = log.item_overrides?.__custom;
      if (!meta) continue;
      out.push({ key: "c" + log.meal_position, kind: "custom", position: log.meal_position, meta, log, defaultOrd: 1000 + log.meal_position });
    }

    out.sort((a, b) => {
      const ao = a.log?.item_overrides?.__ord ?? a.defaultOrd;
      const bo = b.log?.item_overrides?.__ord ?? b.defaultOrd;
      return ao - bo || a.defaultOrd - b.defaultOrd;
    });
    return out;
  }, [logs, planMeals, openMode, optSel]);

  const extras = useMemo(
    () =>
      logs.filter(
        (l) =>
          !l.item_overrides?.__removed &&
          (l.meal_position >= 101 || // legacy quick-log band still renders
            (EXTRA_POSITIONS.includes(l.meal_position) && !planPositions.has(l.meal_position) && !l.meal_id))
      ),
    [logs, planPositions]
  );

  const totals = useMemo(() => computeDayTotals(logs, planMeals), [logs, planMeals]);

  // ---- row helpers --------------------------------------------------------
  const rowByKey = (key: string) => rows.find((x) => x.key === key);
  function rowLabel(row: Row, idx: number) {
    if (row.kind === "openslot") return OPEN_SLOTS.find((s) => s.position === row.position)?.name || "Slot";
    return "M" + (idx + 1);
  }
  function rowName(row: Row): string {
    if (row.kind === "custom") return row.meta?.name || "Custom meal";
    if (row.kind === "plan") return row.chosen?.name || "";
    return "";
  }
  function rowTime(row: Row): string | null {
    if (row.kind === "custom") return row.meta?.time || null;
    if (row.kind === "plan") return row.chosen?.timing || null;
    return OPEN_SLOTS.find((s) => s.position === row.position)?.time || null;
  }
  function rowMacros(row: Row): Macros {
    if (row.kind === "plan" && row.chosen) return planMealMacros(row.chosen, row.log?.item_overrides);
    if (row.meta) return customMealMacros(row.meta);
    return { kcal: 0, protein: 0, carbs: 0, fats: 0 };
  }
  function isLogged(row: Row): boolean {
    const l = row.log;
    if (!l) return false;
    const ov = l.item_overrides;
    if (ov?.__unlogged || ov?.__custom?.unlogged || ov?.__removed) return false;
    return !!l.adherence;
  }

  // ---- db writes ----------------------------------------------------------
  async function upsertLog(position: number, patch: Partial<DbLog>): Promise<DbLog | null> {
    const payload: Record<string, unknown> = {
      client_id: clientId, log_date: selectedDate, meal_position: position, source: "client", ...patch,
    };
    const { data, error } = await supabase
      .from("meal_adherence_logs")
      .upsert(payload, { onConflict: "client_id,log_date,meal_position" })
      .select()
      .single();
    if (error) { toast.error("Couldn't save — " + error.message.slice(0, 80)); return null; }
    const rowDb = data as DbLog;
    setLogs((prev) => [...prev.filter((l) => l.meal_position !== position), rowDb]);
    return rowDb;
  }
  async function deleteLogRow(id: string) {
    await supabase.from("meal_adherence_logs").delete().eq("id", id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }

  function keepOv(row: Row, extra?: Partial<ItemOverrides>): ItemOverrides | null {
    const prev = { ...(row.log?.item_overrides || {}) } as ItemOverrides;
    delete prev.__unlogged;
    const merged = { ...prev, ...(extra || {}) } as ItemOverrides;
    return Object.keys(merged).length ? merged : null;
  }

  // ---- celebrations -------------------------------------------------------
  const maybeCelebrate = useCallback((nextLogs: DbLog[]) => {
    if (!coachOn || openMode || selectedDate !== today) return;
    const positions = Array.from(planPositions);
    if (!positions.length) return;
    const allLogged = positions.every((pos) => {
      const l = nextLogs.find((x) => x.meal_position === pos);
      if (!l) return false;
      if (l.item_overrides?.__removed) return true; // deleted today — doesn't block the streak
      return !!l.adherence && !l.item_overrides?.__unlogged && !l.item_overrides?.__custom?.unlogged;
    });
    const key = "sym:v3:celebrated:" + clientId + ":" + selectedDate;
    if (allLogged && !sessionStorage.getItem(key)) {
      try { sessionStorage.setItem(key, "1"); } catch { /* noop */ }
      setCelebrate(true);
      toast("🎉 Day complete — every meal logged! 🔥 streak +1", { duration: 3200 });
    }
  }, [coachOn, openMode, planPositions, clientId, selectedDate, today]);
  useEffect(() => { maybeCelebrate(logs); }, [logs, maybeCelebrate]);

  // ---- one-tap + adherence ------------------------------------------------
  async function tapCircle(row: Row) {
    if (row.kind === "openslot") { openSheet({ kind: "meal", rowKey: row.key }); return; }
    if (isLogged(row)) { openSheet({ kind: "meal", rowKey: row.key }); return; }
    setPopKey(row.key);
    setTimeout(() => setPopKey(null), 450);
    if (row.kind === "plan" && row.chosen) {
      await upsertLog(row.position, {
        meal_id: row.chosen.id, adherence: "Full",
        est_kcal: null, est_protein: null, est_carbs: null, est_fats: null,
        off_plan_details: null, macros_pending: false,
        item_overrides: keepOv(row),
      });
      toast.success(rowName(row) ? `${rowName(row)} logged — Full ✓` : "Logged — Full ✓");
    } else if (row.kind === "custom" && row.meta) {
      const meta: CustomMeta = { ...row.meta, unlogged: false };
      const m = customMealMacros(meta);
      await upsertLog(row.position, {
        meal_id: null, adherence: "Off-plan",
        est_kcal: r(m.kcal), est_protein: r(m.protein), est_carbs: r(m.carbs), est_fats: r(m.fats),
        off_plan_details: meta.name, macros_pending: false,
        item_overrides: keepOv(row, { __custom: meta }),
      });
      toast.success(`${meta.name} logged ✓`);
    }
  }

  async function setAdherence(row: Row, key: "Full" | "3/4" | "1/2" | "1/4" | "Skipped") {
    closeAllSheets();
    if (row.kind === "plan" && row.chosen) {
      await upsertLog(row.position, {
        meal_id: row.chosen.id, adherence: key,
        est_kcal: null, est_protein: null, est_carbs: null, est_fats: null,
        off_plan_details: null, macros_pending: false,
        item_overrides: keepOv(row),
      });
    } else if (row.meta) {
      // Custom meals stay adherence 'Off-plan' with prorated est_* so every
      // reader (old UI, trainer rollup) computes the same totals.
      const pct = adherencePct(key) ?? 1;
      const meta: CustomMeta = { ...row.meta, unlogged: false };
      const m = customMealMacros(meta);
      await upsertLog(row.position, {
        meal_id: null,
        adherence: pct === 0 ? "Skipped" : "Off-plan",
        est_kcal: r(m.kcal * pct), est_protein: r(m.protein * pct), est_carbs: r(m.carbs * pct), est_fats: r(m.fats * pct),
        off_plan_details: meta.name, macros_pending: false,
        item_overrides: keepOv(row, { __custom: meta }),
      });
    }
    toast.success(key === "Skipped" ? "Marked skipped" : `Logged — ${key === "Full" ? "Full" : key} ✓`);
  }

  async function unlogRow(row: Row) {
    closeAllSheets();
    const l = row.log;
    if (!l) return;
    if (row.kind === "custom" && row.meta) {
      const meta: CustomMeta = { ...row.meta, unlogged: true };
      await upsertLog(row.position, {
        adherence: "Skipped", est_kcal: null, est_protein: null, est_carbs: null, est_fats: null,
        macros_pending: false, item_overrides: keepOv(row, { __custom: meta }),
      });
    } else {
      const ov = { ...(l.item_overrides || {}) } as ItemOverrides;
      const hasMeaning = Object.keys(ov).some((k) => k !== "__unlogged") || ov.__ord != null;
      if (hasMeaning) {
        await upsertLog(row.position, {
          adherence: "Skipped", est_kcal: null, est_protein: null, est_carbs: null, est_fats: null,
          off_plan_details: null, macros_pending: false,
          item_overrides: { ...ov, __unlogged: true },
        });
      } else {
        await deleteLogRow(l.id);
      }
    }
    toast("Unlogged — edit items, then relog ✓");
  }

  // ---- delete + undo ------------------------------------------------------
  const undoRef = useRef<{ restore: () => Promise<void> } | null>(null);
  function undoToast(msg: string, restore: () => Promise<void>) {
    undoRef.current = { restore };
    toast((t) => (
      <span className="flex items-center gap-3 text-sm">
        {msg}
        <button
          onClick={async () => { toast.dismiss(t.id); await restore(); toast.success("Restored ✓"); }}
          className="px-3 py-1 rounded-lg font-bold"
          style={{ background: "var(--brand-primary)", color: "#fff" }}
        >
          Undo
        </button>
      </span>
    ), { duration: 5000 });
  }

  async function deleteRow(row: Row) {
    closeAllSheets();
    const l = row.log;
    if (row.kind === "plan" || (row.kind === "custom" && planPositions.has(row.position)) || row.kind === "openslot") {
      // Plan slot / open slot: mark removed for today only.
      const prevOv = l?.item_overrides || null;
      const prevLog = l ? { ...l } : null;
      await upsertLog(row.position, {
        adherence: "Skipped", est_kcal: null, est_protein: null, est_carbs: null, est_fats: null,
        macros_pending: false, off_plan_details: null,
        item_overrides: { ...(prevOv || {}), __removed: true },
      });
      undoToast("Meal deleted (today only)", async () => {
        if (prevLog) {
          await upsertLog(row.position, {
            adherence: prevLog.adherence, est_kcal: prevLog.est_kcal ?? null, est_protein: prevLog.est_protein ?? null,
            est_carbs: prevLog.est_carbs ?? null, est_fats: prevLog.est_fats ?? null,
            off_plan_details: prevLog.off_plan_details ?? null, macros_pending: prevLog.macros_pending ?? false,
            item_overrides: prevOv && Object.keys(prevOv).length ? prevOv : null, meal_id: prevLog.meal_id,
          });
        } else {
          const created = logs.find((x) => x.meal_position === row.position);
          if (created?.id) await deleteLogRow(created.id);
          else {
            const { data } = await supabase.from("meal_adherence_logs").select("id").eq("client_id", clientId).eq("log_date", selectedDate).eq("meal_position", row.position).maybeSingle();
            if (data) await deleteLogRow(String((data as { id: string }).id));
          }
        }
      });
    } else if (l) {
      const backup = { ...l } as DbLog;
      await deleteLogRow(l.id);
      undoToast("Meal deleted", async () => {
        await upsertLog(backup.meal_position, {
          meal_id: backup.meal_id, adherence: backup.adherence,
          est_kcal: backup.est_kcal ?? null, est_protein: backup.est_protein ?? null,
          est_carbs: backup.est_carbs ?? null, est_fats: backup.est_fats ?? null,
          off_plan_details: backup.off_plan_details ?? null, macros_pending: backup.macros_pending ?? false,
          item_overrides: backup.item_overrides ?? null,
        });
      });
    }
  }

  // ---- order (drag + move up/down) ---------------------------------------
  const [dragState, setDragState] = useState<{ key: string; overIdx: number } | null>(null);
  const dragRef = useRef<{
    key: string; startY: number; startX: number; pointerId: number;
    timer: ReturnType<typeof setTimeout> | null; active: boolean; ghost: HTMLElement | null; offY: number;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const displayRows = useMemo(() => {
    if (!dragState) return rows;
    const idx = rows.findIndex((x) => x.key === dragState.key);
    if (idx < 0) return rows;
    const copy = [...rows];
    const [moved] = copy.splice(idx, 1);
    copy.splice(Math.max(0, Math.min(copy.length, dragState.overIdx)), 0, moved);
    return copy;
  }, [rows, dragState]);

  async function persistOrder(ordered: Row[]) {
    await Promise.all(ordered.map(async (row, i) => {
      const currentOrd = row.log?.item_overrides?.__ord;
      if (row.log) {
        if (currentOrd === i) return;
        await upsertLog(row.position, { item_overrides: { ...(row.log.item_overrides || {}), __ord: i } });
      } else {
        // Placeholder to carry ordering for an unlogged plan meal.
        await upsertLog(row.position, {
          meal_id: row.chosen?.id ?? null, adherence: "Skipped", macros_pending: false,
          item_overrides: { __unlogged: true, __ord: i },
        });
      }
    }));
  }

  async function moveRow(fromKey: string, dir: number) {
    closeAllSheets();
    const idx = rows.findIndex((x) => x.key === fromKey);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= rows.length) { toast(dir < 0 ? "Already first" : "Already last"); return; }
    const copy = [...rows];
    const [moved] = copy.splice(idx, 1);
    copy.splice(to, 0, moved);
    await persistOrder(copy);
    toast.success("Reordered ✓");
  }

  function onHandleDown(e: React.PointerEvent, key: string) {
    const rowEl = (e.target as HTMLElement).closest("[data-rowkey]") as HTMLElement | null;
    if (!rowEl) return;
    const rect = rowEl.getBoundingClientRect();
    const st = {
      key, startY: e.clientY, startX: e.clientX, pointerId: e.pointerId,
      timer: null as ReturnType<typeof setTimeout> | null, active: false, ghost: null as HTMLElement | null, offY: e.clientY - rect.top,
    };
    st.timer = setTimeout(() => {
      // ~400ms hold → lift
      st.active = true;
      const ghost = rowEl.cloneNode(true) as HTMLElement;
      ghost.style.position = "fixed";
      ghost.style.zIndex = "2000";
      ghost.style.left = rect.left + "px";
      ghost.style.top = rect.top + "px";
      ghost.style.width = rect.width + "px";
      ghost.style.pointerEvents = "none";
      ghost.style.transform = "scale(1.03)";
      ghost.style.boxShadow = "0 16px 36px rgba(0,0,0,0.4)";
      ghost.style.opacity = "0.97";
      document.body.appendChild(ghost);
      st.ghost = ghost;
      const idx = rows.findIndex((x) => x.key === key);
      setDragState({ key, overIdx: idx });
      try { navigator.vibrate?.(10); } catch { /* noop */ }
    }, 400);
    dragRef.current = st;
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const st = dragRef.current;
      if (!st) return;
      if (!st.active) {
        // short press + move = scroll intent → cancel the pending lift
        const dx = e.clientX - st.startX, dy = e.clientY - st.startY;
        if (Math.sqrt(dx * dx + dy * dy) > 10 && st.timer) { clearTimeout(st.timer); dragRef.current = null; }
        return;
      }
      e.preventDefault();
      if (st.ghost) st.ghost.style.top = (e.clientY - st.offY) + "px";
      const container = listRef.current;
      if (!container) return;
      const els = Array.from(container.querySelectorAll("[data-rowkey]")) as HTMLElement[];
      let over = els.length - 1;
      for (let i = 0; i < els.length; i++) {
        const rc = els[i].getBoundingClientRect();
        if (e.clientY < rc.top + rc.height / 2) { over = i; break; }
      }
      setDragState((prev) => (prev ? { ...prev, overIdx: over } : prev));
    }
    function onUp() {
      const st = dragRef.current;
      if (!st) return;
      if (st.timer) clearTimeout(st.timer);
      if (st.ghost) st.ghost.remove();
      dragRef.current = null;
      setDragState((ds) => {
        if (st.active && ds) {
          const idx = rows.findIndex((x) => x.key === ds.key);
          if (idx >= 0 && ds.overIdx !== idx) {
            const copy = [...rows];
            const [moved] = copy.splice(idx, 1);
            copy.splice(Math.max(0, Math.min(copy.length, ds.overIdx)), 0, moved);
            persistOrder(copy).then(() => toast.success("Reordered — renumbered ✓"));
          }
        }
        return null;
      });
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // ---- sheet helpers ------------------------------------------------------
  function openSheet(s: NonNullable<SheetState>) { setSheetStack((prev) => [...prev, s]); }
  function replaceSheet(s: NonNullable<SheetState>) { setSheetStack((prev) => [...prev.slice(0, -1), s]); }
  function backSheet() { setSheetStack((prev) => prev.slice(0, -1)); }
  function closeAllSheets() { setSheetStack([]); }

  // ---- inserted meals -----------------------------------------------------
  function freeInsertPosition(): number | null {
    for (let p = INSERT_POSITION_MIN; p <= INSERT_POSITION_MAX; p++) {
      if (!logs.some((l) => l.meal_position === p)) return p;
    }
    return null;
  }
  function freeExtraPosition(): number {
    for (const p of EXTRA_POSITIONS) {
      if (!planPositions.has(p) && !logs.some((l) => l.meal_position === p)) return p;
    }
    return EXTRA_POSITIONS[EXTRA_POSITIONS.length - 1];
  }

  async function insertCustomMeal(at: number, meta: CustomMeta, logNow: boolean) {
    const pos = freeInsertPosition();
    if (pos == null) { toast.error("Day is full — remove an added meal first"); return; }
    // __ord places it where the ＋ line was tapped.
    const ordBefore = at <= 0 ? -1 : (rows[at - 1]?.log?.item_overrides?.__ord ?? rows[at - 1]?.defaultOrd ?? 0);
    const ordAfter = at >= rows.length ? ordBefore + 20 : (rows[at]?.log?.item_overrides?.__ord ?? rows[at]?.defaultOrd ?? ordBefore + 20);
    const ord = (ordBefore + ordAfter) / 2;
    const m = customMealMacros(meta);
    await upsertLog(pos, {
      meal_id: null,
      adherence: logNow ? "Off-plan" : "Skipped",
      est_kcal: logNow ? r(m.kcal) : null, est_protein: logNow ? r(m.protein) : null,
      est_carbs: logNow ? r(m.carbs) : null, est_fats: logNow ? r(m.fats) : null,
      off_plan_details: meta.name, macros_pending: false,
      item_overrides: { __custom: { ...meta, unlogged: !logNow }, __ord: ord },
    });
  }

  async function addExtra(items: CustomItem[], name: string, photoUrl?: string | null) {
    const pos = freeExtraPosition();
    const existing = logs.find((l) => l.meal_position === pos);
    let allItems = items;
    let label = name;
    if (existing?.item_overrides?.__custom?.items?.length) {
      allItems = [...existing.item_overrides.__custom.items, ...items];
      label = existing.off_plan_details ? existing.off_plan_details + " + " + name : name;
    }
    const m = customMealMacros({ name: label, items: allItems });
    await upsertLog(pos, {
      meal_id: null, adherence: "Off-plan",
      est_kcal: r(m.kcal), est_protein: r(m.protein), est_carbs: r(m.carbs), est_fats: r(m.fats),
      off_plan_details: label, macros_pending: false, photo_url: photoUrl ?? existing?.photo_url ?? null,
      item_overrides: { __custom: { name: label, items: allItems, kind: "extra" } },
    });
    toast.success("Added to your day ✓");
  }

  // ---- coach card ---------------------------------------------------------
  useEffect(() => {
    if (!coachOn || selectedDate !== today) return;
    let on = true;
    const cacheKey = "sym:v3:coach:" + clientId + ":" + today;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) { setCoachApi(JSON.parse(cached)); return; }
    } catch { /* noop */ }
    (async () => {
      try {
        // No question → the coach endpoint returns one proactive insight
        // (metered server-side). Cached per client/day to keep costs tiny.
        const res = await fetch("/api/nutrition-ai/coach", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (json && (json.message || json.text)) {
          const payload = { message: json.message || json.text, kind: json.kind };
          try { sessionStorage.setItem(cacheKey, JSON.stringify(payload)); } catch { /* noop */ }
          if (on) setCoachApi(payload);
        }
      } catch { /* endpoint not deployed yet — local heuristics used */ }
    })();
    return () => { on = false; };
  }, [clientId, selectedDate, today, coachOn]);

  const coach = useMemo(() => {
    if (!coachOn || coachDismissed) return null;
    if (coachApi) return { kind: coachApi.kind === "push" ? "push" : "good", html: coachApi.message };
    const tg = macroTarget;
    const loggedCount = totals.loggedCount;
    if (tg && loggedCount >= 2 && totals.protein < 0.45 * tg.protein && totals.kcal > 0.5 * tg.calories) {
      return { kind: "push", html: `Protein is trailing today — ${r(totals.protein)}g of ${r(tg.protein)}g with most of your calories in. Front-load protein in your remaining meals (egg whites, whey, lean meat).` };
    }
    if (tg && loggedCount > 0 && !openMode) {
      const left = Math.max(0, tg.calories - totals.kcal);
      return { kind: "good", html: `Nice — ${loggedCount} logged. ${left > 0 ? left.toLocaleString() + " cal left; your remaining meals cover it." : "Targets hit — lock it in."}` };
    }
    if (openMode && totals.kcal > 0) {
      return { kind: "good", html: `You've logged ${r(totals.kcal).toLocaleString()} cal so far (${r(totals.protein)}P). Keep building each slot — a full day makes your baseline report solid.` };
    }
    return { kind: "good", html: openMode ? "Tap a slot to build your first meal — search the food database, snap a photo, or type what you ate." : "Tap the circle on your first meal when it's down — one tap logs it Full." };
  }, [coachOn, coachDismissed, coachApi, macroTarget, totals, openMode]);

  // ---- versions -----------------------------------------------------------
  async function openVersions() {
    openSheet({ kind: "versions" });
    const { data } = await supabase
      .from("meal_plans")
      .select("id, version_number, effective_date, status, change_reason")
      .eq("client_id", clientId)
      .order("effective_date", { ascending: false })
      .limit(12);
    setVersions((data as typeof versions) || []);
  }

  // ---- open-plan → real plan ---------------------------------------------
  const [savingPlan, setSavingPlan] = useState(false);
  async function saveDayAsPlan(planName: string, effective: string) {
    setSavingPlan(true);
    try {
      const built = rows.filter((rw) => rw.kind === "openslot" && rw.meta?.items?.length);
      if (!built.length) { toast.error("Build at least one slot first"); return; }
      const totalsAll = computeDayTotals(logs, []);
      const { data: prev } = await supabase.from("meal_plans").select("version_number").eq("client_id", clientId).order("version_number", { ascending: false }).limit(1).maybeSingle();
      const nextVer = ((prev as { version_number?: number } | null)?.version_number || 0) + 1;
      const { data: mp, error: mpErr } = await supabase.from("meal_plans").insert({
        client_id: clientId, version_number: nextVer, effective_date: effective, status: "live",
        change_reason: `Client-built plan from open logging (${planName})`,
      }).select().single();
      if (mpErr || !mp) { toast.error("Couldn't create the plan — " + (mpErr?.message || "unknown error").slice(0, 80)); return; }
      const planId = (mp as { id: string }).id;
      for (let i = 0; i < built.length; i++) {
        const rw = built[i];
        const slot = OPEN_SLOTS.find((s) => s.position === rw.position);
        const { data: mealRow, error: mealErr } = await supabase.from("meals").insert({
          meal_plan_id: planId, name: slot?.name || rw.meta!.name || `Meal ${i + 1}`,
          timing: rw.meta?.time || slot?.time || null, position: i + 1, swaps: null,
        }).select().single();
        if (mealErr || !mealRow) continue;
        const mealId = (mealRow as { id: string }).id;
        const itemsPayload = (rw.meta!.items || []).map((it, j) => ({
          meal_id: mealId, food: it.n, amount: 1, unit: it.a || "serving",
          is_unlimited: !!it.free, basis: it.a || null,
          protein: r((it.p || 0) * (it.fac ?? 1)), carbs: r((it.c || 0) * (it.fac ?? 1)), fats: r((it.f || 0) * (it.fac ?? 1)),
          position: j + 1,
        }));
        if (itemsPayload.length) await supabase.from("meal_items").insert(itemsPayload);
      }
      await supabase.from("macro_targets").insert({
        client_id: clientId, calories: r(totalsAll.kcal), protein: r(totalsAll.protein),
        carbs: r(totalsAll.carbs), fats: r(totalsAll.fats), effective_date: effective,
      });
      closeAllSheets();
      toast.success(`🎯 ${planName} is live (v${nextVer}) — reload to start one-tap logging`, { duration: 4200 });
      setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 1800);
    } finally { setSavingPlan(false); }
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  const tg = macroTarget;
  const over = tg ? totals.kcal > tg.calories : false;
  const pctK = tg && tg.calories > 0 ? Math.min(100, (totals.kcal / tg.calories) * 100) : 0;

  function pill(lab: string, val: number, target: number | null, color: string) {
    const isOver = target != null && val > target;
    return (
      <div className="flex-1 rounded-xl px-2 py-1.5 text-center" style={{ background: "var(--brand-bg)" }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: "var(--brand-text-secondary)" }}>{lab}</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: isOver ? ORANGE : "var(--brand-text)", margin: "1px 0 3px" }}>
          {r(val)}{target != null ? `/${r(target)} g` : " g"}
        </div>
        <div style={{ height: 3.5, background: "var(--brand-border)", borderRadius: 2, overflow: "hidden" }}>
          <i style={{ display: "block", height: "100%", borderRadius: 2, width: `${target ? Math.min(100, (val / target) * 100) : val > 0 ? 100 : 0}%`, background: isOver ? ORANGE : color, transition: "width 0.4s" }} />
        </div>
      </div>
    );
  }

  function circleFor(row: Row, idx: number) {
    const l = row.log;
    const logged = isLogged(row);
    const adh = logged ? l!.adherence : null;
    const built = row.kind === "openslot" && (row.meta?.items?.length || 0) > 0;
    let bg = "transparent", border = "var(--brand-border)", inner: React.ReactNode = null;
    if (row.kind === "openslot") {
      if (built) { bg = GREEN; border = GREEN; inner = <CheckSvg />; }
      else { inner = <span style={{ color: "var(--brand-text-secondary)", fontSize: 18 }}>＋</span>; }
    } else if (logged) {
      if (adh === "Full") { bg = GREEN; border = GREEN; inner = <CheckSvg />; }
      else if (adh === "Skipped") { bg = "var(--brand-bg)"; inner = <span style={{ color: "var(--brand-text-secondary)", fontWeight: 800 }}>—</span>; }
      else if (adh === "Off-plan") {
        const pctMeta = row.meta && !row.meta.unlogged;
        bg = pctMeta ? GREEN : BLUE; border = bg; inner = <CheckSvg />;
      }
      else { bg = GOLD; border = GOLD; inner = <span style={{ color: "#111", fontWeight: 800, fontSize: 13 }}>{adh === "3/4" ? "¾" : adh === "1/2" ? "½" : adh === "1/4" ? "¼" : "½"}</span>; }
    }
    return (
      <button
        onClick={() => tapCircle(row)}
        aria-label={`log ${rowLabel(row, idx)} full`}
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: 46, height: 46, borderRadius: "50%", border: `2.5px solid ${border}`, background: bg,
          transition: "all 0.2s", animation: popKey === row.key ? "v3pop 0.35s cubic-bezier(0.3,1.6,0.5,1)" : undefined,
          borderStyle: row.kind === "openslot" && !built ? "dashed" : "solid",
        }}
      >
        {inner}
      </button>
    );
  }

  function statusTag(row: Row) {
    if (!isLogged(row)) return null;
    const adh = row.log!.adherence;
    const isCustomLogged = row.kind === "custom" && row.meta && !row.meta.unlogged;
    let label = "", bg = "", color = "";
    if (adh === "Full" || (isCustomLogged && adh === "Off-plan" && row.kind === "custom")) { label = "Logged"; bg = "rgba(34,197,94,0.15)"; color = GREEN; }
    if (adh === "Full") label = "Full";
    else if (adh === "3/4" || adh === "1/2" || adh === "1/4" || adh === "Partial") { label = adh === "3/4" ? "¾" : adh === "1/2" ? "½" : adh === "1/4" ? "¼" : "Partial"; bg = "rgba(198,158,60,0.18)"; color = GOLD; }
    else if (adh === "Skipped") { label = "Skipped"; bg = "var(--brand-bg)"; color = "var(--brand-text-secondary)"; }
    else if (adh === "Off-plan" && !isCustomLogged) { label = "Off-plan"; bg = "rgba(66,165,245,0.15)"; color = BLUE; }
    if (!label) return null;
    return (
      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: bg, color }}>{label}</span>
    );
  }

  function estBadge() {
    return <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, background: "rgba(66,165,245,0.18)", color: BLUE, padding: "2px 6px", borderRadius: 5 }}>EST</span>;
  }

  function insertLine(at: number) {
    if (openMode) return null;
    return (
      <div key={"ins" + at} className="flex items-center justify-center" style={{ height: 16, position: "relative", margin: "1px 0", visibility: dragState ? "hidden" : undefined }}>
        <span style={{ position: "absolute", left: 22, right: 22, top: "50%", height: 1, background: "var(--brand-border)", opacity: 0.55 }} />
        <button
          onClick={() => openSheet({ kind: "addmeal", at })}
          aria-label="add a meal here"
          className="flex items-center justify-center"
          style={{ position: "relative", zIndex: 1, width: 24, height: 24, borderRadius: "50%", background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", fontSize: 13, lineHeight: 1 }}
        >
          ＋
        </button>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <Toaster position="bottom-center" toastOptions={{ style: { background: "var(--brand-surface)", color: "var(--brand-text)", border: "1px solid var(--brand-border)", fontSize: 13, fontWeight: 600 } }} />
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
      <style>{`
        @keyframes v3pop { 0% { transform: scale(1); } 45% { transform: scale(1.22); } 100% { transform: scale(1); } }
        @keyframes v3fadeup { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* date nav */}
      <div className="flex items-center justify-center gap-1 px-4 pt-3">
        <button onClick={() => setSelectedDate(shiftDateStr(selectedDate, -1))} aria-label="previous day" className="w-11 h-10 flex items-center justify-center rounded-xl" style={{ color: "var(--brand-text-secondary)", fontSize: 20 }}>‹</button>
        <div className="text-center" style={{ minWidth: 170 }}>
          <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>{selectedDate === today ? "Today" : fmtDateLong(selectedDate)}</p>
          <p style={{ color: "var(--brand-text-secondary)", fontSize: 11 }}>{selectedDate === today ? fmtDateLong(selectedDate) : selectedDate > today ? "upcoming day" : "past day"}</p>
        </div>
        <button onClick={() => setSelectedDate(shiftDateStr(selectedDate, 1))} aria-label="next day" className="w-11 h-10 flex items-center justify-center rounded-xl" style={{ color: "var(--brand-text-secondary)", fontSize: 20 }}>›</button>
        <button onClick={() => openSheet({ kind: "menu" })} aria-label="plan menu" className="w-11 h-10 flex items-center justify-center rounded-xl absolute right-3" style={{ color: "var(--brand-text)", fontSize: 20 }}>⋯</button>
      </div>

      {/* incoming plan banner */}
      {incomingPlan && incomingPlan.effective_date && incomingPlan.effective_date > today && (
        <button onClick={openVersions} className="mx-4 mt-2 w-[calc(100%-2rem)] flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
          style={{ background: "rgba(198,158,60,0.12)", border: "1px solid rgba(198,158,60,0.45)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: GOLD, flexShrink: 0 }} />
          <span className="text-xs" style={{ color: "var(--brand-text)" }}>
            <b style={{ color: GOLD }}>Plan v{incomingPlan.version_number ?? "next"}</b> starts {fmtDateLong(incomingPlan.effective_date)} — tap for the version timeline
          </span>
          <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
        </button>
      )}

      {/* macro bar */}
      <div className="mx-4 mt-2 p-3.5" style={CARD}>
        <div className="flex items-baseline justify-between mb-2">
          <div style={{ fontSize: 21, fontWeight: 800, color: "var(--brand-text)" }}>
            {r(totals.kcal).toLocaleString()}{" "}
            <small style={{ fontSize: 13, color: "var(--brand-text-secondary)", fontWeight: 600 }}>
              {tg ? `/ ${tg.calories.toLocaleString()} cal` : "cal eaten"}
            </small>
          </div>
          {tg ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: over ? ORANGE : "var(--brand-text-secondary)" }}>
              {over ? `${r(totals.kcal - tg.calories).toLocaleString()} over` : `${r(tg.calories - totals.kcal).toLocaleString()} left`}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--brand-text-secondary)", border: "1px dashed var(--brand-border)", borderRadius: 8, padding: "3px 8px" }}>
              no targets set
            </span>
          )}
        </div>
        {tg && (
          <div style={{ height: 8, background: "var(--brand-bg)", borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
            <i style={{ display: "block", height: "100%", width: `${pctK}%`, borderRadius: 6, background: over ? ORANGE : "var(--brand-primary)", transition: "width 0.4s cubic-bezier(0.4,0,0.2,1), background 0.3s" }} />
          </div>
        )}
        <div className="flex gap-2">
          {pill("PROTEIN", totals.protein, tg ? tg.protein : null, "var(--brand-primary)")}
          {pill("CARBS", totals.carbs, tg ? tg.carbs : null, "#5ec9a3")}
          {pill("FAT", totals.fats, tg ? tg.fats : null, BLUE)}
        </div>
        {totals.pendingCount > 0 && (
          <p className="mt-2 text-center" style={{ fontSize: 10, color: "#b45309" }}>
            {totals.pendingCount} entr{totals.pendingCount === 1 ? "y" : "ies"} pending AI macros — totals update tonight
          </p>
        )}
        {openMode && (
          <p className="mt-2" style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>
            Open plan: nothing pre-filled — build each slot from the food database (or photo / typed). Totals grow as you log.
          </p>
        )}
      </div>

      {/* coach card */}
      {coach && (
        <div className="mx-4 mt-2.5 flex items-start gap-2.5 p-3" style={{ ...CARD, borderLeft: `3px solid ${coach.kind === "push" ? ORANGE : GREEN}`, animation: "v3fadeup 0.35s ease" }}>
          <span className="flex-shrink-0 flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: 8, background: "var(--brand-bg)", color: "var(--brand-primary)", fontSize: 13 }}>✦</span>
          <p className="flex-1 text-xs leading-relaxed" style={{ color: "var(--brand-text-secondary)" }}>{coach.html}</p>
          <button onClick={() => setCoachDismissed(true)} aria-label="dismiss" style={{ color: "var(--brand-text-secondary)", fontSize: 12, padding: "2px 6px" }}>✕</button>
        </div>
      )}

      {/* open-plan builder card */}
      {openMode && (
        <div className="mx-4 mt-2.5 p-3" style={{ ...CARD, borderStyle: "dashed" }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.1, color: "var(--brand-primary)", marginBottom: 7 }}>✦ TURN THIS INTO MY PLAN</p>
          <button onClick={() => openSheet({ kind: "saveplan" })} className="w-full flex items-center gap-3 rounded-2xl p-3 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <span className="text-base">🛠</span>
            <span className="text-xs font-semibold" style={{ color: "var(--brand-text)" }}>
              Save my built day as the plan
              <span className="block font-normal" style={{ color: "var(--brand-text-secondary)", fontSize: 10.5 }}>Targets computed from the slots below · one-tap logging after</span>
            </span>
            <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
          </button>
        </div>
      )}

      {/* meal rows */}
      <p className="mx-4 mt-4 mb-2" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "var(--brand-text-secondary)" }}>
        {openMode ? "TODAY — TAP A SLOT TO BUILD · ⋯ FOR MORE" : "MEALS — TAP CIRCLE TO LOG FULL · ⋯ FOR MORE · HOLD ⠿ TO MOVE"}
      </p>
      <div ref={listRef} className="px-4">
        {insertLine(0)}
        {displayRows.map((row, i) => {
          const mm = rowMacros(row);
          const logged = isLogged(row);
          const adh = row.log?.adherence;
          const borderColor = dragState?.key === row.key
            ? "var(--brand-primary)"
            : logged
            ? adh === "Skipped" ? "var(--brand-border)" : adh === "Off-plan" && !(row.kind === "custom") ? "rgba(66,165,245,0.45)" : "rgba(34,197,94,0.45)"
            : "var(--brand-border)";
          const itemsTxt = row.kind === "plan" && row.chosen
            ? (row.chosen.meal_items || []).map((it) => it.is_unlimited ? `${it.food} (free)` : it.food).join(" · ")
            : row.meta?.items?.length
            ? row.meta.items.map((it) => it.n).join(" · ")
            : row.kind === "openslot" ? "Empty — nothing logged in this slot yet" : "";
          const built = row.kind === "openslot" && (row.meta?.items?.length || 0) > 0;
          return (
            <div key={row.key}>
              <div
                data-rowkey={row.key}
                className="flex items-center gap-3 p-3 mb-2"
                style={{
                  ...CARD,
                  borderColor,
                  opacity: dragState?.key === row.key ? 0.35 : logged && adh === "Skipped" ? 0.55 : 1,
                  transition: "border-color 0.2s, opacity 0.2s",
                }}
              >
                {circleFor(row, i)}
                <button className="flex-1 min-w-0 text-left" onClick={() => openSheet({ kind: "meal", rowKey: row.key })} style={{ background: "none" }}>
                  <p className="text-sm font-bold flex items-center gap-1.5 flex-wrap" style={{ color: "var(--brand-text)" }}>
                    {rowLabel(row, i)}
                    {rowName(row) && <span style={{ fontWeight: 600, color: "var(--brand-text-secondary)" }}>{rowName(row)}</span>}
                    {rowTime(row) && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--brand-text-secondary)", background: "var(--brand-bg)", padding: "2px 7px", borderRadius: 6 }}>{rowTime(row)}</span>}
                    {row.kind === "custom" && <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(66,165,245,0.14)", color: BLUE, padding: "2px 6px", borderRadius: 5 }}>CUSTOM</span>}
                    {statusTag(row)}
                    {logged && adh === "Off-plan" && row.kind !== "custom" && estBadge()}
                    {built && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "rgba(34,197,94,0.15)", color: GREEN }}>{row.meta!.items.length} item{row.meta!.items.length > 1 ? "s" : ""}</span>}
                  </p>
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                    {logged && adh === "Off-plan" && row.kind !== "custom" && row.log?.off_plan_details ? row.log.off_plan_details : itemsTxt}
                  </p>
                  {(row.kind !== "openslot" || built) && (
                    <p className="text-xs mt-0.5 font-semibold" style={{ color: "var(--brand-text-secondary)" }}>
                      <b style={{ color: "var(--brand-text)" }}>{r(logged && adh === "Off-plan" && row.kind !== "custom" ? (row.log?.est_kcal || 0) : mm.kcal)}</b> cal · {r(logged && adh === "Off-plan" && row.kind !== "custom" ? (row.log?.est_protein || 0) : mm.protein)}P / {r(logged && adh === "Off-plan" && row.kind !== "custom" ? (row.log?.est_carbs || 0) : mm.carbs)}C / {r(logged && adh === "Off-plan" && row.kind !== "custom" ? (row.log?.est_fats || 0) : mm.fats)}F
                    </p>
                  )}
                  {row.kind === "openslot" && !built && (
                    <p className="text-xs mt-0.5 font-bold" style={{ color: "var(--brand-primary)" }}>
                      ＋ Build this meal <span style={{ color: "var(--brand-text-secondary)", fontWeight: 500, fontSize: 10 }}>food DB · 📷 photo · ⌨ typed</span>
                    </p>
                  )}
                  {row.kind === "plan" && (row.options?.length || 0) > 1 && (
                    <span className="flex gap-1.5 mt-1.5">
                      {row.options!.map((o, oi) => {
                        const on = row.chosen?.id === o.id;
                        return (
                          <button key={o.id}
                            onClick={(e) => { e.stopPropagation(); setOptSel((prev) => ({ ...prev, [row.position]: o.id })); if (isLogged(row)) upsertLog(row.position, { meal_id: o.id }); }}
                            style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 8, background: on ? "color-mix(in srgb, var(--brand-primary) 16%, transparent)" : "var(--brand-bg)", border: `1px solid ${on ? "var(--brand-primary)" : "var(--brand-border)"}`, color: on ? "var(--brand-text)" : "var(--brand-text-secondary)" }}>
                            {String.fromCharCode(65 + oi)}
                          </button>
                        );
                      })}
                    </span>
                  )}
                </button>
                <span
                  onPointerDown={(e) => onHandleDown(e, row.key)}
                  title="Hold to move"
                  aria-label={`hold to move ${rowLabel(row, i)}`}
                  className="flex items-center self-stretch flex-shrink-0 select-none"
                  style={{ touchAction: "none", cursor: "grab", color: dragState?.key === row.key ? "var(--brand-primary)" : "var(--brand-text-secondary)", fontSize: 15, padding: "0 4px", opacity: 0.7 }}
                >
                  ⠿
                </span>
                <button onClick={() => openSheet({ kind: "meal", rowKey: row.key })} aria-label="more" className="flex-shrink-0 w-9 h-11 flex items-center justify-center rounded-xl" style={{ color: "var(--brand-text-secondary)", fontSize: 18 }}>⋯</button>
              </div>
              {insertLine(i + 1)}
            </div>
          );
        })}
      </div>

      {/* extras */}
      <p className="mx-4 mt-3 mb-2" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "var(--brand-text-secondary)" }}>EXTRAS</p>
      <div className="px-4">
        {extras.map((e) => (
          <div key={e.id} className="flex items-center gap-2.5 p-3 mb-2" style={{ ...CARD }}>
            <span className="flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 10, background: "var(--brand-bg)", fontSize: 15 }}>＋</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate flex items-center gap-1.5" style={{ color: "var(--brand-text)" }}>
                {e.off_plan_details || "Extra"} {e.macros_pending ? <span style={{ fontSize: 9, fontWeight: 800, background: "#fef3c7", color: "#b45309", padding: "2px 6px", borderRadius: 5 }}>PENDING</span> : estBadge()}
              </p>
              <p className="text-xs font-semibold" style={{ color: "var(--brand-text-secondary)" }}>
                {e.macros_pending ? "macros tonight" : <><b style={{ color: "var(--brand-text)" }}>{r(e.est_kcal || 0)}</b> cal · {r(e.est_protein || 0)}P / {r(e.est_carbs || 0)}C / {r(e.est_fats || 0)}F</>}
              </p>
            </div>
            <button
              onClick={async () => {
                const backup = { ...e };
                await deleteLogRow(e.id);
                undoToast("Extra removed", async () => {
                  await upsertLog(backup.meal_position, {
                    meal_id: null, adherence: backup.adherence, est_kcal: backup.est_kcal ?? null,
                    est_protein: backup.est_protein ?? null, est_carbs: backup.est_carbs ?? null, est_fats: backup.est_fats ?? null,
                    off_plan_details: backup.off_plan_details ?? null, macros_pending: backup.macros_pending ?? false,
                    item_overrides: backup.item_overrides ?? null,
                  });
                });
              }}
              aria-label="remove extra" className="flex-shrink-0 w-9 h-9 flex items-center justify-center" style={{ color: "var(--brand-text-secondary)" }}>✕</button>
          </div>
        ))}
        <button onClick={() => openSheet({ kind: "extrapick" })} className="w-full flex items-center gap-2.5 p-3 mb-2 text-left" style={{ ...CARD, borderStyle: "dashed", color: "var(--brand-text-secondary)" }}>
          <span className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--brand-bg)", fontSize: 16, color: "var(--brand-text)" }}>＋</span>
          <span className="text-sm">Quick-add an extra (snack, drink, off-plan bite…)</span>
        </button>
      </div>

      {/* ==================== SHEETS ==================== */}
      {sheet && renderSheet(sheet)}
      {showGrocery && mealPlan && <GroceryListSheet plan={{ id: mealPlan.id, meals: planMeals as never }} onClose={() => setShowGrocery(false)} />}
    </div>
  );

  // =========================================================================
  // Sheet rendering
  // =========================================================================
  function renderSheet(s: NonNullable<SheetState>): React.ReactNode {
    switch (s.kind) {
      case "meal": return <MealSheetView rowKey={s.rowKey} />;
      case "offplan": return <OffPlanSheetView rowKey={s.rowKey} extra={s.extra} />;
      case "adjust": return <AdjustSheetView rowKey={s.rowKey} />;
      case "composer": return renderComposer(s);
      case "replace": return <ReplaceSheetView rowKey={s.rowKey} />;
      case "copyto": return <CopyToSheetView rowKey={s.rowKey} />;
      case "addmeal": return <AddMealSheetView at={s.at} />;
      case "mymeals": return <MyMealsSheetView at={s.at} replaceRowKey={s.replaceRowKey} />;
      case "foodsearch":
        return (
          <FoodSearchSheet
            clientId={clientId}
            title="Food database"
            subtitle={s.target === "extra" ? "Quick log" : "Add a food"}
            onClose={closeAllSheets}
            onBack={backSheet}
            onPick={async (item) => {
              if (s.target === "extra") { backSheet(); await addExtra([item], item.n); return; }
              const row = s.rowKey ? rowByKey(s.rowKey) : undefined;
              if (!row) { closeAllSheets(); return; }
              if (s.target === "slot" || row.kind === "openslot") {
                const meta: CustomMeta = row.meta
                  ? { ...row.meta, items: [...row.meta.items, item] }
                  : { name: OPEN_SLOTS.find((x) => x.position === row.position)?.name || "Meal", items: [item], kind: "slot" };
                const m = customMealMacros(meta);
                await upsertLog(row.position, {
                  meal_id: null, adherence: "Off-plan",
                  est_kcal: r(m.kcal), est_protein: r(m.protein), est_carbs: r(m.carbs), est_fats: r(m.fats),
                  off_plan_details: meta.name, macros_pending: false,
                  item_overrides: keepOv(row, { __custom: { ...meta, unlogged: false } }),
                });
                backSheet();
                toast.success(`${item.n} added ✓`);
              } else if (row.kind === "custom" && row.meta) {
                const meta: CustomMeta = { ...row.meta, items: [...row.meta.items, item] };
                await patchCustom(row, meta);
                backSheet();
              } else if (row.kind === "plan") {
                const ov = { ...(row.log?.item_overrides || {}) } as ItemOverrides;
                const added = [...(ov.__added || []), { food_id: item.food_id ?? null, name: item.n, servings: 1, p: item.p, c: item.c, f: item.f }];
                await upsertLog(row.position, {
                  meal_id: row.chosen?.id ?? null,
                  adherence: row.log?.adherence && !ov.__unlogged ? row.log.adherence : "Skipped",
                  item_overrides: { ...ov, __added: added, ...(row.log?.adherence && !ov.__unlogged ? {} : { __unlogged: true }) },
                });
                backSheet();
                toast.success(`${item.n} added to the meal ✓`);
              }
            }}
          />
        );
      case "menu": return <MenuSheetView />;
      case "trends": return <TrendsSheetView />;
      case "versions": return <VersionsSheetView />;
      case "forward": return <ForwardSheetView />;
      case "extrapick": return <ExtraPickSheetView />;
      case "saveplan": return <SavePlanSheetView />;
      default: return null;
    }
  }

  async function patchCustom(row: Row, meta: CustomMeta) {
    const m = customMealMacros(meta);
    const logged = !meta.unlogged;
    await upsertLog(row.position, {
      meal_id: null,
      adherence: logged ? "Off-plan" : "Skipped",
      est_kcal: logged ? r(m.kcal) : null, est_protein: logged ? r(m.protein) : null,
      est_carbs: logged ? r(m.carbs) : null, est_fats: logged ? r(m.fats) : null,
      off_plan_details: meta.name, macros_pending: false,
      item_overrides: keepOv(row, { __custom: meta, ...(logged ? {} : { __unlogged: true }) }),
    });
  }

  function renderComposer(s: Extract<NonNullable<SheetState>, { kind: "composer" }>) {
    const row = s.rowKey ? rowByKey(s.rowKey) : undefined;
    const idx = row ? rows.findIndex((x) => x.key === row.key) : -1;
    const compare = s.mode === "swap" && row && row.kind === "plan" && row.chosen
      ? { label: `Plan ${rowLabel(row, idx)}`, macros: planMealMacros(row.chosen) }
      : null;
    const titles = { swap: `Swap ${row ? rowLabel(row, idx) : ""} for custom`, insert: "Create custom meal", extra: "Type what you ate", slot: "Typed → AI parse" };
    return (
      <ComposerSheet
        title={titles[s.mode]}
        clientId={clientId}
        askName={s.mode === "swap" || s.mode === "insert"}
        compare={compare}
        saveLabel={
          s.mode === "swap" ? "Swap it in (saves to My Meals)"
          : s.mode === "insert" ? (s.logNow ? "Log it ✓" : "Add meal (saves to My Meals)")
          : "Log it — totals update ✓"
        }
        onClose={closeAllSheets}
        onBack={backSheet}
        onSave={async (items, name) => {
          if (s.mode === "swap" && row) {
            const meta: CustomMeta = { name, time: rowTime(row), items, kind: "swap", sourceMealId: row.chosen?.id ?? null, unlogged: true };
            await upsertLog(row.position, {
              meal_id: null, adherence: "Skipped", est_kcal: null, est_protein: null, est_carbs: null, est_fats: null,
              off_plan_details: name, macros_pending: false,
              item_overrides: keepOv(row, { __custom: meta }),
            });
            await saveMyMeal(name, items);
            closeAllSheets();
            toast.success(`Swapped for “${name}” — saved to My Meals ✓`);
          } else if (s.mode === "insert") {
            await insertCustomMeal(s.at ?? rows.length, { name, items, kind: "insert" }, !!s.logNow);
            if (!s.logNow) await saveMyMeal(name, items);
            closeAllSheets();
            toast.success(s.logNow ? "Logged ✓ — totals updated" : `“${name}” added ✓`);
          } else if (s.mode === "slot" && row) {
            const meta: CustomMeta = row.meta
              ? { ...row.meta, items: [...row.meta.items, ...items], unlogged: false }
              : { name: OPEN_SLOTS.find((x) => x.position === row.position)?.name || name, items, kind: "slot" };
            await patchCustom(row, { ...meta, unlogged: false });
            closeAllSheets();
            toast.success("Logged ✓ — totals updated");
          } else {
            await addExtra(items, name || items.map((i2) => i2.n).join(" + "));
            closeAllSheets();
          }
        }}
      />
    );
  }

  // ---- individual sheets (closures over main state) ------------------------

  function MealSheetView({ rowKey }: { rowKey: string }) {
    const row = rowByKey(rowKey);
    if (!row) return null;
    const idx = rows.findIndex((x) => x.key === rowKey);
    const mm = rowMacros(row);
    const logged = isLogged(row);
    const label = rowLabel(row, idx);
    const adhBtn = (lab: string, sub: string, key: "Full" | "3/4" | "1/2" | "1/4" | "Skipped", color: string) => (
      <button onClick={() => setAdherence(row, key)} className="rounded-2xl py-3 text-center font-extrabold"
        style={{ background: "var(--brand-bg)", border: `1px solid ${key === "Full" ? "rgba(34,197,94,0.5)" : "var(--brand-border)"}`, color, fontSize: 15 }}>
        {lab}
        <small className="block font-semibold" style={{ fontSize: 9.5, color: "var(--brand-text-secondary)", marginTop: 2 }}>{sub}</small>
      </button>
    );
    const actionBtn = (ic: string, lab: string, fn: () => void, danger?: boolean) => (
      <button onClick={fn} className="flex items-center gap-2 rounded-xl px-2.5 py-2.5 text-left"
        style={{ background: "var(--brand-bg)", border: `1px solid ${danger ? "rgba(229,57,53,0.45)" : "var(--brand-border)"}`, color: danger ? "#e05252" : "var(--brand-text)", fontSize: 11.5, fontWeight: 600, minHeight: 44 }}>
        <span style={{ fontSize: 13, opacity: 0.9 }}>{ic}</span>{lab}
      </button>
    );

    if (row.kind === "openslot") {
      const built = (row.meta?.items?.length || 0) > 0;
      return (
        <Sheet title={`${label}${rowTime(row) ? " · " + rowTime(row) : ""}`} subtitle={built ? `${r(mm.kcal)} cal · ${r(mm.protein)}P / ${r(mm.carbs)}C / ${r(mm.fats)}F` : "Empty slot — build it below"} onClose={closeAllSheets}>
          <button onClick={() => openSheet({ kind: "foodsearch", target: "slot", rowKey })} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--brand-primary)" }}>
            ＋ Build from the food database
          </button>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {actionBtn("📷", "Photo → AI", () => openSheet({ kind: "offplan", rowKey }))}
            {actionBtn("⌨", "Typed → AI parse", () => openSheet({ kind: "composer", mode: "slot", rowKey }))}
          </div>
          {built && (
            <>
              <p className="text-xs font-bold uppercase tracking-widest mt-4 mb-2" style={{ color: "var(--brand-text-secondary)" }}>In this slot — edit anything</p>
              {row.meta!.items.map((it, j) => (
                <div key={j} className="flex items-center gap-2 rounded-xl p-2.5 mb-1.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--brand-text)" }}>{it.n}</p>
                    <p style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>{it.a || "1 serving"} · {r((it.k ?? kcalOf(it.p, it.c, it.f)) * (it.fac ?? 1))} cal{it.db ? " · DB ✓" : it.est ? " · EST" : ""}</p>
                  </div>
                  <button onClick={async () => {
                    const meta = { ...row.meta!, items: row.meta!.items.filter((_, k2) => k2 !== j) };
                    await patchCustom(row, meta);
                  }} aria-label="remove" style={{ color: "var(--brand-text-secondary)", padding: 6 }}>✕</button>
                </div>
              ))}
            </>
          )}
          <p className="text-xs font-bold uppercase tracking-widest mt-4 mb-2" style={{ color: "var(--brand-text-secondary)" }}>Slot actions</p>
          <div className="grid grid-cols-2 gap-1.5">
            {actionBtn("⭐", "Save to My Meals", async () => {
              if (!row.meta?.items?.length) { toast("Nothing in this slot yet"); return; }
              await saveMyMeal(`${label} (${clientName.split(" ")[0]})`, row.meta.items);
              toast.success(`“${label}” saved to My Meals ✓`);
            })}
            {actionBtn("↺", "Clear items", async () => {
              if (row.log) await deleteLogRow(row.log.id);
              closeAllSheets();
              toast(`${label} cleared ✓`);
            })}
            {actionBtn("↑", "Move up", () => moveRow(rowKey, -1))}
            {actionBtn("↓", "Move down", () => moveRow(rowKey, 1))}
          </div>
        </Sheet>
      );
    }

    return (
      <Sheet title={`${label}${rowName(row) ? " · " + rowName(row) : ""}`} subtitle={`${rowTime(row) ? rowTime(row) + " · " : ""}${r(mm.kcal)} cal · ${r(mm.protein)}P / ${r(mm.carbs)}C / ${r(mm.fats)}F`} onClose={closeAllSheets}>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {adhBtn("✓", "Full", "Full", GREEN)}
          {adhBtn("¾", "Most", "3/4", GOLD)}
          {adhBtn("½", "Half", "1/2", GOLD)}
          {adhBtn("¼", "Some", "1/4", GOLD)}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {adhBtn("—", "Skipped", "Skipped", "var(--brand-text-secondary)")}
          <button onClick={() => replaceSheet({ kind: "offplan", rowKey })} className="rounded-2xl py-3 text-center font-extrabold"
            style={{ background: "var(--brand-bg)", border: "1px solid rgba(66,165,245,0.4)", color: BLUE, fontSize: 15 }}>
            ✦<small className="block font-semibold" style={{ fontSize: 9.5, color: "var(--brand-text-secondary)", marginTop: 2 }}>Off-plan (photo / text)</small>
          </button>
        </div>
        <button onClick={() => openSheet({ kind: "adjust", rowKey })} className="w-full flex items-center gap-3 rounded-2xl p-3 mb-1 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
          <span style={{ fontSize: 16 }}>⚖</span>
          <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
            Adjust / edit this meal
            <span className="block text-xs font-normal" style={{ color: "var(--brand-text-secondary)" }}>Amount steppers · add food · remove</span>
          </span>
          <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
        </button>
        <p className="text-xs font-bold uppercase tracking-widest mt-3 mb-2" style={{ color: "var(--brand-text-secondary)" }}>Meal actions</p>
        <div className="grid grid-cols-2 gap-1.5">
          {actionBtn("⇄", "Swap for custom", () => replaceSheet({ kind: "composer", mode: "swap", rowKey }))}
          {actionBtn("▤", "Replace…", () => replaceSheet({ kind: "replace", rowKey }))}
          {actionBtn("⧉", "Copy to slot…", () => replaceSheet({ kind: "copyto", rowKey }))}
          {actionBtn("✎", "Edit items", () => replaceSheet({ kind: "adjust", rowKey }))}
          {actionBtn("↑", "Move up", () => moveRow(rowKey, -1))}
          {actionBtn("↓", "Move down", () => moveRow(rowKey, 1))}
          {logged
            ? actionBtn("↺", "Unlog to edit", () => unlogRow(row))
            : actionBtn("○", "Not logged yet", () => { closeAllSheets(); toast("Tap the circle to log Full"); })}
          {actionBtn("🗑", "Delete meal", () => deleteRow(row), true)}
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--brand-text-secondary)" }}>
          Or press-and-hold the ⠿ handle on the row (~half a second) and drag to reorder. Deleting only affects today — the plan is untouched.
        </p>
        <p className="text-xs font-bold uppercase tracking-widest mt-4 mb-1" style={{ color: "var(--brand-text-secondary)" }}>What&apos;s in this meal</p>
        {row.kind === "plan" && row.chosen && (row.chosen.meal_items || []).map((it) => (
          <div key={it.id} className="flex justify-between py-1.5 text-xs" style={{ color: "var(--brand-text-secondary)", borderBottom: "1px dashed var(--brand-border)" }}>
            <span>
              {it.food}{it.amount != null ? ` · ${it.amount}${it.unit ? " " + it.unit : ""}` : ""}
              {it.is_unlimited && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, background: "rgba(34,197,94,0.15)", color: GREEN, padding: "2px 6px", borderRadius: 5 }}>FREE · UNLIMITED</span>}
            </span>
            <b style={{ color: "var(--brand-text)" }}>{it.is_unlimited ? "—" : `${r(kcalOf(it.protein || 0, it.carbs || 0, it.fats || 0))} cal`}</b>
          </div>
        ))}
        {row.kind === "custom" && row.meta?.items.map((it, j) => (
          <div key={j} className="flex justify-between py-1.5 text-xs" style={{ color: "var(--brand-text-secondary)", borderBottom: "1px dashed var(--brand-border)" }}>
            <span>{it.n}{it.a ? ` · ${it.a}` : ""}{it.free && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, background: "rgba(34,197,94,0.15)", color: GREEN, padding: "2px 6px", borderRadius: 5 }}>FREE</span>}</span>
            <b style={{ color: "var(--brand-text)" }}>{r((it.k ?? kcalOf(it.p, it.c, it.f)) * (it.fac ?? 1))} cal</b>
          </div>
        ))}
      </Sheet>
    );
  }

  function OffPlanSheetView({ rowKey, extra }: { rowKey: string | null; extra?: boolean }) {
    return (
      <OffPlanFlow
        clientId={clientId}
        selectedDate={selectedDate}
        title={extra ? "Quick log" : "Off-plan"}
        onClose={closeAllSheets}
        onBack={backSheet}
        onCommit={async (est) => {
          if (extra || !rowKey) {
            await addExtra(est.items ?? [{ n: est.desc, p: est.p, c: est.c, f: est.f, k: est.k, est: true }], est.desc, est.photoUrl);
            closeAllSheets();
            return;
          }
          const row = rowByKey(rowKey);
          if (!row) { closeAllSheets(); return; }
          if (row.kind === "openslot") {
            const items = est.items ?? [{ n: est.desc, p: est.p, c: est.c, f: est.f, k: est.k, est: true }];
            const meta: CustomMeta = row.meta
              ? { ...row.meta, items: [...row.meta.items, ...items], unlogged: false }
              : { name: OPEN_SLOTS.find((x) => x.position === row.position)?.name || "Meal", items, kind: "slot" };
            await patchCustom(row, { ...meta, unlogged: false });
            if (est.photoUrl) await upsertLog(row.position, { photo_url: est.photoUrl });
            closeAllSheets();
            toast.success("Logged ✓ — totals updated");
            return;
          }
          await upsertLog(row.position, {
            meal_id: row.kind === "plan" ? row.chosen?.id ?? null : null,
            adherence: "Off-plan",
            off_plan_details: est.desc,
            est_kcal: est.pending ? null : r(est.k),
            est_protein: est.pending ? null : r(est.p),
            est_carbs: est.pending ? null : r(est.c),
            est_fats: est.pending ? null : r(est.f),
            macros_pending: !!est.pending,
            photo_url: est.photoUrl ?? null,
            off_plan_macros: est.pending ? null : { kcal: r(est.k), protein: r(est.p), carbs: r(est.c), fats: r(est.f), description: est.desc, estimated: true },
            item_overrides: keepOv(row),
          });
          closeAllSheets();
          toast.success(est.pending ? "Saved — macros tonight" : "Logged off-plan ✓ — totals updated");
        }}
      />
    );
  }

  function AdjustSheetView({ rowKey }: { rowKey: string }) {
    const row = rowByKey(rowKey);
    if (!row) return null;
    if (row.kind === "custom" && row.meta) {
      return (
        <CustomEditSheet
          key={rowKey}
          initialMeta={row.meta}
          onOpenFoodSearch={() => openSheet({ kind: "foodsearch", target: "adjust", rowKey })}
          onClose={closeAllSheets}
          onBack={backSheet}
          onSave={async (meta) => { await patchCustom(row, meta); closeAllSheets(); toast.success("Saved — day totals updated ✓"); }}
        />
      );
    }
    if (row.kind !== "plan" || !row.chosen) return null;
    const existingOv = (row.log?.item_overrides || {}) as ItemOverrides;
    const loggedNow = !!(row.log?.adherence && !existingOv.__unlogged && !existingOv.__custom?.unlogged);
    return (
      <PlanAdjustSheet
        key={rowKey}
        meal={row.chosen}
        existingOv={existingOv}
        loggedNow={loggedNow}
        onOpenFoodSearch={() => openSheet({ kind: "foodsearch", target: "adjust", rowKey })}
        onClose={closeAllSheets}
        onBack={backSheet}
        onSave={async (clean) => {
          const keepFlags: Partial<ItemOverrides> = {};
          if (existingOv.__ord != null) keepFlags.__ord = existingOv.__ord;
          if (!loggedNow) keepFlags.__unlogged = true;
          const payload = { ...clean, ...keepFlags };
          await upsertLog(row.position, {
            meal_id: row.chosen?.id ?? null,
            adherence: loggedNow ? row.log!.adherence : "Skipped",
            item_overrides: Object.keys(payload).length ? payload : null,
          });
          closeAllSheets();
          toast.success("Saved — day totals updated ✓");
        }}
      />
    );
  }

  function ReplaceSheetView({ rowKey }: { rowKey: string }) {
    const row = rowByKey(rowKey);
    if (!row) return null;
    const idx = rows.findIndex((x) => x.key === rowKey);
    return (
      <Sheet title={`Replace ${rowLabel(row, idx)}`} subtitle="Plan options · My Meals · custom" onClose={closeAllSheets} onBack={backSheet}>
        {(row.options?.length || 0) > 1 && (
          <>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--brand-text-secondary)" }}>Plan options for this slot</p>
            {row.options!.map((o, oi) => (
              <button key={o.id} onClick={() => { setOptSel((prev) => ({ ...prev, [row.position]: o.id })); if (isLogged(row)) upsertLog(row.position, { meal_id: o.id }); closeAllSheets(); toast.success(`Option ${String.fromCharCode(65 + oi)} selected ✓`); }}
                className="w-full flex items-center gap-3 rounded-2xl p-3 mb-1.5 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                <span className="flex items-center justify-center flex-shrink-0 font-extrabold" style={{ width: 34, height: 34, borderRadius: 10, background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>{String.fromCharCode(65 + oi)}</span>
                <span className="text-sm font-semibold min-w-0" style={{ color: "var(--brand-text)" }}>
                  {o.name}
                  <span className="block text-xs font-normal truncate" style={{ color: "var(--brand-text-secondary)" }}>{(o.meal_items || []).slice(0, 2).map((it) => it.food).join(" · ")}</span>
                </span>
              </button>
            ))}
          </>
        )}
        <p className="text-xs font-bold uppercase tracking-widest mt-2 mb-2" style={{ color: "var(--brand-text-secondary)" }}>My Meals</p>
        {myMeals.length === 0 && <p className="text-xs mb-2" style={{ color: "var(--brand-text-secondary)" }}>No saved meals yet — swap for custom below and it saves automatically.</p>}
        {myMeals.map((mm2) => {
          const tot = customMealMacros({ name: mm2.name, items: mm2.items });
          return (
            <div key={mm2.id} className="flex items-center gap-2 rounded-xl p-2.5 mb-1.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: "var(--brand-text)" }}>{mm2.name}</p>
                <p style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>{mm2.items.length} items · {r(tot.kcal)} cal</p>
              </div>
              <button onClick={async () => {
                const meta: CustomMeta = { name: mm2.name, time: rowTime(row), items: JSON.parse(JSON.stringify(mm2.items)), kind: "swap", unlogged: true, sourceMealId: row.chosen?.id ?? null };
                await upsertLog(row.position, {
                  meal_id: null, adherence: "Skipped", est_kcal: null, est_protein: null, est_carbs: null, est_fats: null,
                  off_plan_details: mm2.name, macros_pending: false, item_overrides: keepOv(row, { __custom: meta }),
                });
                closeAllSheets();
                toast.success(`Replaced with “${mm2.name}” ✓ — tap the circle when eaten`);
              }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex-shrink-0" style={{ background: "var(--brand-primary)" }}>Use</button>
            </div>
          );
        })}
        <button onClick={() => replaceSheet({ kind: "composer", mode: "swap", rowKey })} className="w-full flex items-center gap-3 rounded-2xl p-3 mt-2 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
          <span style={{ fontSize: 15 }}>✍</span>
          <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Create a custom meal instead</span>
          <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
        </button>
      </Sheet>
    );
  }

  function CopyToSheetView({ rowKey }: { rowKey: string }) {
    const row = rowByKey(rowKey);
    if (!row) return null;
    const idx = rows.findIndex((x) => x.key === rowKey);
    const sourceItems: CustomItem[] = row.kind === "custom" && row.meta
      ? JSON.parse(JSON.stringify(row.meta.items))
      : (row.chosen?.meal_items || []).map((it) => ({
          n: it.food, a: it.amount != null ? `${it.amount}${it.unit ? " " + it.unit : ""}` : null,
          p: Number(it.protein) || 0, c: Number(it.carbs) || 0, f: Number(it.fats) || 0,
          k: kcalOf(Number(it.protein) || 0, Number(it.carbs) || 0, Number(it.fats) || 0),
          free: it.is_unlimited, fac: 1,
        }));
    const nameBase = rowName(row) || rowLabel(row, idx);
    const slots: { at: number; label: string }[] = [];
    for (let t = 0; t <= rows.length; t++) {
      slots.push({
        at: t,
        label: t === 0 ? `Before ${rowLabel(rows[0], 0)}` : t === rows.length ? `After ${rowLabel(rows[rows.length - 1], rows.length - 1)} (end of day)` : `Between ${rowLabel(rows[t - 1], t - 1)} and ${rowLabel(rows[t], t)}`,
      });
    }
    return (
      <Sheet title={`Copy ${rowLabel(row, idx)} → slot`} subtitle="Copied meal lands with items + macros, unlogged" onClose={closeAllSheets} onBack={backSheet}>
        {slots.map((s2) => (
          <button key={s2.at} onClick={async () => {
            await insertCustomMeal(s2.at, { name: `${nameBase} (copy)`, time: null, items: sourceItems, kind: "copy" }, false);
            closeAllSheets();
            toast.success("Copied ✓ — meals renumbered");
          }} className="w-full flex items-center gap-3 rounded-2xl p-3 mb-1.5 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <span style={{ fontSize: 14 }}>⧉</span>
            <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{s2.label}</span>
            <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
          </button>
        ))}
      </Sheet>
    );
  }

  function AddMealSheetView({ at }: { at: number }) {
    const rowBtn = (ic: string, lab: string, sub: string, fn: () => void) => (
      <button onClick={fn} className="w-full flex items-center gap-3 rounded-2xl p-3 mb-1.5 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 10, background: "var(--brand-surface)", fontSize: 15 }}>{ic}</span>
        <span className="text-sm font-semibold min-w-0" style={{ color: "var(--brand-text)" }}>
          {lab}<span className="block text-xs font-normal" style={{ color: "var(--brand-text-secondary)" }}>{sub}</span>
        </span>
        <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
      </button>
    );
    return (
      <Sheet title="Add a meal here" subtitle={`Position ${at + 1} — everything renumbers automatically`} onClose={closeAllSheets} onBack={backSheet}>
        {rowBtn("✍", "Create custom meal", "Name it + type items with amounts → AI parse", () => replaceSheet({ kind: "composer", mode: "insert", at }))}
        {rowBtn("⭐", "From My Meals", `${myMeals.length} saved custom${myMeals.length === 1 ? "" : "s"}`, () => replaceSheet({ kind: "mymeals", at }))}
        {rowBtn("⌨", "Type what you ate (with amounts)", "AI parses items → new logged meal → totals update", () => replaceSheet({ kind: "composer", mode: "insert", at, logNow: true }))}
        <p className="text-xs font-bold uppercase tracking-widest mt-3 mb-2" style={{ color: "var(--brand-text-secondary)" }}>Copy an existing meal here</p>
        {rows.map((rw, i) => (
          <button key={rw.key} onClick={async () => {
            const items: CustomItem[] = rw.kind === "custom" && rw.meta
              ? JSON.parse(JSON.stringify(rw.meta.items))
              : (rw.chosen?.meal_items || []).map((it) => ({
                  n: it.food, a: it.amount != null ? `${it.amount}${it.unit ? " " + it.unit : ""}` : null,
                  p: Number(it.protein) || 0, c: Number(it.carbs) || 0, f: Number(it.fats) || 0,
                  k: kcalOf(Number(it.protein) || 0, Number(it.carbs) || 0, Number(it.fats) || 0),
                  free: it.is_unlimited, fac: 1,
                }));
            if (!items.length) { toast("That meal is empty"); return; }
            await insertCustomMeal(at, { name: `${rowName(rw) || rowLabel(rw, i)} (copy)`, time: null, items, kind: "copy" }, false);
            closeAllSheets();
            toast.success(`Meal copied into position ${at + 1} ✓`);
          }} className="w-full flex items-center gap-3 rounded-2xl p-3 mb-1.5 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <span className="flex items-center justify-center flex-shrink-0 font-extrabold text-xs" style={{ width: 34, height: 34, borderRadius: 10, background: "var(--brand-surface)", color: "var(--brand-text)" }}>{rowLabel(rw, i)}</span>
            <span className="text-sm font-semibold min-w-0 truncate" style={{ color: "var(--brand-text)" }}>
              {rowName(rw) || rowLabel(rw, i)}
              <span className="block text-xs font-normal" style={{ color: "var(--brand-text-secondary)" }}>{rowTime(rw) || ""} · {r(rowMacros(rw).kcal)} cal</span>
            </span>
            <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
          </button>
        ))}
      </Sheet>
    );
  }

  function MyMealsSheetView({ at }: { at: number | null; replaceRowKey?: string }) {
    return (
      <Sheet title="My Meals" subtitle="Saved customs — reuse anywhere" onClose={closeAllSheets} onBack={backSheet}>
        {!myMealsOk && <p className="text-xs mb-2" style={{ color: "#b45309" }}>My Meals storage isn&apos;t ready yet — saves will start working once it&apos;s live.</p>}
        {myMeals.length === 0 && <p className="text-sm py-3 text-center" style={{ color: "var(--brand-text-secondary)" }}>No saved meals yet — create a custom meal and it lands here.</p>}
        {myMeals.map((mm2) => {
          const tot = customMealMacros({ name: mm2.name, items: mm2.items });
          return (
            <div key={mm2.id} className="flex items-center gap-2 rounded-xl p-2.5 mb-1.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: "var(--brand-text)" }}>{mm2.name}</p>
                <p style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>{mm2.items.length} items · {r(tot.kcal)} cal · {r(tot.protein)}P</p>
              </div>
              {at != null && (
                <button onClick={async () => {
                  await insertCustomMeal(at, { name: mm2.name, time: null, items: JSON.parse(JSON.stringify(mm2.items)), kind: "insert" }, false);
                  closeAllSheets();
                  toast.success(`“${mm2.name}” added ✓`);
                }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex-shrink-0" style={{ background: "var(--brand-primary)" }}>Add here</button>
              )}
            </div>
          );
        })}
        {at != null && (
          <button onClick={() => replaceSheet({ kind: "composer", mode: "insert", at })} className="w-full flex items-center gap-3 rounded-2xl p-3 mt-2 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <span style={{ fontSize: 15 }}>✍</span>
            <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Create a new custom meal</span>
            <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
          </button>
        )}
      </Sheet>
    );
  }

  function MenuSheetView() {
    const rowBtn = (ic: string, lab: string, sub: string, fn: () => void) => (
      <button onClick={fn} className="w-full flex items-center gap-3 rounded-2xl p-3 mb-1.5 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 10, background: "var(--brand-surface)", fontSize: 15 }}>{ic}</span>
        <span className="text-sm font-semibold min-w-0" style={{ color: "var(--brand-text)" }}>
          {lab}<span className="block text-xs font-normal" style={{ color: "var(--brand-text-secondary)" }}>{sub}</span>
        </span>
        <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
      </button>
    );
    const printBase = `/nutrition/print?clientId=${clientId}`;
    return (
      <Sheet title="Plan menu" subtitle={`${clientName}${mealPlan ? ` · plan v${mealPlan.version_number} (live)` : " · open plan"}`} onClose={closeAllSheets}>
        {mealPlan && rowBtn("🛒", "Grocery & Prep", "Grocery RAW (meat in lb + oz) · prep cards COOKED", () => { closeAllSheets(); setShowGrocery(true); })}
        {mealPlan && rowBtn("🖨", "Print / PDF", "Plan · grocery list · production sheet — share or save as PDF", () => { window.open(`${printBase}&kind=plan`, "_blank"); })}
        {rowBtn("📈", "Trends", "Averages + the same charts as today's progress page", () => replaceSheet({ kind: "trends" }))}
        {rowBtn("🗂", "Plan versions", "Current live + staged incoming — flips at midnight CT", () => { backSheet(); openVersions(); })}
        {mealPlan && rowBtn("📅", "Week ahead", "Forward view · 1w / 4w / 8w / custom", () => replaceSheet({ kind: "forward" }))}
        {rowBtn("⭐", "My Meals", "Saved custom meals — reuse in any slot", () => replaceSheet({ kind: "mymeals", at: rows.length }))}
        {rowBtn("✦", `Coach: ${coachOn ? "ON" : "OFF"}`, "Insight cards, celebrations & nudges — toggle anytime", () => { setCoachOn(!coachOn); setCoachDismissed(false); toast(coachOn ? "Coach off" : "Coach on"); })}
      </Sheet>
    );
  }

  function TrendsSheetView() {
    return (
      <Sheet title="Trends" subtitle="Averages here · full charts unchanged on Progress" onClose={closeAllSheets} onBack={backSheet}>
        <AveragesStrip clientId={clientId} today={today} />
        <a href="/progress" className="block w-full py-3 rounded-2xl text-sm font-bold text-white text-center" style={{ background: "var(--brand-primary)" }}>
          Open full charts — weight · BF% · calories · adherence ›
        </a>
        <p className="text-xs mt-3 rounded-xl p-2.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)" }}>
          Every log writes once → <b style={{ color: GREEN }}>meal_adherence_logs</b> → feeds every chart, the home ring and the trainer view. One source of truth.
        </p>
      </Sheet>
    );
  }

  function VersionsSheetView() {
    return (
      <Sheet title="Plan versions" subtitle="Live plan + staged incoming — auto-flips at midnight CT" onClose={closeAllSheets}>
        {versions.length === 0 && <p className="text-sm py-3 text-center" style={{ color: "var(--brand-text-secondary)" }}>Loading…</p>}
        {versions.map((v) => {
          const isLive = v.status === "live" && mealPlan?.id === v.id;
          const pending = (v.effective_date || "") > today;
          return (
            <div key={v.id} className="rounded-2xl p-3 mb-2" style={{ background: "var(--brand-bg)", border: `1px solid ${isLive ? "rgba(34,197,94,0.5)" : "var(--brand-border)"}` }}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>Plan v{v.version_number ?? "—"}</p>
                <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: isLive ? "rgba(34,197,94,0.18)" : pending ? "rgba(198,158,60,0.18)" : "var(--brand-surface)", color: isLive ? GREEN : pending ? GOLD : "var(--brand-text-secondary)" }}>
                  {isLive ? "LIVE" : pending ? `PENDING · EFF ${v.effective_date}` : "ARCHIVED"}
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
                Effective {v.effective_date || "—"}{v.change_reason ? ` · ${v.change_reason}` : ""}
              </p>
            </div>
          );
        })}
      </Sheet>
    );
  }

  function ForwardSheetView() {
    return (
      <ForwardSheet
        clientId={clientId}
        today={today}
        mealPlan={mealPlan}
        macroTarget={macroTarget}
        onClose={closeAllSheets}
        onBack={backSheet}
      />
    );
  }

  function ExtraPickSheetView() {
    const rowBtn = (ic: string, lab: string, sub: string, fn: () => void) => (
      <button onClick={fn} className="w-full flex items-center gap-3 rounded-2xl p-3 mb-1.5 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 10, background: "var(--brand-surface)", fontSize: 15 }}>{ic}</span>
        <span className="text-sm font-semibold min-w-0" style={{ color: "var(--brand-text)" }}>
          {lab}<span className="block text-xs font-normal" style={{ color: "var(--brand-text-secondary)" }}>{sub}</span>
        </span>
        <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
      </button>
    );
    return (
      <Sheet title="Quick-add extra" subtitle="Off-plan bites, drinks, extra scoops…" onClose={closeAllSheets}>
        {rowBtn("🗄", "Search the food database", "Instant search · verified badges", () => replaceSheet({ kind: "foodsearch", target: "extra" }))}
        {rowBtn("📷", "Photo → AI estimate", "Restaurant & receipt aware", () => replaceSheet({ kind: "offplan", rowKey: null, extra: true }))}
        {rowBtn("⌨", "Type foods with amounts", "AI parses each item → totals update", () => replaceSheet({ kind: "composer", mode: "extra" }))}
      </Sheet>
    );
  }

  function SavePlanSheetView() {
    return (
      <SavePlanSheet
        defaultName={`${clientName.split(" ")[0]}'s Plan`}
        today={today}
        totals={computeDayTotals(logs, [])}
        saving={savingPlan}
        onSave={saveDayAsPlan}
        onClose={closeAllSheets}
      />
    );
  }
}

// ---------------------------------------------------------------------------
// Top-level stateful sheets (kept outside the main component so background
// re-renders can't remount them and wipe in-progress edits).
// ---------------------------------------------------------------------------

function PlanAdjustSheet({
  meal, existingOv, loggedNow, onOpenFoodSearch, onSave, onClose, onBack,
}: {
  meal: PlanMeal;
  existingOv: ItemOverrides;
  loggedNow: boolean;
  onOpenFoodSearch: () => void;
  onSave: (clean: ItemOverrides) => Promise<void>;
  onClose: () => void;
  onBack: () => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    for (const it of meal.meal_items || []) {
      const o = existingOv[it.id] as { amount?: number } | undefined;
      seed[it.id] = o?.amount ?? (it.amount != null ? Number(it.amount) : 0);
    }
    return seed;
  });
  const [adds, setAdds] = useState(existingOv.__added || []);
  const [saving, setSaving] = useState(false);
  const stepFor = (unit: string | null) => {
    const u = (unit || "").toLowerCase();
    if (u === "g" || u.includes("gram")) return 10;
    if (u.includes("cup")) return 0.25;
    if (u.includes("tbsp") || u.includes("tsp") || u.includes("scoop")) return 0.5;
    return 1;
  };
  const draft: ItemOverrides = {};
  for (const it of meal.meal_items || []) {
    const v = amounts[it.id];
    if (v != null && it.amount != null && Math.abs(v - Number(it.amount)) > 1e-9) draft[it.id] = { amount: v };
  }
  if (adds.length) draft.__added = adds;
  const live = planMealMacros(meal, draft);
  return (
    <Sheet title="Adjust / edit" subtitle={loggedNow ? "Logged — changes update today's totals immediately" : "Item overrides — macros recalc live"} onClose={onClose} onBack={onBack}>
      {(meal.meal_items || []).map((it) => (
        <div key={it.id} className="flex items-center gap-2 rounded-xl p-2.5 mb-1.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: "var(--brand-text)" }}>{it.food}</p>
            <p style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>
              {it.is_unlimited ? "FREE · UNLIMITED" : `plan: ${it.amount ?? "—"}${it.unit ? " " + it.unit : ""} · ${r(kcalOf(it.protein || 0, it.carbs || 0, it.fats || 0))} cal`}
            </p>
          </div>
          {!it.is_unlimited && (
            <div className="flex items-center gap-1">
              <button onClick={() => setAmounts((p) => ({ ...p, [it.id]: Math.max(0, Math.round(((p[it.id] || 0) - stepFor(it.unit)) * 100) / 100) }))} className="w-8 h-8 rounded-lg text-sm font-bold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>−</button>
              <span className="text-xs font-bold text-center" style={{ color: "var(--brand-text)", minWidth: 44 }}>{amounts[it.id] ?? 0}{it.unit ? ` ${it.unit}` : ""}</span>
              <button onClick={() => setAmounts((p) => ({ ...p, [it.id]: Math.round(((p[it.id] || 0) + stepFor(it.unit)) * 100) / 100 }))} className="w-8 h-8 rounded-lg text-sm font-bold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>＋</button>
            </div>
          )}
        </div>
      ))}
      {adds.map((ad, i) => (
        <div key={"add" + i} className="flex items-center gap-2 rounded-xl p-2.5 mb-1.5" style={{ background: "var(--brand-bg)", border: "1px dashed var(--brand-border)" }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: "var(--brand-text)" }}>{ad.name} <span style={{ color: BLUE, fontSize: 9, fontWeight: 800 }}>ADDED</span></p>
            <p style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>{ad.servings} serving{ad.servings === 1 ? "" : "s"} · P{r(ad.p * ad.servings)} C{r(ad.c * ad.servings)} F{r(ad.f * ad.servings)}</p>
          </div>
          <button onClick={() => setAdds((p) => p.filter((_, j) => j !== i))} aria-label="remove" style={{ color: "var(--brand-text-secondary)", padding: 6 }}>✕</button>
        </div>
      ))}
      <button onClick={onOpenFoodSearch} className="w-full flex items-center gap-3 rounded-2xl p-3 mt-1 mb-2 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
        <span style={{ fontSize: 15 }}>🗄</span>
        <span className="text-xs font-semibold" style={{ color: "var(--brand-text)" }}>Add from the food database<span className="block font-normal" style={{ color: "var(--brand-text-secondary)", fontSize: 10.5 }}>Search · serving picker · verified badges</span></span>
        <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
      </button>
      <div className="flex justify-between py-2 text-sm font-bold" style={{ color: "var(--brand-text)" }}>
        <span style={{ color: "var(--brand-text-secondary)", fontWeight: 500 }}>This meal now</span>
        <span>{r(live.kcal)} cal · {r(live.protein)}P / {r(live.carbs)}C / {r(live.fats)}F</span>
      </div>
      <button
        onClick={async () => {
          setSaving(true);
          try {
            const clean: ItemOverrides = {};
            for (const k of Object.keys(draft)) if (k !== "__added") clean[k] = draft[k];
            if (adds.length) clean.__added = adds;
            await onSave(clean);
          } finally { setSaving(false); }
        }}
        disabled={saving}
        className="w-full py-3 rounded-2xl text-sm font-bold text-white"
        style={{ background: "var(--brand-primary)" }}
      >
        {saving ? "Saving…" : "Save — totals update ✓"}
      </button>
    </Sheet>
  );
}

function CustomEditSheet({
  initialMeta, onOpenFoodSearch, onSave, onClose, onBack,
}: {
  initialMeta: CustomMeta;
  onOpenFoodSearch: () => void;
  onSave: (meta: CustomMeta) => Promise<void>;
  onClose: () => void;
  onBack: () => void;
}) {
  const [meta, setMeta] = useState<CustomMeta>(() => JSON.parse(JSON.stringify(initialMeta)));
  const [saving, setSaving] = useState(false);
  const live = customMealMacros(meta);
  const inputStyle: React.CSSProperties = { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", borderRadius: 10, padding: "9px 12px", fontSize: 13, width: "100%", outline: "none" };
  return (
    <Sheet title="Edit custom meal" subtitle="Steppers · rename · retime — totals recalc live" onClose={onClose} onBack={onBack}>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Meal name" style={inputStyle} />
        <input value={meta.time || ""} onChange={(e) => setMeta({ ...meta, time: e.target.value })} placeholder="Time" style={inputStyle} />
      </div>
      {meta.items.map((it, j) => {
        const fac = it.fac ?? 1;
        return (
          <div key={j} className="flex items-center gap-2 rounded-xl p-2.5 mb-1.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: "var(--brand-text)" }}>{it.n}</p>
              <p style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>{it.a || "1 serving"}{fac !== 1 ? ` ×${fac}` : ""} · {r((it.k ?? kcalOf(it.p, it.c, it.f)) * fac)} cal · {r(it.p * fac)}P/{r(it.c * fac)}C/{r(it.f * fac)}F</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMeta({ ...meta, items: meta.items.map((x, k2) => k2 === j ? { ...x, fac: Math.max(0.25, Math.round(((x.fac ?? 1) - 0.25) * 100) / 100) } : x) })} className="w-7 h-7 rounded-lg text-sm font-bold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>−</button>
              <span className="text-xs font-bold text-center" style={{ color: "var(--brand-text-secondary)", minWidth: 32 }}>×{fac}</span>
              <button onClick={() => setMeta({ ...meta, items: meta.items.map((x, k2) => k2 === j ? { ...x, fac: Math.min(4, Math.round(((x.fac ?? 1) + 0.25) * 100) / 100) } : x) })} className="w-7 h-7 rounded-lg text-sm font-bold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>＋</button>
            </div>
            <button onClick={() => setMeta({ ...meta, items: meta.items.filter((_, k2) => k2 !== j) })} aria-label="remove" style={{ color: "var(--brand-text-secondary)", padding: 6 }}>✕</button>
          </div>
        );
      })}
      <button onClick={onOpenFoodSearch} className="w-full flex items-center gap-3 rounded-2xl p-3 mt-1 mb-2 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
        <span style={{ fontSize: 15 }}>🗄</span>
        <span className="text-xs font-semibold" style={{ color: "var(--brand-text)" }}>Add from the food database</span>
        <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
      </button>
      <div className="flex justify-between py-2 text-sm font-bold" style={{ color: "var(--brand-text)" }}>
        <span style={{ color: "var(--brand-text-secondary)", fontWeight: 500 }}>Total</span>
        <span>{r(live.kcal)} cal · {r(live.protein)}P / {r(live.carbs)}C / {r(live.fats)}F</span>
      </div>
      <button onClick={async () => { setSaving(true); try { await onSave(meta); } finally { setSaving(false); } }} disabled={saving}
        className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--brand-primary)" }}>
        {saving ? "Saving…" : "Save — totals update ✓"}
      </button>
    </Sheet>
  );
}

function ForwardSheet({
  clientId, today, mealPlan, macroTarget, onClose, onBack,
}: {
  clientId: string;
  today: string;
  mealPlan: MealPlanShape | null;
  macroTarget: MacroTarget | null;
  onClose: () => void;
  onBack: () => void;
}) {
  const [range, setRange] = useState<7 | 28 | 56>(7);
  return (
    <Sheet title="Week ahead" subtitle="Forward plan view — what's coming" onClose={onClose} onBack={onBack}>
      <div className="flex gap-1.5 mb-2">
        {([7, 28, 56] as const).map((d) => (
          <button key={d} onClick={() => setRange(d)} className="flex-1 py-2 rounded-lg text-xs font-bold"
            style={range === d ? { background: "var(--brand-primary)", color: "#fff" } : { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)" }}>
            {d === 7 ? "1w" : d === 28 ? "4w" : "8w"}
          </button>
        ))}
      </div>
      <div style={{ margin: "0 -1rem" }}>
        <PlanRangeView clientId={clientId} startDate={today} days={range} basePlan={mealPlan as never} baseTarget={macroTarget ? { calories: macroTarget.calories } : null} />
      </div>
    </Sheet>
  );
}

function SavePlanSheet({
  defaultName, today, totals, saving, onSave, onClose,
}: {
  defaultName: string;
  today: string;
  totals: Macros;
  saving: boolean;
  onSave: (name: string, eff: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [eff, setEff] = useState(today);
  const inputStyle: React.CSSProperties = { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", borderRadius: 12, padding: "10px 12px", fontSize: 13, width: "100%", outline: "none" };
  return (
    <Sheet title="Save as my ongoing plan" subtitle="Targets computed from the day you built" onClose={onClose}>
      <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
      <input type="date" value={eff} onChange={(e) => setEff(e.target.value || today)} style={{ ...inputStyle, marginBottom: 10, colorScheme: "dark light" }} />
      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--brand-text-secondary)" }}>Computed targets — from your built day</p>
      <div className="flex justify-between py-2 text-sm font-bold" style={{ color: "var(--brand-text)" }}>
        <span style={{ color: "var(--brand-text-secondary)", fontWeight: 500 }}>Daily targets</span>
        <span>{r(totals.kcal)} cal · {r(totals.protein)}P / {r(totals.carbs)}C / {r(totals.fats)}F</span>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
        From then on it logs one-tap — the plan lands as v-next, live, effective on the date above. Your trainer sees it too.
      </p>
      <button onClick={() => onSave(name.trim() || "My Plan", eff)} disabled={saving || totals.kcal < 200}
        className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--brand-primary)", opacity: totals.kcal < 200 ? 0.5 : 1 }}>
        {saving ? "Creating your plan…" : totals.kcal < 200 ? "Build at least one slot first" : "Make it my ongoing plan ✓"}
      </button>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Off-plan flow (photo / typed / describe) — shared by meal rows & extras.
// ---------------------------------------------------------------------------

function CheckSvg() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OffPlanFlow({
  clientId, selectedDate, title, onCommit, onClose, onBack,
}: {
  clientId: string;
  selectedDate: string;
  title: string;
  onCommit: (est: { desc: string; k: number; p: number; c: number; f: number; pending?: boolean; photoUrl?: string | null; items?: CustomItem[] }) => Promise<void>;
  onClose: () => void;
  onBack?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<"pick" | "photo" | "typed">("pick");
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<{ desc: string; k: number; p: number; c: number; f: number; items?: CustomItem[] } | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMode("photo");
    setPhotoFile(file);
    try { setPhotoPreview(URL.createObjectURL(file)); } catch { /* noop */ }
    setBusy(true);
    setErrMsg(null);
    setEst(null);
    try {
      const { base64 } = await compressPhoto(file);
      const res = await fetch("/api/analyze-meal-photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: base64, mimeType: "image/jpeg" }) });
      const json = await res.json().catch(() => null);
      if (!json || json.error) { setErrMsg(json?.error || "Analysis failed — try again or type it instead."); return; }
      const p = Number(json.protein_g) || 0, c = Number(json.carbs_g) || 0, f = Number(json.fat_g ?? json.fats_g) || 0;
      setEst({ desc: json.description || "Photo meal", k: Number(json.calories) || kcalOf(p, c, f), p, c, f });
    } catch {
      setErrMsg("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runTyped() {
    if (!text.trim()) return;
    setBusy(true);
    setErrMsg(null);
    setEst(null);
    const result = await parseFoodText(text.trim(), clientId);
    setBusy(false);
    if (!result || !result.items.length) {
      setErrMsg("AI parse isn't available right now — you can still save it as pending (macros filled in tonight).");
      return;
    }
    const tot = customMealMacros({ name: "", items: result.items });
    setEst({ desc: result.description || text.trim().slice(0, 80), k: tot.kcal, p: tot.protein, c: tot.carbs, f: tot.fats, items: result.items });
  }

  async function commit(pending: boolean) {
    setSaving(true);
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        try {
          const { blob } = await compressPhoto(photoFile);
          const path = `${clientId}/${selectedDate}-v3-${Date.now()}.jpg`;
          const { error: upErr } = await supabase.storage.from("meal-photos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
          if (!upErr) photoUrl = supabase.storage.from("meal-photos").getPublicUrl(path).data.publicUrl || null;
        } catch { /* keep going without the photo */ }
      }
      if (pending) {
        await onCommit({ desc: text.trim() || "Off-plan meal", k: 0, p: 0, c: 0, f: 0, pending: true, photoUrl });
      } else if (est) {
        await onCommit({ ...est, photoUrl });
      }
    } finally { setSaving(false); }
  }

  const rowBtn = (ic: string, lab: string, sub: string, fn: () => void) => (
    <button onClick={fn} className="w-full flex items-center gap-3 rounded-2xl p-3 mb-1.5 text-left" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
      <span className="flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 10, background: "var(--brand-surface)", fontSize: 15 }}>{ic}</span>
      <span className="text-sm font-semibold min-w-0" style={{ color: "var(--brand-text)" }}>
        {lab}<span className="block text-xs font-normal" style={{ color: "var(--brand-text-secondary)" }}>{sub}</span>
      </span>
      <span className="ml-auto" style={{ color: "var(--brand-text-secondary)" }}>›</span>
    </button>
  );

  return (
    <Sheet title={title} subtitle="AI estimates macros instantly · trainer can override" onClose={onClose} onBack={mode === "pick" ? onBack : () => { setMode("pick"); setEst(null); setErrMsg(null); }}>
      {mode === "pick" && (
        <>
          {rowBtn("📷", "Snap a photo", "Restaurant & receipt aware — detects chains for official data", () => fileRef.current?.click())}
          {rowBtn("⌨", "Type foods with amounts", '"8 oz chicken, 1 cup rice" → AI parses each item', () => setMode("typed"))}
          {rowBtn("✏️", "Describe it loosely", '"chipotle bowl, double chicken, no rice"', () => setMode("typed"))}
        </>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />

      {mode === "typed" && !est && (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
            placeholder="e.g. 8 oz chicken breast, 1 cup jasmine rice, 1 tbsp olive oil — or 'chipotle bowl, double chicken'"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", borderRadius: 12, padding: "10px 12px", fontSize: 13, width: "100%", outline: "none", resize: "none", fontFamily: "inherit" }} />
          <button onClick={runTyped} disabled={busy || !text.trim()} className="w-full mt-2 py-3 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--brand-primary)", opacity: text.trim() && !busy ? 1 : 0.6 }}>
            {busy ? "Analyzing…" : "AI parse & estimate →"}
          </button>
        </>
      )}

      {mode === "photo" && photoPreview && (
        <img src={photoPreview} alt="meal" className="w-full rounded-2xl mb-2" style={{ maxHeight: 200, objectFit: "cover", border: "1px solid var(--brand-border)" }} />
      )}

      {busy && mode === "photo" && (
        <div className="flex items-center gap-3 rounded-2xl p-3.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
          <span className="inline-block w-5 h-5 rounded-full animate-spin flex-shrink-0" style={{ border: "2.5px solid var(--brand-border)", borderTopColor: "var(--brand-primary)" }} />
          <span className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>Analyzing photo… reading plate, portions & any receipts</span>
        </div>
      )}

      {errMsg && (
        <>
          <p className="text-xs mt-2 rounded-xl p-2.5" style={{ background: "rgba(245,158,11,0.12)", color: "#b45309", border: "1px solid rgba(245,158,11,0.4)" }}>{errMsg}</p>
          {mode === "typed" && text.trim() && (
            <button onClick={() => commit(true)} disabled={saving} className="w-full mt-2 py-3 rounded-2xl text-sm font-bold" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
              {saving ? "Saving…" : "Save as pending — macros tonight"}
            </button>
          )}
        </>
      )}

      {est && (
        <>
          <div className="rounded-2xl p-3.5 mt-2" style={{ background: "var(--brand-bg)", border: "1px solid rgba(66,165,245,0.4)", animation: "v3fadeup 0.3s ease" }}>
            <p className="text-sm font-bold flex items-center gap-2 flex-wrap" style={{ color: "var(--brand-text)" }}>
              {est.desc}
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, background: "rgba(66,165,245,0.18)", color: "#42A5F5", padding: "2px 6px", borderRadius: 5 }}>EST</span>
            </p>
            {est.items?.map((it, i) => (
              <p key={i} className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
                {it.n}{it.a ? ` · ${it.a}` : ""} — {r(it.k ?? kcalOf(it.p, it.c, it.f))} cal · {r(it.p)}P/{r(it.c)}C/{r(it.f)}F
              </p>
            ))}
            <p className="text-base font-extrabold mt-2" style={{ color: "var(--brand-text)" }}>
              ~{r(est.k)} cal <span className="text-xs font-semibold" style={{ color: "var(--brand-text-secondary)" }}>· {r(est.p)}P / {r(est.c)}C / {r(est.f)}F</span>
            </p>
          </div>
          <button onClick={() => commit(false)} disabled={saving} className="w-full mt-2 py-3 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--brand-primary)" }}>
            {saving ? "Logging…" : "Log it — totals update ✓"}
          </button>
        </>
      )}
    </Sheet>
  );
}
