"use client";

// Approve / Reject per row over schedule_change_proposals.
//
// The write itself lives in resolve_schedule_proposal() in Postgres, not here.
// There is exactly one correct shape for a move — update scheduled_date AND set
// moved_from_date, never delete-and-reinsert — and re-deriving that in every
// caller is how it drifts. This component decides; the function performs.
//
// Only `moved` and `cancelled` have a mechanical fix. The detector knows WHERE a
// session went; it does not know what should happen to an uncovered date, and
// guessing there would write programming decisions that are Dustin's. Those are
// labelled honestly as acknowledgements rather than dressed up as fixes.

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export interface Proposal {
  id: string;
  clientId: string;
  client: string;
  reason: string;
  confidence: string;
  fromDate: string;
  toDate: string | null;
  note: string | null;
  createdAt: string;
}

const REASON_COPY: Record<string, { label: string; blurb: string; mechanical: boolean }> = {
  moved: {
    label: "Moved",
    blurb: "The session shifted to a new date in Google Calendar. Approving moves the workout and records where it came from.",
    mechanical: true,
  },
  cancelled: {
    label: "Cancelled",
    blurb: "Cancelled in Google Calendar. Approving clears the workout so the date is left empty — reversible, nothing is hard-deleted.",
    mechanical: true,
  },
  uncovered: {
    label: "Uncovered",
    blurb: "An appointment exists with nothing programmed for it. Approving marks it handled — it does not write a program. That is your call.",
    mechanical: false,
  },
  orphaned: {
    label: "Orphaned",
    blurb: "A workout with no appointment behind it. Approving marks it handled; the workout is left alone.",
    mechanical: false,
  },
  retired: {
    label: "Retired series",
    blurb: "The recurring series ended in Google Calendar. Approving marks it handled; nothing is removed.",
    mechanical: false,
  },
  pattern_shift: {
    label: "Pattern shift",
    blurb: "The weekly pattern changed. Approving marks it handled — update the client's training pattern to make it stick.",
    mechanical: false,
  },
};

const fmt = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

export default function ProposalsClient({ proposals }: { proposals: Proposal[] }) {
  const [rows, setRows] = useState<Proposal[]>(proposals);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("all");
  const [err, setErr] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { c[r.reason] = (c[r.reason] || 0) + 1; });
    return c;
  }, [rows]);

  const shown = filter === "all" ? rows : rows.filter((r) => r.reason === filter);

  const resolve = async (p: Proposal, decision: "approve" | "reject") => {
    setBusy(p.id);
    setErr(null);
    try {
      const sup = createClient() as any;
      const { data, error } = await sup.rpc("resolve_schedule_proposal", {
        p_id: p.id,
        p_decision: decision,
      });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      setResults((prev) => ({
        ...prev,
        [p.id]: (r?.outcome || decision) + (r?.detail ? " — " + r.detail : ""),
      }));
      setRows((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e: any) {
      setErr(p.client + ": " + (e?.message || String(e)));
    } finally {
      setBusy(null);
    }
  };

  const autoPaired = rows.filter((r) => r.reason === "moved");

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold" style={{ color: "var(--brand-text)" }}>
          Schedule proposals
        </h1>
        <Link href="/schedule" className="text-sm" style={{ color: "var(--brand-primary)" }}>
          ← Back to schedule
        </Link>
      </div>

      <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
        The change detector reads Google Calendar every 12 hours and files these. Nothing moves
        until you approve it.
      </p>

      {err && (
        <div className="rounded-2xl p-3 text-sm"
          style={{ background: "#ef444414", color: "#ef4444", border: "1px solid #ef444440" }}>
          {err}
        </div>
      )}

      {autoPaired.length > 0 && (
        <div className="rounded-2xl p-3 text-sm"
          style={{ background: "#3b82f614", border: "1px solid #3b82f640", color: "var(--brand-text)" }}>
          <strong>{autoPaired.length} auto-paired {autoPaired.length === 1 ? "move" : "moves"}</strong>
          {" — the detector matched a cancelled date to a new one. These are the safe ones."}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}
          label={"All (" + rows.length + ")"} />
        {Object.keys(counts).sort().map((k) => (
          <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)}
            label={(REASON_COPY[k]?.label || k) + " (" + counts[k] + ")"} />
        ))}
      </div>

      {rows.length === 0 && (
        <div className="rounded-3xl p-6 text-center text-sm"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)" }}>
          Nothing waiting. The detector next runs at 11:00 / 23:00 UTC.
        </div>
      )}

      {Object.entries(results).length > 0 && (
        <div className="rounded-2xl p-3 space-y-1"
          style={{ background: "#22c55e12", border: "1px solid #22c55e40" }}>
          {Object.entries(results).map(([id, msg]) => (
            <div key={id} className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
              ✓ {msg}
            </div>
          ))}
        </div>
      )}

      {shown.map((p) => {
        const copy = REASON_COPY[p.reason] || { label: p.reason, blurb: "", mechanical: false };
        return (
          <div key={p.id} className="rounded-3xl p-4 space-y-2"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", boxShadow: "0 8px 26px rgba(20,30,55,0.08)" }}>
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div className="font-semibold" style={{ color: "var(--brand-text)" }}>{p.client}</div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-1 rounded-full"
                  style={{ background: copy.mechanical ? "#3b82f622" : "#94a3b822",
                           color: copy.mechanical ? "#3b82f6" : "#64748b" }}>
                  {copy.label.toUpperCase()}
                </span>
                <span className="text-xs px-2 py-1 rounded-full"
                  style={{ background: "var(--brand-bg)", color: "var(--brand-text-secondary)" }}>
                  {p.confidence === "pattern" ? "pattern" : "one-off"}
                </span>
              </div>
            </div>

            <div className="text-sm" style={{ color: "var(--brand-text)" }}>
              {p.toDate
                ? <>{fmt(p.fromDate)} <span style={{ color: "var(--brand-text-secondary)" }}>→</span> <strong>{fmt(p.toDate)}</strong></>
                : fmt(p.fromDate)}
            </div>

            <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
              {copy.blurb}
            </div>

            {p.note && (
              <div className="text-xs" style={{ color: "var(--brand-text-secondary)", opacity: 0.8 }}>
                {p.note}
              </div>
            )}

            {!copy.mechanical && (
              <div className="text-xs" style={{ color: "#f59e0b" }}>
                ⚠️ Approving this only clears it from the queue — no workout is created, moved or removed.
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button disabled={busy === p.id} onClick={() => resolve(p, "approve")}
                className="flex-1 text-sm font-bold py-2 rounded-xl"
                style={{ background: "#22c55e", color: "#fff", opacity: busy === p.id ? 0.6 : 1 }}>
                {copy.mechanical ? "Approve" : "Mark handled"}
              </button>
              <button disabled={busy === p.id} onClick={() => resolve(p, "reject")}
                className="flex-1 text-sm font-bold py-2 rounded-xl"
                style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="text-xs font-semibold px-3 py-1.5 rounded-full"
      style={{
        background: active ? "var(--brand-primary)" : "var(--brand-surface)",
        color: active ? "#fff" : "var(--brand-text-secondary)",
        border: "1px solid " + (active ? "var(--brand-primary)" : "var(--brand-border)"),
      }}>
      {label}
    </button>
  );
}
