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
import { surfaceMood, type Mood } from "@/lib/ai/faces";
import { claimCoachSlot } from "@/lib/ai/coachMount";
import { kcalOf } from "@/lib/nutrition/dailyTotals";
import { COACH_FIRST_NAME } from "@/lib/trainer";
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

/**
 * How the coach OPENS, per screen.
 *
 * Dustin, 2026-08-13, with a screenshot of the workout logger: "this is the ai
 * in workout logger talking about nutrition. we shoukd have capability of doing
 * anythijg in app from any page but the initial opening shoukd be specific to
 * the page its in."
 *
 * Exactly right, and the two halves are separate concerns. CAPABILITY is
 * unchanged — the endpoint answers anything from anywhere, because it has the
 * client's whole picture regardless of which tab they happen to be on. What was
 * wrong is the OPENING: the same greeting and the same three meal chips
 * everywhere, so a client standing over a barbell got "swap M4 for salmon and
 * rice". That is not a wrong answer, it is not answering.
 *
 * The opener is the one thing that should know where it is standing.
 */
const OPENERS: Record<string, { greeting: string; chips: string[] }> = {
  nutrition: {
    greeting:
      "Hey — I'm your coach. I can see your logs, targets and trends. Ask me anything — or tell me what to change (\"swap M4 for salmon and rice\", \"I ate a cookie\") and I'll set it up for you to confirm.",
    chips: ["How's my adherence this week?", "Am I on track with protein today?", "What should I adjust?"],
  },
  workout: {
    greeting:
      "I've got today's session and everything you've lifted before it. Ask me about a movement, a weight, or how this one should feel.",
    chips: ["Is this weight right for me?", "How should today feel?", "Something's bothering me"],
  },
  logger: {
    greeting: "Mid-set questions are the best kind. Ask away — I can see this session and your history on every lift in it.",
    chips: ["Should I go up?", "Swap this movement", "This doesn't feel right"],
  },
  progress: {
    greeting: "I can see your whole trend, not just the last weigh-in. Ask me what the numbers actually mean.",
    chips: ["Am I losing fat or water?", "How's my trend really going?", "What should change?"],
  },
  home: {
    greeting: "Ask me anything about your week — what to focus on, how it's going, or what to do about it.",
    chips: ["What should I focus on this week?", "How did last week go?", "What am I behind on?"],
  },
  messages: {
    greeting: "Ask me anything. If it needs a real decision from " + COACH_FIRST_NAME + ", I'll tell you to ask him rather than guess.",
    chips: ["What should I ask " + COACH_FIRST_NAME + "?", "How's my week going?", "What should I focus on?"],
  },
  settings: {
    greeting: "Ask me how anything in here works — or anything about your training and eating, same as always.",
    chips: ["How do I log a meal?", "How do I change my plan?", "How's my week going?"],
  },
  help: {
    greeting: "Ask me how anything in the app works. Plain answers, no jargon.",
    chips: ["How do I log a workout?", "How do I log a meal?", "Where do I see my progress?"],
  },
  app: {
    greeting: "I'm your coach — I can see your training, your eating and your trend. Ask me anything.",
    chips: ["How's my week going?", "What should I focus on?", "What should I change?"],
  },
};

const CAP_MESSAGE =
  "You've maxed out Coach for today — I'll be back with fresh answers tomorrow. Everything you log still counts as normal.";

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
  fabLiftPx = 0,
  claimsSlot = true,
  surface = "nutrition",
  contextLine,
  startOpen = false,
  onClose,
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
  /**
   * Extra lift for the floating button, in px.
   *
   * Messages needs it: the composer is pinned to the bottom of that screen and
   * the send button lands in exactly the corner the coach floats in, so the
   * coach was sitting on top of it. Dustin, 13 Aug, with a screenshot: "the ai
   * bot [is] over a button blocking it, it needs to be mounted in a better spot
   * on that messaging page."
   *
   * The number lives at the mount site rather than inside CoachFab, because
   * what it has to clear is a property of the SCREEN, not of the button.
   */
  fabLiftPx?: number;
  /**
   * Whether this instance owns the ✦ slot for its screen.
   *
   * MUST be false for the instance GlobalCoach renders, and the reason is a
   * production outage on 13 Aug rather than a preference:
   *
   *   GlobalCoach renders this component, and this component claimed the slot
   *   on mount. GlobalCoach hides itself when the slot is claimed. So it
   *   mounted us, we claimed, it unmounted us, the claim released, it mounted
   *   us again — a render loop that froze the home screen solid and made the
   *   button flicker. It is in the app layout, so it took every client screen
   *   with it.
   *
   * Only a screen that mounts its OWN better-informed coach claims. The global
   * one is the fallback and never competes with itself.
   */
  claimsSlot?: boolean;
  /** Which screen this is mounted on — chooses the opening line and the chips. */
  surface?: string;
  /**
   * One extra sentence on the greeting naming what the client is actually
   * looking at — "You're on Barbell Row, set 2." The surface opener says what
   * the coach can help with here; this says what "here" IS. Only worth passing
   * where the screen has a single obvious subject.
   */
  contextLine?: string;
  /**
   * Mount already open, with no floating button of its own.
   *
   * For screens that own their trigger — the workout logger puts the coach in
   * its exercise header rather than floating it, because CoachFab reads the
   * keyboard height and that screen's oldest rule is that nothing in it reacts
   * to the keyboard.
   */
  startOpen?: boolean;
  /** Told when the sheet closes, so the owner can drop it. */
  onClose?: () => void;
}) {
  const todayCT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const isToday = selectedDate === todayCT;
  // "today" when it is, an unmissable date when it is not.
  const dayLabel = isToday
    ? "today"
    : new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const opener = OPENERS[surface] ?? OPENERS.app;
  const GREETING = contextLine ? `${contextLine} ${opener.greeting}` : opener.greeting;

  const supabase = useMemo(() => createClient(), []);
  const [enabled, setEnabled] = useState(true); // client_app_settings.coach_enabled
  const [open, setOpen] = useState(startOpen);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "coach", text: GREETING }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [capped, setCapped] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set()); // "msgIdx:sugIdx"
  const [applying, setApplying] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null); // msg index of the executing action
  // "Send this to Dustin" — see /api/coach-escalate for why this is the ONLY
  // way anything reaches his inbox from here. The coach never forwards by
  // itself; Dustin's rule was "only what client approve to be escalated".
  const [escalated, setEscalated] = useState<Set<number>>(new Set());
  const [escalating, setEscalating] = useState<number | null>(null);
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
  useEffect(() => {
    if (!claimsSlot) return;
    return claimCoachSlot();
  }, [claimsSlot]);

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

  /**
   * Let something outside this subtree open the coach.
   *
   * Added for the pool-gated clients (Gerard and Sharon), who get a large
   * in-flow bar on their home screen instead of hunting for a 56px circle in
   * the corner. That bar is rendered by ClientDashboard, a completely separate
   * subtree, so an event is the honest mechanism: lifting `open` to a common
   * ancestor would mean restructuring the client layout to serve two people.
   *
   * It calls openChat() rather than setOpen(true) so an externally-opened
   * conversation starts in exactly the same state as a tapped one — same
   * greeting, same not-today warning. Two ways in, one behaviour.
   */
  useEffect(() => {
    const onExternalOpen = () => { if (!open) openChat(); };
    window.addEventListener("symmetry:open-coach", onExternalOpen);
    return () => window.removeEventListener("symmetry:open-coach", onExternalOpen);
    // openChat closes over isToday/dayLabel, so re-register when they move or a
    // client opening the bar on a past day would miss the warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isToday, dayLabel]);

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

  /**
   * Hand this exchange to Dustin.
   *
   * Sends the client's question AND the answer they were given, because he
   * needs to know they have already been told something — otherwise he repeats
   * it, or contradicts it, and either one makes the app look like it is not
   * talking to him.
   *
   * The reply in the chat matters as much as the send does. Without it the
   * client has no idea whether a human is coming, so they rephrase the same
   * question at the AI three more times. "He'll come back to you here" tells
   * them the waiting is the right thing to do, and where to look.
   */
  async function escalate(mi: number) {
    if (escalating != null || escalated.has(mi)) return;
    const answer = msgs[mi]?.text || "";
    // The nearest thing they said above this. On the greeting there is nothing
    // above it, which is why the control is not offered there.
    let question = "";
    for (let i = mi - 1; i >= 0; i--) {
      if (msgs[i].role === "client") { question = msgs[i].text; break; }
    }
    setEscalating(mi);
    try {
      const res = await fetch("/api/coach-escalate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, answer, surface }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "");
      setEscalated((s) => new Set(s).add(mi));
      setMsgs((m) => [
        ...m,
        {
          role: "coach" as const,
          text: "Sent to " + COACH_FIRST_NAME + " — he'll come back to you in Messages. No need to ask me again in the meantime.",
        },
      ]);
    } catch (e) {
      const why = e instanceof Error && e.message ? e.message : "";
      setMsgs((m) => [
        ...m,
        {
          role: "coach" as const,
          text: "I couldn't get that to " + COACH_FIRST_NAME + (why ? " — " + why : "") + ". Message him directly from the Messages tab and it'll reach him.",
        },
      ]);
    } finally {
      setEscalating(null);
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
      {!open && !startOpen && <CoachFab onClick={openChat} mood={fabMood} liftPx={fabLiftPx} />}

      {open && (
        <Sheet title="✦ Coach" subtitle="Grounded in your logs, targets & trends" onClose={() => { setOpen(false); onClose?.(); }}>
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
                      <AiBadge size={20} mood={surfaceMood(surface)} />
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
                  {/* The way out of the AI, on every answer it gives.
                      Deliberately quiet — a small line of text, not a button
                      competing with the answer above it. It is an escape hatch,
                      not a call to action; most answers do not need Dustin and
                      the UI should not imply they do.
                      Not offered on the greeting (mi === 0 — nothing has been
                      asked yet) or on a pending change (the client is mid-
                      decision; forwarding it half-made helps nobody). */}
                  {msg.role !== "client" && mi > 0 && !msg.action && (
                    <button
                      onClick={() => escalate(mi)}
                      disabled={escalating != null || escalated.has(mi)}
                      className="mt-1 text-left"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        minHeight: 32,
                        padding: "2px 2px",
                        background: "transparent",
                        border: "none",
                        color: escalated.has(mi) ? "#16A34A" : "var(--brand-text-secondary)",
                        textDecoration: escalated.has(mi) ? "none" : "underline",
                        opacity: escalating === mi ? 0.5 : 1,
                        cursor: escalated.has(mi) ? "default" : "pointer",
                      }}
                    >
                      {escalated.has(mi)
                        ? "✓ Sent to " + COACH_FIRST_NAME
                        : escalating === mi
                          ? "Sending…"
                          : "Send this to " + COACH_FIRST_NAME}
                    </button>
                  )}
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
                <div className="flex mb-2 items-end gap-1.5">
                  <AiBadge size={20} mood="thinking" title="" />
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
              {[...(canAct ? ACTION_CHIPS : []), ...opener.chips].map((q) => (
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
