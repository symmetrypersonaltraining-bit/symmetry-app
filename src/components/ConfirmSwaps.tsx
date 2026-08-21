"use client";

// Swaps Claude has picked, waiting for one tap.
//
// Dustin, 21 Aug: "can we set this up as an automatic thing by you somehow and
// you deal w these and just have me confirm swaps on my dashboard?" — and then,
// on the tile it replaces: "we can get rid of the progress card on my trainer
// dashboard, i have that in menu to get to it and from client profiles."
//
// WHY CONFIRMING IS NOT JUST AN UPDATE. Ten swaps applied straight through on
// 21 Aug because their programme days belonged to one client. Four did not:
// Sara Prince's Ball Glute Bridge sits on days ALSO scheduled for Cheyenne
// Martin, Robby Burns and Sharon Rambo. A plain update there rewrites three
// other people's programmes without a word. So Confirm calls
// apply_movement_swap(), which forks the shared day for this client first and
// only then swaps — and the row says who else is on it, so the fork is visible
// rather than magic.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Proposal {
  id: string;
  client: string;
  from_name: string;
  to_name: string;
  reason: string;
  needs_fork: boolean;
  shared_with: string | null;
}

export default function ConfirmSwaps() {
  const [rows, setRows] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const sb = createClient() as any;
    const { data } = await sb
      .from("movement_swap_proposals")
      .select("id, reason, needs_fork, shared_with, clients(name), from_exercise_id, to_exercise_id")
      .is("confirmed_at", null)
      .is("rejected_at", null);
    const raw = (data || []) as any[];
    if (!raw.length) { setRows([]); return; }

    const ids = [...new Set(raw.flatMap((r) => [r.from_exercise_id, r.to_exercise_id]))];
    const { data: ex } = await sb.from("exercises").select("id, name").in("id", ids);
    const nameOf = new Map(((ex || []) as any[]).map((e) => [e.id, e.name as string]));

    setRows(raw.map((r) => ({
      id: r.id,
      client: r.clients?.name ?? "—",
      from_name: nameOf.get(r.from_exercise_id) ?? "—",
      to_name: nameOf.get(r.to_exercise_id) ?? "—",
      reason: r.reason,
      needs_fork: !!r.needs_fork,
      shared_with: r.shared_with ?? null,
    })));
  }

  useEffect(() => { load().catch(() => setRows([])); }, []);

  async function confirm(id: string) {
    if (busy) return;
    setBusy(id); setErr(null);
    try {
      const sb = createClient() as any;
      // Checked, and the row stays put on failure. A swap that reported success
      // and did not happen would send a client to a movement they cannot do.
      const { error } = await sb.rpc("apply_movement_swap", { p_proposal_id: id });
      if (error) throw new Error(error.message);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not apply that swap — nothing changed.");
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    if (busy) return;
    setBusy(id); setErr(null);
    try {
      const sb = createClient() as any;
      const { error } = await sb.from("movement_swap_proposals").update({ rejected_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not dismiss that.");
    } finally {
      setBusy(null);
    }
  }

  if (!rows || rows.length === 0) return null;

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <i className="ti ti-arrows-exchange text-base" style={{ color: "var(--brand-primary)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--brand-text-secondary)" }}>
          CONFIRM SWAPS
        </span>
        <span className="text-xs font-bold ml-auto" style={{ color: "var(--brand-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {rows.length}
        </span>
      </div>

      {err && <p className="text-xs mb-2" style={{ color: "#dc2626" }}>{err}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--brand-border)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--brand-border)" }}>
        {rows.map((r) => (
          <div key={r.id} style={{ background: "var(--brand-surface)", padding: "11px 12px" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{r.client}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
              {r.from_name} <span style={{ color: "var(--brand-primary)", fontWeight: 700 }}>→</span>{" "}
              <span style={{ color: "var(--brand-text)", fontWeight: 500 }}>{r.to_name}</span>
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)", fontStyle: "italic" }}>{r.reason}</div>
            {r.needs_fork && r.shared_with && (
              <div className="text-xs mt-1" style={{ color: "#d97706" }}>
                Shared with {r.shared_with} — their copy stays as it is.
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => confirm(r.id)}
                disabled={busy === r.id}
                className="text-xs font-semibold rounded-lg px-3 py-1.5"
                style={{ background: "var(--brand-primary)", color: "#fff", border: "none", cursor: "pointer", opacity: busy === r.id ? 0.6 : 1 }}
              >
                {busy === r.id ? "Applying…" : "Confirm"}
              </button>
              <button
                onClick={() => reject(r.id)}
                disabled={busy === r.id}
                className="text-xs font-semibold rounded-lg px-3 py-1.5"
                style={{ background: "var(--brand-surface)", color: "var(--brand-text)", border: "1px solid var(--brand-border)", cursor: "pointer" }}
              >
                No
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
