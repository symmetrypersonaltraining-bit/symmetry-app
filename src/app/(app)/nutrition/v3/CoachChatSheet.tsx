"use client";

// ============================================================================
// Nutrition v3 — AI coach chat: floating ✦ button → bottom-sheet chat.
// Free text goes to POST /api/nutrition-ai/act { message, clientId,
// dayContext } (cookie-auth, metered server-side: 429 {capExceeded} per-client
// daily cap, 200 {paused} global kill switch — both rendered as friendly coach
// bubbles). Two response shapes:
//   • { intent:'none', message, suggestions? } — Q&A (the endpoint falls
//     through to the coach behavior server-side). suggestions[] render as
//     one-tap "Apply to today" chips (extras rows, positions 6/7).
//   • { intent, params, confirmation, reply } — a "do-anything" action. The
//     reply renders as a bubble + a confirmation card; NOTHING mutates until
//     the client taps Confirm, which executes via the `actions` callbacks the
//     parent passes down (the existing v3 write helpers — est_*+off_plan
//     protocol, extras at 6/7, undo toasts where the helper has one).
// Conversation is in-memory per open — closing the sheet resets it.
// Respects client_app_settings.coach_enabled (button hidden when false; a
// missing column / read error fails open so the coach stays available).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AiBadge from "@/components/AiBadge";
import CoachFab from "@/components/CoachFab";
import type { Mood } from "@/lib/ai/faces";
import { claimCoachSlot } from "@/lib/ai/coachMount";
import { kcalOf } from "@/lib/nutrition/dailyTotals";
import Sheet from "./Sheet";

export interface CoachSuggestion {
  label: string;
  delta: { p: number; c: number; f: number; kcal: number };
}

/** One meal of today's list, sent to /act so the model can resolve references. */
export interface CoachDayMeal {
  position: number;
  label: string;
  name: string;
  logged: boolean;
  kcal: number;
  p: number;
  c: number;
  f: number;
}

/** Item shape returned by /act for swap_meal / add_snack (server-normalized). */
export interface CoachActionItem {
  name: string;
  amount: number | null;
  unit: string | null;
  kcal: number;
  p: number;
  c: number;
  f: number;
}

export type CoachActionAdherence = "Full" | "3/4" | "1/2" | "1/4" | "Skipped";

/**
 * Callbacks the parent (NutritionV3Client) exposes so confirmed actions run
 * through the EXISTING write helpers — same positions, protocols and toasts
 * as the manual UI. All meal references are today's meal_position values.
 */
export interface CoachActions {
  /** Replace a meal's contents for today (swap-for-custom write: unlogged, __custom.kind 'swap'). */
  swapMealCustom: (position: number, name: string, items: CoachActionItem[]) => Promise<void>;
  /** Reorder: place the meal at `from` where the meal at `to` currently sits (persistOrder path). */
  moveMeal: (from: number, to: number) => Promise<void>;
  /** Duplicate the meal at `from`; the copy lands after the meal at `to` (null → end of day), unlogged. */
  copyMeal: (from: number, to: number | null) => Promise<void>;
  /** Remove a meal for today only (standard undo toast). */
  deleteMeal: (position: number) => Promise<void>;
  /** Log an off-plan extra (positions 6/7, est_* protocol). */
  addExtraParsed: (items: CoachActionItem[], name: string) => Promise<void>;
  /** Mark a meal eaten at the given adherence (default Full). */
  logMeal: (position: number, adherence?: CoachActionAdherence) => Promise<void>;
  /** Un-log a logged meal (placeholder-preserving unlog write). */
  unlogMeal: (position: number) => Promise<void>;
}

interface PendingAction {
  intent: string;
  params: {
    position?: number;
    from?: number;
    to?: number | null;
    name?: string;
    adherence?: CoachActionAdherence;
    items?: CoachActionItem[];
  };
  confirmation: string;
}

interface Msg {
  role: "client" | "coach";
  text: string;
  suggestions?: CoachSuggestion[];
  action?: PendingAction;
  actionState?: "pending" | "done" | "cancelled" | "failed";
}

const ACTION_CHIPS = ["Swap a meal", "Move a meal", "I ate something extra"];
const QUICK_CHIPS = [
  "How's my adherence this week?",
  "Am I on track with protein today?",
  "What should I adjust?",
];

const CAP_MESSAGE =
  "You've maxed out Coach for today — I'll be back with fresh answers tomorrow. Everything you log still counts as normal.";
const GREETING =
  "Hey — I'm your coach. I can see your logs, targets and trends. Ask me anything — or tell me what to change (\"swap M4 for salmon and rice\", \"I ate a cookie\") and I'll set it up for you to confirm.";

function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function parseSuggestions(raw: unknown): CoachSuggestion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: CoachSuggestion[] = [];
  for (const s of raw.slice(0, 3)) {
    if (!s || typeof s !== "object") continue;
    const o = s as { label?: unknown; delta?: Record<string, unknown> | null };
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label || !o.delta || typeof o.delta !== "object") continue;
    const p = num(o.delta.p), c = num(o.delta.c), f = num(o.delta.f);
    const kcal = o.delta.kcal != null ? num(o.delta.kcal) : kcalOf(p, c, f);
    if (!p && !c && !f && !kcal) continue;
    out.push({ label, delta: { p, c, f, kcal } });
  }
  return out.length ? out : undefined;
}

function fmtDelta(d: CoachSuggestion["delta"]): string {
  const sign = (n: number) => (n > 0 ? "+" : "") + Math.round(n);
  const parts: string[] = [];
  if (d.p) parts.push(`${sign(d.p)}P`);
  if (d.c) parts.push(`${sign(d.c)}C`);
  if (d.f) parts.push(`${sign(d.f)}F`);
  parts.push(`${sign(d.kcal)} cal`);
  return parts.join(" · ");
}

export default function CoachChatSheet({
  clientId,
  dayContext,
  actions,
  onApplySuggestion,
  selectedDate,
  canAct = true,
  fabMood = "nutrition",
}: {
  clientId: string;
  /** The day as rendered — sent with every message so /act can resolve references. */
  dayContext: CoachDayMeal[];
  /** Existing v3 write helpers — confirmed actions execute through these only. */
  actions: CoachActions;
  /** Writes the delta as a quick-log extra row (positions 6/7) on the SELECTED day. */
  onApplySuggestion: (s: CoachSuggestion) => Promise<void>;
  /**
   * The day the logger is showing, YYYY-MM-DD.
   *
   * The coach used to be hidden entirely unless you were on today, which meant
   * one tap of the back arrow made the button vanish for the rest of the
   * session with nothing on screen explaining why. Un-gating it fixed that and
   * introduced something worse: every write goes to the selected day, but the
   * buttons and confirmations all said "today", so glancing at yesterday and
   * saying "I ate a cookie" silently rewrote a closed day's macros while
   * telling you it had logged today.
   *
   * Logging a day late is a real thing people do, so the fix is not to refuse
   * it — it is to never lie about which day is being written. Every label
   * below names the actual date whenever it is not today.
   */
  selectedDate: string;
  /**
   * Whether confirmed actions can actually be executed here.
   *
   * The same chat is mounted globally, where there is no meal list to change
   * and none of the `actions` write helpers exist. The model does not know
   * that, so it will still happily extract "log M2" from a message typed on the
   * Progress tab. Rendering a Confirm button that runs a no-op and then says
   * "Done" is the worst possible answer: the client believes their day is
   * logged and it is not. When this is false, an action intent comes back as a
   * plain sentence pointing at the tab that can do it.
   */
  canAct?: boolean;
  /** The face on the floating button — the surface's own mood. */
  fabMood?: Mood;
}) {
  const todayCT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const isToday = selectedDate === todayCT;
  // "today" when it is, an unmissable date when it is not.
  const dayLabel = isToday
    ? "today"
    : new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const supabase = useMemo(() => createClient(), []);
  const [enabled, setEnabled] = useState(true); // client_app_settings.coach_enabled
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "coach", text: GREETING }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [capped, setCapped] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set()); // "msgIdx:sugIdx"
  const [applying, setApplying] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null); // msg index of the executing action
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("client_app_settings")
          .select("coach_enabled")
          .eq("client_id", clientId)
          .maybeSingle();
        if (!on || error) return; // column not deployed yet → coach stays on
        if ((data as { coach_enabled?: boolean | null } | null)?.coach_enabled === false) setEnabled(false);
      } catch { /* fail open */ }
    })();
    return () => { on = false; };
  }, [supabase, clientId]);

  // This screen's coach knows today's meals and can actually change them, so it
  // outranks the global one. Claiming the slot hides that button while we are
  // here — see coachMount for why it is a count and not a flag.
  useEffect(() => claimCoachSlot(), []);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, sending, open]);

  function openChat() {
    // Fresh conversation each open (no persistence tonight).
    setMsgs([
      { role: "coach", text: GREETING },
      // Said once, at the top, before anything is typed. A label on the Apply
      // button is the last line of defence; this is the first.
      ...(isToday
        ? []
        : [{ role: "coach" as const, text: "Heads up — you're looking at " + dayLabel + ", so anything I log goes on that day, not today." }]),
    ]);
    setInput("");
    setCapped(false);
    setApplied(new Set());
    setApplying(null);
    setActing(null);
    setOpen(true);
  }

  async function send(q: string) {
    const question = q.trim();
    if (!question || sending || capped) return;
    setMsgs((m) => [...m, { role: "client", text: question }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/nutrition-ai/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the turns so far. The sheet has always kept a Msg[] and rendered
        // it as a conversation; it just never reached the model, so every
        // question was answered cold. `msgs` is the state BEFORE this question
        // was appended in React's next render, so it is exactly the prior turns.
        body: JSON.stringify({
          message: question,
          clientId,
          dayContext,
          // The model was told "only ever change TODAY's log" while the client
          // wrote to whatever day was on screen. Now it is told the truth.
          logDate: selectedDate,
          history: msgs
            .filter((m) => !!m.text)
            .map((m) => ({ role: m.role === "client" ? "user" : "assistant", content: m.text })),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            intent?: string; params?: PendingAction["params"]; confirmation?: string; reply?: string;
            message?: string; suggestions?: unknown; error?: string; paused?: boolean; capExceeded?: boolean;
          }
        | null;
      if (res.status === 429 || json?.capExceeded) {
        setCapped(true);
        setMsgs((m) => [...m, { role: "coach", text: CAP_MESSAGE }]);
        return;
      }
      if (json?.paused) {
        // Global kill switch — server sends a friendly body with HTTP 200.
        setMsgs((m) => [...m, {
          role: "coach",
          text: json.message || json.error || "AI features are taking a short break this month — you can still log everything manually.",
        }]);
        return;
      }
      // Action intent → coach reply + confirmation card. Nothing mutates here.
      if (res.ok && json?.intent && json.intent !== "none" && json.confirmation && json.params && !canAct) {
        // Off the nutrition tab there is nothing to change and nothing to
        // change it with. Say so instead of offering a button that lies.
        setMsgs((m) => [...m, {
          role: "coach",
          text: (json.reply ? json.reply + " " : "") +
            "I can set that up on the Nutrition tab — open it and tell me again there.",
        }]);
        return;
      }
      if (res.ok && json?.intent && json.intent !== "none" && json.confirmation && json.params) {
        setMsgs((m) => [...m, {
          role: "coach",
          text: json.reply || json.confirmation!,
          action: { intent: json.intent!, params: json.params!, confirmation: json.confirmation! },
          actionState: "pending",
        }]);
        return;
      }
      if (!res.ok || !json || (!json.message && !json.error)) {
        setMsgs((m) => [...m, { role: "coach", text: "Hmm — I couldn't answer that one. Give it another try in a moment." }]);
        return;
      }
      if (!json.message && json.error) {
        setMsgs((m) => [...m, { role: "coach", text: json.error! }]);
        return;
      }
      setMsgs((m) => [...m, { role: "coach", text: json.message!, suggestions: canAct ? parseSuggestions(json.suggestions) : undefined }]);
    } catch {
      setMsgs((m) => [...m, { role: "coach", text: "Network hiccup — check your connection and try again." }]);
    } finally {
      setSending(false);
    }
  }

  // ---- confirmed-action execution (existing v3 write helpers only) --------
  async function runAction(a: PendingAction): Promise<void> {
    const p = a.params;
    const needPos = (v: number | null | undefined): number => {
      if (typeof v !== "number" || !isFinite(v)) throw new Error("that meal isn't on today's list anymore");
      return v;
    };
    switch (a.intent) {
      case "swap_meal":
        if (!p.items?.length) throw new Error("the new meal came back empty");
        await actions.swapMealCustom(needPos(p.position), p.name || p.items.map((i2) => i2.name).join(" + "), p.items);
        break;
      case "move_meal":
        await actions.moveMeal(needPos(p.from), needPos(p.to));
        break;
      case "copy_meal":
        await actions.copyMeal(needPos(p.from), typeof p.to === "number" ? p.to : null);
        break;
      case "delete_meal":
        await actions.deleteMeal(needPos(p.position));
        break;
      case "add_snack":
        if (!p.items?.length) throw new Error("the snack came back empty");
        await actions.addExtraParsed(p.items, p.name || p.items.map((i2) => i2.name).join(" + "));
        break;
      case "log_meal":
        await actions.logMeal(needPos(p.position), p.adherence || "Full");
        break;
      case "unlog_meal":
        await actions.unlogMeal(needPos(p.position));
        break;
      default:
        throw new Error("I don't know how to do that yet");
    }
  }

  async function confirmAction(mi: number) {
    const msg = msgs[mi];
    if (!msg?.action || msg.actionState !== "pending" || acting != null) return;
    setActing(mi);
    try {
      await runAction(msg.action);
      setMsgs((m) => [
        ...m.map((x, i) => (i === mi ? { ...x, actionState: "done" as const } : x)),
        { role: "coach" as const, text: "✓ Done — " + msg.action!.confirmation.replace(/\s*\?+\s*$/, "") + (isToday ? "." : " (" + dayLabel + ").") },
      ]);
    } catch (e) {
      const why = e instanceof Error && e.message ? e.message : "something went wrong";
      setMsgs((m) => [
        ...m.map((x, i) => (i === mi ? { ...x, actionState: "failed" as const } : x)),
        { role: "coach" as const, text: "I couldn't finish that — " + why + ". Nothing was changed." },
      ]);
    } finally {
      setActing(null);
    }
  }

  function cancelAction(mi: number) {
    const msg = msgs[mi];
    if (!msg?.action || msg.actionState !== "pending" || acting != null) return;
    setMsgs((m) => [
      ...m.map((x, i) => (i === mi ? { ...x, actionState: "cancelled" as const } : x)),
      { role: "coach" as const, text: "No problem — nothing changed." },
    ]);
  }

  async function apply(mi: number, si: number, s: CoachSuggestion) {
    const key = mi + ":" + si;
    if (applied.has(key) || applying) return;
    setApplying(key);
    try {
      await onApplySuggestion(s);
      setApplied((prev) => new Set(prev).add(key));
    } finally {
      setApplying(null);
    }
  }

  if (!enabled) return null;

  const canSend = !!input.trim() && !sending && !capped;

  return (
    <>
      {/* The shared button — placement, z-order and the hide-under-the-keyboard
          rule live in CoachFab so every mount of the coach behaves the same. */}
      {!open && <CoachFab onClick={openChat} mood={fabMood} />}

      {open && (
        <Sheet title="✦ Coach" subtitle="Grounded in your logs, targets & trends" onClose={() => setOpen(false)}>
          <style>{`@keyframes coachdot { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }`}</style>
          <div style={{ display: "flex", flexDirection: "column", height: "62vh" }}>
            {/* messages */}
            <div ref={listRef} style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", paddingBottom: 8 }}>
              {msgs.map((msg, mi) => (
                <div key={mi} className="flex flex-col mb-2" style={{ alignItems: msg.role === "client" ? "flex-end" : "flex-start" }}>
                  {/* The coach's face on its first line of a run. Same artwork as
                      Coach Bot in the group chat and the insight cards above —
                      one AI face across the app, so a client learns it once and
                      always knows whether they are reading Dustin or the app. */}
                  {msg.role !== "client" && (mi === 0 || msgs[mi - 1].role === "client") && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <AiBadge size={20} />
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: "var(--brand-text-secondary)" }}>COACH</span>
                    </div>
                  )}
                  <div
                    className="text-[13px] leading-relaxed"
                    style={{
                      maxWidth: "82%",
                      padding: "9px 13px",
                      whiteSpace: "pre-wrap",
                      ...(msg.role === "client"
                        ? { background: "var(--brand-primary)", color: "#fff", borderRadius: "16px 16px 4px 16px" }
                        : { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", borderRadius: "16px 16px 16px 4px" }),
                    }}
                  >
                    {msg.text}
                  </div>
                  {msg.action && (
                    <div
                      className="mt-1.5"
                      style={{
                        maxWidth: "82%",
                        padding: "10px 13px",
                        borderRadius: 14,
                        background:
                          msg.actionState === "done" ? "rgba(34,197,94,0.10)"
                          : msg.actionState === "pending" ? "var(--brand-surface)"
                          : "var(--brand-bg)",
                        border: `1px solid ${
                          msg.actionState === "done" ? "rgba(34,197,94,0.5)"
                          : msg.actionState === "pending" ? "var(--brand-primary)"
                          : "var(--brand-border)"
                        }`,
                        opacity: msg.actionState === "cancelled" || msg.actionState === "failed" ? 0.6 : 1,
                      }}
                    >
                      <span className="block text-xs font-bold" style={{ color: msg.actionState === "done" ? "#22c55e" : "var(--brand-primary)" }}>
                        {msg.actionState === "done" ? "✓ Done" : msg.actionState === "cancelled" ? "Cancelled" : msg.actionState === "failed" ? "Didn't go through" : "Confirm this change?"}
                      </span>
                      <span className="block text-xs mt-0.5" style={{ color: "var(--brand-text)", textDecoration: msg.actionState === "cancelled" ? "line-through" : undefined }}>
                        {msg.action.confirmation}
                      </span>
                      {msg.actionState === "pending" && (
                        <span className="flex gap-2 mt-2">
                          <button
                            onClick={() => confirmAction(mi)}
                            disabled={acting != null}
                            className="flex-1 text-xs font-bold text-white"
                            style={{ minHeight: 44, borderRadius: 12, background: "var(--brand-primary)", opacity: acting === mi ? 0.6 : 1 }}
                          >
                            {acting === mi ? "Working…" : "Confirm ✓"}
                          </button>
                          <button
                            onClick={() => cancelAction(mi)}
                            disabled={acting != null}
                            className="flex-1 text-xs font-bold"
                            style={{ minHeight: 44, borderRadius: 12, background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}
                          >
                            Cancel
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                  {msg.suggestions?.map((s, si) => {
                    const key = mi + ":" + si;
                    const done = applied.has(key);
                    const busy = applying === key;
                    return (
                      <button
                        key={si}
                        onClick={() => apply(mi, si, s)}
                        disabled={done || !!applying}
                        className="mt-1.5 text-left"
                        style={{
                          maxWidth: "82%",
                          minHeight: 44,
                          padding: "8px 13px",
                          borderRadius: 14,
                          background: done ? "rgba(34,197,94,0.12)" : "var(--brand-surface)",
                          border: `1px solid ${done ? "rgba(34,197,94,0.5)" : "var(--brand-primary)"}`,
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        <span className="block text-xs font-bold" style={{ color: done ? "#22c55e" : "var(--brand-primary)" }}>
                          {done ? "✓ Added to " + dayLabel : busy ? "Adding…" : "＋ Apply to " + dayLabel}
                        </span>
                        <span className="block text-xs mt-0.5" style={{ color: "var(--brand-text)" }}>
                          {s.label} <span style={{ color: "var(--brand-text-secondary)" }}>({fmtDelta(s.delta)})</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {sending && (
                <div className="flex mb-2">
                  <div className="flex items-center gap-1" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", borderRadius: "16px 16px 16px 4px", padding: "12px 14px" }} aria-label="Coach is typing">
                    {[0, 1, 2].map((i) => (
                      <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-text-secondary)", display: "inline-block", animation: `coachdot 1.1s ease-in-out ${i * 0.18}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* quick chips — action starters first, then the Q&A chips */}
            <div className="flex gap-1.5 pt-2 pb-2" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", flexShrink: 0 }}>
              {[...ACTION_CHIPS, ...QUICK_CHIPS].map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={sending || capped}
                  className="text-xs font-semibold whitespace-nowrap"
                  style={{
                    minHeight: 44,
                    padding: "0 14px",
                    borderRadius: 999,
                    background: "var(--brand-bg)",
                    border: "1px solid var(--brand-border)",
                    color: "var(--brand-text)",
                    opacity: sending || capped ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* input row */}
            <div className="flex gap-2" style={{ flexShrink: 0 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSend) send(input); }}
                placeholder={capped ? "Coach is done for today" : "Ask your coach…"}
                disabled={capped}
                maxLength={1500}
                enterKeyHint="send"
                className="flex-1 min-w-0 text-sm"
                style={{
                  height: 44,
                  padding: "0 14px",
                  borderRadius: 14,
                  background: "var(--brand-bg)",
                  border: "1px solid var(--brand-border)",
                  color: "var(--brand-text)",
                  outline: "none",
                }}
              />
              <button
                onClick={() => send(input)}
                disabled={!canSend}
                aria-label="Send"
                className="flex items-center justify-center flex-shrink-0 font-extrabold"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: canSend ? "var(--brand-primary)" : "var(--brand-bg)",
                  border: canSend ? "none" : "1px solid var(--brand-border)",
                  color: canSend ? "#fff" : "var(--brand-text-secondary)",
                  fontSize: 17,
                }}
              >
                ↑
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
