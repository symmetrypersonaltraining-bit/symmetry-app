"use client";

// Saturday review — the full-screen queue for approving next week's focus.
//
// Until now the Sunday sweep published 35 lines of coaching copy to 35 people
// with nobody having read them. Dustin asked to see them first, on Saturday,
// "with an impossible to miss notification in my trainer app".
//
// Impossible to miss means full-screen. A badge or a banner on a dashboard he
// already skims is exactly the thing that gets skimmed, and the deadline is
// real: unreviewed by Sunday 6am and the fallback publishes them anyway,
// because a client seeing LAST week's focus is worse than one seeing an
// unreviewed line.
//
// It is dismissible — he trains on Saturdays and cannot always deal with it on
// the spot — but dismissing only silences it until the next escalation. The
// takeover re-arms at noon and 5pm, which is the cadence he asked for.
//
// Renders nothing when there is nothing to review, which is six days out of
// seven.

import { useCallback, useEffect, useState } from "react";
import { fx } from "@/lib/fx";
import AiBadge from "@/components/AiBadge";

interface Draft {
  id: string;
  client_id: string;
  name: string;
  focus: string;
  focus_ai: string | null;
  edited_at: string | null;
  approved_at: string | null;
}

// Snooze windows, in CT hours. Dismissing before noon buys until noon;
// dismissing before 5pm buys until 5pm; after that it is quiet until the next
// batch. Stored per batch week so a new Saturday always starts fresh.
const GATES = [12, 17];

function ctNow() {
  const s = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
  return new Date(s);
}

export default function SaturdayReview() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [week, setWeek] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/focus-drafts", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      const list = (j?.drafts as Draft[]) || [];
      setWeek(j?.week || "");
      setDrafts(list);

      if (!list.length) return;

      // Which escalation are we past? Dismissing records the gate it was
      // dismissed at, so the next gate re-opens it on its own.
      const hour = ctNow().getHours();
      const gate = GATES.filter((g) => hour >= g).length; // 0, 1 or 2
      let dismissedAt = -1;
      try {
        const raw = localStorage.getItem("symmetry_focus_review_" + (j?.week || ""));
        if (raw != null) dismissedAt = Number(raw);
      } catch {
        /* private mode — just show it */
      }
      if (dismissedAt < gate) setOpen(true);
    } catch {
      /* a review queue must never break the trainer app */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function dismiss() {
    try {
      const hour = ctNow().getHours();
      const gate = GATES.filter((g) => hour >= g).length;
      localStorage.setItem("symmetry_focus_review_" + week, String(gate));
    } catch {
      /* noop */
    }
    setOpen(false);
  }

  async function saveEdit(d: Draft) {
    const text = (editing[d.id] ?? "").trim();
    if (!text || text === d.focus) {
      setEditing((e) => {
        const n = { ...e };
        delete n[d.id];
        return n;
      });
      return;
    }
    setBusy(d.id);
    try {
      await fetch("/api/focus-drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, focus: text }),
      });
      setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, focus: text, edited_at: new Date().toISOString() } : x)));
      setEditing((e) => {
        const n = { ...e };
        delete n[d.id];
        return n;
      });
    } catch {
      /* keep the edit on screen */
    } finally {
      setBusy(null);
    }
  }

  async function approve(id?: string) {
    setBusy(id || "all");
    try {
      const res = await fetch("/api/focus-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      if (res.ok) {
        fx("complete");
        if (id) setDrafts((prev) => prev.filter((d) => d.id !== id));
        else {
          setDrafts([]);
          setOpen(false);
        }
      }
    } catch {
      /* noop */
    } finally {
      setBusy(null);
    }
  }

  if (!drafts.length) return null;

  // Collapsed: a persistent bar so it is still reachable after a dismissal.
  if (!open) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-3">
        <button
          onClick={() => setOpen(true)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "11px 13px",
            borderRadius: 13,
            border: "1px solid var(--brand-primary)",
            background: "color-mix(in srgb, var(--brand-primary) 10%, transparent)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <AiBadge size={22} mood="plan" title="" />
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: "var(--brand-text)" }}>
            {drafts.length} focus {drafts.length === 1 ? "line" : "lines"} waiting on you for next week
          </span>
          <i className="ti ti-chevron-right" style={{ fontSize: 16, color: "var(--brand-primary)" }} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1500, background: "var(--brand-bg)", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          background: "var(--grad-hero, var(--brand-primary))",
          color: "#fff",
          padding: "calc(18px + env(safe-area-inset-top)) 18px 16px",
          flex: "0 0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <AiBadge size={22} mood="plan" ring={false} title="" />
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, opacity: 0.85 }}>SATURDAY REVIEW</div>
        </div>
        <div style={{ fontSize: 21, fontWeight: 900, marginTop: 3 }}>Next week&apos;s focus — {drafts.length} to approve</div>
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 5, lineHeight: 1.45 }}>
          Written from each client&apos;s real numbers. Tap any line to edit it. Anything you don&apos;t get to publishes
          on its own Sunday 6am.
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "12px 14px 8px" }}>
        {drafts.map((d) => {
          const isEditing = editing[d.id] != null;
          return (
            <div
              key={d.id}
              style={{
                background: "var(--brand-surface)",
                border: "1px solid var(--brand-border)",
                borderRadius: 14,
                padding: 13,
                marginBottom: 9,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--brand-text)", flex: 1 }}>{d.name}</span>
                {d.edited_at && (
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--brand-primary)" }}>EDITED</span>
                )}
              </div>

              {isEditing ? (
                <>
                  <textarea
                    value={editing[d.id]}
                    onChange={(e) => setEditing((s) => ({ ...s, [d.id]: e.target.value }))}
                    rows={3}
                    maxLength={200}
                    autoFocus
                    style={{
                      width: "100%",
                      fontSize: 13,
                      lineHeight: 1.5,
                      padding: "9px 11px",
                      borderRadius: 10,
                      border: "1px solid var(--brand-primary)",
                      background: "var(--brand-card, var(--brand-bg))",
                      color: "var(--brand-text)",
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
                    <button
                      onClick={() => saveEdit(d)}
                      disabled={busy === d.id}
                      style={{ flex: 1, padding: 9, borderRadius: 10, border: "none", background: "var(--brand-primary)", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
                    >
                      {busy === d.id ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() =>
                        setEditing((e) => {
                          const n = { ...e };
                          delete n[d.id];
                          return n;
                        })
                      }
                      style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "transparent", color: "var(--brand-text-secondary)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditing((s) => ({ ...s, [d.id]: d.focus }))}
                    style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "text", fontSize: 13, lineHeight: 1.5, color: "var(--brand-text)", fontFamily: "inherit" }}
                  >
                    {d.focus}
                  </button>
                  <button
                    onClick={() => approve(d.id)}
                    disabled={busy === d.id}
                    style={{ marginTop: 9, padding: "7px 13px", borderRadius: 999, border: "1px solid var(--brand-primary)", background: "transparent", color: "var(--brand-primary)", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}
                  >
                    {busy === d.id ? "…" : "Approve this one"}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ flex: "0 0 auto", padding: "10px 14px calc(14px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--brand-border)" }}>
        <button
          onClick={() => approve()}
          disabled={busy === "all"}
          style={{ width: "100%", padding: 14, borderRadius: 13, border: "none", background: "var(--brand-primary)", color: "#fff", fontSize: 14.5, fontWeight: 800, cursor: "pointer", opacity: busy === "all" ? 0.6 : 1 }}
        >
          {busy === "all" ? "Publishing…" : `✅ Approve all ${drafts.length}`}
        </button>
        <button
          onClick={dismiss}
          style={{ width: "100%", marginTop: 8, padding: 11, borderRadius: 13, border: "1px solid var(--brand-border)", background: "transparent", color: "var(--brand-text-secondary)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
        >
          Not now — remind me later today
        </button>
      </div>
    </div>
  );
}
