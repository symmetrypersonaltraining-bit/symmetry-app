"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sendMessage } from "@/app/(app)/home/messageActions";
import { fx } from "@/lib/fx";
import AiBadge from "@/components/AiBadge";

/**
 * AttentionFeed — "Who needs you today". Trainer home, 2026-07-25.
 *
 * Reads /api/attention, which applies the SAME segmentation the nudge engine
 * uses. That's deliberate: the trainer's list and the automated check-ins can
 * never disagree about who is slipping, because there is one rule set.
 *
 * Deliberately compact. The Week ahead card below it is the full roster with
 * focus editing; this is the short "act on these first" strip, ranked by
 * severity. Collapsed to the top 3 until tapped.
 *
 * ONE-TAP DRAFTS (2026-07-25): each row can open five ready-to-send messages
 * written for that person's specific situation from their real numbers, in
 * Dustin's voice — warm, practical, straight up, and two that lean on humour.
 * Tap one to send it; tap ✎ to tweak it first; tap Handled to dismiss the row
 * when you already know why they're out.
 *
 * Drafts are generated on tap, never on page load, so a feed nobody touches
 * costs nothing. Sending goes through the existing sendMessage server action,
 * so the message lands in the normal thread with the normal push — this screen
 * doesn't invent a second way to message people.
 *
 * SAFETY: nothing is ever sent without an explicit tap on a specific draft.
 * The API only returns text; it has no send path of its own.
 */

interface Row {
  id: string;
  name: string;
  reason: string;
  detail: string;
  severity: 1 | 2 | 3;
  tag: string;
}

const SEV_COLOR: Record<number, string> = {
  3: "#ef4444",
  2: "#f59e0b",
  1: "#7c9cf5",
};

const TAG_ICON: Record<string, string> = {
  escalate: "ti-alert-triangle",
  onboard: "ti-user-plus",
  rest: "ti-bed",
  quiet: "ti-clock-pause",
  slipping: "ti-trending-down",
  nutrition: "ti-salad",
  recipe: "ti-chef-hat",
};

interface DraftState {
  loading: boolean;
  drafts: string[];
  ai: boolean;
  editing: number | null;
  editText: string;
  sending: boolean;
  sent: boolean;
  error: string | null;
}

const EMPTY_DRAFT: DraftState = {
  loading: true,
  drafts: [],
  ai: false,
  editing: null,
  editText: "",
  sending: false,
  sent: false,
  error: null,
};

// Fixed order, matching the five the API is prompted to return.
const ANGLE = ["Warm check-in", "Practical", "Straight up", "Funny", "Funnier"];

export default function AttentionFeed() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/attention", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        setRows(Array.isArray(json?.rows) ? (json.rows as Row[]) : []);
      } catch {
        /* silent — this card is a convenience, never a blocker */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // "Handled" is a per-day, local-only dismissal. Nothing is written to the
  // database, so tomorrow's list is computed fresh from real activity.
  useEffect(() => {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const raw = window.localStorage.getItem("symmetry_attention_done");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { day?: string; ids?: string[] };
      if (parsed && parsed.day === today && Array.isArray(parsed.ids)) setDone(parsed.ids);
    } catch {
      /* ignore */
    }
  }, []);

  function markHandled(id: string) {
    setDone((prev) => {
      const next = prev.includes(id) ? prev : prev.concat(id);
      try {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        window.localStorage.setItem("symmetry_attention_done", JSON.stringify({ day: today, ids: next }));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function patch(id: string, p: Partial<DraftState>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || EMPTY_DRAFT), ...p } }));
  }

  async function toggleDrafts(row: Row) {
    if (open === row.id) {
      setOpen(null);
      return;
    }
    setOpen(row.id);
    fx("tap");
    // Already fetched this session — don't spend a second call on it.
    if (drafts[row.id] && !drafts[row.id].loading && drafts[row.id].drafts.length) return;

    patch(row.id, { ...EMPTY_DRAFT, loading: true });
    try {
      const res = await fetch("/api/attention-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: row.id, tag: row.tag }),
      });
      const j = await res.json();
      const list = Array.isArray(j?.drafts) ? (j.drafts as string[]) : [];
      if (!list.length) {
        patch(row.id, { loading: false, error: "Couldn't write drafts — open the thread and message them directly." });
        return;
      }
      patch(row.id, { loading: false, drafts: list, ai: j?.ai === true });
    } catch {
      patch(row.id, { loading: false, error: "Couldn't write drafts — open the thread and message them directly." });
    }
  }

  async function send(row: Row, text: string) {
    const t = (text || "").trim();
    const st = drafts[row.id];
    if (!t || (st && st.sending)) return;
    patch(row.id, { sending: true, error: null });
    try {
      await sendMessage(row.id, t);
      patch(row.id, { sending: false, sent: true, editing: null });
      fx("complete");
      // A sent message IS handling it — clear the row after a beat so he sees
      // the confirmation land first.
      window.setTimeout(() => {
        markHandled(row.id);
        setOpen(null);
      }, 1100);
    } catch {
      patch(row.id, { sending: false, error: "Didn't send — try again, or open the thread." });
      fx("error");
    }
  }

  if (!rows) return null;

  const live = rows.filter((r) => !done.includes(r.id));
  if (live.length === 0) return null;

  const urgent = live.filter((r) => r.severity === 3).length;
  const shown = expanded ? live : live.slice(0, 3);

  return (
    <div
      style={{
        background: "var(--brand-surface)",
        border: "1px solid var(--brand-border)",
        borderRadius: 18,
        boxShadow: "0 8px 26px rgba(20,30,55,0.08)",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>
          👀 Who needs you today
        </div>
        <div style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>
          {live.length} flagged{urgent > 0 ? " · " + urgent + " urgent" : ""}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.map((r) => {
          const color = SEV_COLOR[r.severity] || SEV_COLOR[1];
          const icon = TAG_ICON[r.tag] || "ti-alert-circle";
          return (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 11px",
                borderRadius: 13,
                background: "var(--brand-bg)",
                border: "1px solid var(--brand-border)",
                borderLeft: "3px solid " + color,
              }}
            >
              <i className={"ti " + icon} style={{ color: color, fontSize: 16, marginTop: 1, flex: "0 0 auto" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--brand-text)" }}>
                  {r.name}
                  <span style={{ color: color, fontWeight: 700 }}>{" · " + r.reason}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginTop: 2, lineHeight: 1.35 }}>
                  {r.detail}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 7, alignItems: "center", flexWrap: "wrap" }}>
                  {/* Drafting a message to a recipe is nonsense — and r.id is
                      "recipe:<uuid>" here, not a client id, so the draft call
                      would fail anyway. */}
                  {r.tag !== "recipe" && <button
                    onClick={() => toggleDrafts(r)}
                    data-fx-own
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: "var(--brand-primary)",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    {open === r.id ? "Hide drafts ▴" : "Draft a message ▾"}
                  </button>}
                  <Link
                    href={r.tag === "recipe" ? "/recipes" : "/clients/" + r.id}
                    style={{ fontSize: 11.5, fontWeight: 800, color: "var(--brand-text-secondary)", textDecoration: "none" }}
                  >
                    {r.tag === "recipe" ? "Review it" : "Open profile"}
                  </Link>
                  <button
                    onClick={() => markHandled(r.id)}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: "var(--brand-text-secondary)",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      marginLeft: "auto",
                    }}
                  >
                    Handled ✓
                  </button>
                </div>

                {open === r.id && <DraftPanel row={r} state={drafts[r.id] || EMPTY_DRAFT} patch={patch} send={send} />}
              </div>
            </div>
          );
        })}
      </div>

      {live.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            width: "100%",
            textAlign: "center",
            marginTop: 9,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--brand-primary)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          {expanded ? "Show less ▴" : "Show all " + live.length + " ▾"}
        </button>
      )}
    </div>
  );
}

/**
 * DraftPanel — the three one-tap messages under a row.
 *
 * A module-level component (not an inline arrow inside the map) so it keeps its
 * own identity across renders and the textarea doesn't lose focus mid-edit.
 *
 * Tapping a draft SENDS it. That's the point of the feature — but each one is
 * fully visible before the tap, and ✎ opens it for editing instead, so nothing
 * goes out that hasn't been read.
 */
function DraftPanel({
  row,
  state,
  patch,
  send,
}: {
  row: Row;
  state: DraftState;
  patch: (id: string, p: Partial<DraftState>) => void;
  send: (row: Row, text: string) => void;
}) {
  if (state.sent) {
    return (
      <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 800, color: "var(--brand-success, #3fb950)" }}>
        Sent to {row.name} ✓
      </div>
    );
  }

  if (state.loading) {
    return (
      <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--brand-text-secondary)", display: "flex", alignItems: "center", gap: 7 }}>
        <AiBadge size={20} mood="thinking" title="" />
        Writing five options for {row.name}…
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={{ marginTop: 8, fontSize: 11.5, color: "#ef4444", display: "flex", alignItems: "center", gap: 7 }}>
        <AiBadge size={20} mood="concerned" title="" />{state.error}
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 8,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        // Five options is a tall panel on a phone. Cap it and let it scroll so
        // the rows underneath stay reachable.
        maxHeight: 340,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}
    >
      {/* These are model-written messages Dustin sends AS HIMSELF, so the face
          belongs on the panel, not on the sent message. He is the author the
          moment he taps send; before that they are the app's suggestions and
          the screen should say so. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, fontWeight: 800,
                    letterSpacing: 1, color: "var(--brand-text-secondary)" }}>
        <AiBadge size={18} mood="explaining" title="" />DRAFTED FOR YOU — EDIT ANYTHING BEFORE SENDING
      </div>
      {state.drafts.map((d, i) => {
        const isEditing = state.editing === i;
        return (
          <div
            key={i}
            style={{
              border: "1px solid var(--brand-border)",
              borderRadius: 11,
              background: "var(--brand-surface)",
              padding: "8px 9px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: "var(--brand-text-secondary)",
                }}
              >
                {ANGLE[i] || "Option " + (i + 1)}
              </span>
              <button
                onClick={() => patch(row.id, { editing: isEditing ? null : i, editText: d })}
                aria-label={isEditing ? "Cancel edit" : "Edit before sending"}
                title={isEditing ? "Cancel edit" : "Edit before sending"}
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--brand-text-secondary)",
                  padding: 0,
                }}
              >
                {isEditing ? "✕" : "✎"}
              </button>
            </div>

            {isEditing ? (
              <>
                <textarea
                  value={state.editText}
                  onChange={(e) => patch(row.id, { editText: e.target.value })}
                  rows={3}
                  style={{
                    width: "100%",
                    fontSize: 12,
                    lineHeight: 1.4,
                    padding: 7,
                    borderRadius: 8,
                    border: "1px solid var(--brand-border)",
                    background: "var(--brand-bg)",
                    color: "var(--brand-text)",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
                <button
                  onClick={() => send(row, state.editText)}
                  disabled={state.sending || !state.editText.trim()}
                  data-fx-own
                  className={"cw-sweep" + (state.error ? " cw-shake" : "")}
                  style={{
                    marginTop: 6,
                    width: "100%",
                    padding: "7px",
                    borderRadius: 9,
                    border: "none",
                    background: "var(--brand-primary)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                    opacity: state.sending ? 0.6 : 1,
                  }}
                >
                  {state.sending ? "Sending…" : "Send this"}
                </button>
              </>
            ) : (
              <button
                onClick={() => send(row, d)}
                disabled={state.sending}
                data-fx-own
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: state.sending ? "default" : "pointer",
                  fontSize: 12,
                  lineHeight: 1.42,
                  color: "var(--brand-text)",
                  opacity: state.sending ? 0.5 : 1,
                }}
              >
                {d}
              </button>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 10, color: "var(--brand-text-secondary)", lineHeight: 1.35 }}>
        Tap one to send it as-is · ✎ to tweak first
        {state.ai ? "" : " · written from a template, AI is off or capped"}
      </div>
    </div>
  );
}
