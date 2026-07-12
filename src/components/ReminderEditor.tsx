"use client";

// Payment reminder editor — trainer-only surface (payments page).
// Every draft is verified via reminder-calc; blocking flags disable Approve.
// NOTHING sends externally: Approve publishes an in-app banner to the client.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { calcReminder, nextDueDate, previousDueDate, reminderSendDate, Cadence } from "@/lib/reminder-calc";

interface Rem {
  id: string;
  client_id: string;
  due_date: string;
  amount_due: number;
  billing_credits: number | null;
  sms_message: string | null;
  notification_status: string;
  name: string;
  fee: number | null;
  sessionRate: number | null;
  cadence: Cadence | null;
  lastPay: number | null;
  cancelledFull: number;
  cancelledHalf: number;
  lastApprovedOn: string | null;
  flatBilling: boolean;
}

interface Edit {
  amount: string;
  due: string;
  manual: string;
  note: string;
  override: boolean;
}

export default function ReminderEditor() {
  const [rows, setRows] = useState<Rem[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const sup = createClient() as any;
      const { data: rems } = await sup
        .from("payment_reminders")
        .select("id, client_id, due_date, amount_due, billing_credits, sms_message, notification_status")
        .in("notification_status", ["pending", "sent"])
        .lte("due_date", new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
        .order("due_date");
      const { data: clients } = await sup
        .from("clients")
        .select("id, name, current_fees, session_rate, flat_billing");
      const { data: pays } = await sup
        .from("calendar_payments")
        .select("client_id, amount, payment_date, cadence")
        .order("payment_date", { ascending: false })
        .limit(400);
      const { data: appr } = await sup
        .from("payment_reminders")
        .select("client_id, approved_at, due_date")
        .not("approved_at", "is", null);
      const { data: cancels } = await sup
        .from("appointments")
        .select("client_id, scheduled_at, status")
        .ilike("status", "cancelled%")
        .gte("scheduled_at", new Date(Date.now() - 110 * 86400000).toISOString());
      const todayCT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const byClient: Record<string, any> = {};
      (clients || []).forEach((c: any) => { byClient[c.id] = c; });
      const lastPayOf = (cid: string) => {
        const p = (pays || []).find((x: any) => x.client_id === cid && x.payment_date <= todayCT);
        return p ? Number(p.amount) : null;
      };
      const cadenceOf = (cid: string): Cadence | null => {
        const p = (pays || []).find((x: any) => x.client_id === cid && x.cadence);
        return p ? (p.cadence as Cadence) : null;
      };
      const out: Rem[] = (rems || []).map((r: any) => {
        const c = byClient[r.client_id] || {};
        const cad = cadenceOf(r.client_id);
        const la = (appr || [])
          .filter((a: any) => a.client_id === r.client_id && a.due_date < r.due_date && a.approved_at)
          .map((a: any) => new Date(a.approved_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
          .sort()
          .pop() || null;
        // Send-anchored cycle: window closes 7 days before due, so cancels in the
        // final week roll to the next cycle. Start = previous cycle's send date
        // (or the prior approval date if later); end = this cycle's send date.
        const baseStart = reminderSendDate(previousDueDate(r.due_date, cad));
        const start = la && la < r.due_date ? la : baseStart;
        const end = reminderSendDate(r.due_date);
        let full = 0, half = 0;
        (cancels || []).forEach((a: any) => {
          if (a.client_id !== r.client_id) return;
          const d = new Date(a.scheduled_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
          if (d > start && d <= end) {
            if (a.status === "cancelled_half") half += 1; else full += 1;
          }
        });
        return {
          id: r.id, client_id: r.client_id, due_date: r.due_date,
          amount_due: Number(r.amount_due), billing_credits: r.billing_credits == null ? null : Number(r.billing_credits),
          sms_message: r.sms_message, notification_status: r.notification_status,
          name: c.name || "?", fee: c.current_fees == null ? null : Number(c.current_fees),
          sessionRate: c.session_rate == null ? null : Number(c.session_rate),
          cadence: cad, lastPay: lastPayOf(r.client_id), cancelledFull: full, cancelledHalf: half,
          lastApprovedOn: la, flatBilling: c.flat_billing === true,
        };
      });
      setRows(out);
      const e: Record<string, Edit> = {};
      out.forEach((r) => {
        e[r.id] = { amount: String(r.amount_due), due: r.due_date, manual: "", note: r.sms_message || "", override: false };
      });
      setEdits(e);
      setLoaded(true);
    } catch (ex: any) {
      setErr(String(ex?.message || ex));
      setLoaded(true);
    }
  };

  useEffect(() => { load(); }, []);

  const setEdit = (id: string, patch: Partial<Edit>) =>
    setEdits((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const save = async (r: Rem, publish: boolean) => {
    const e = edits[r.id];
    setBusy(r.id);
    try {
      const sup = createClient() as any;
      const calc = calcReminder({
        fee: r.fee, sessionRate: r.sessionRate, cadence: r.cadence, dueDate: e.due,
        cancelledFull: r.cancelledFull, cancelledHalf: r.cancelledHalf,
        manualCredits: parseFloat(e.manual) || 0, lastPaymentAmount: r.lastPay,
        lastCycleApprovedOn: r.lastApprovedOn, flatBilling: r.flatBilling,
        draftAmount: parseFloat(e.amount) || 0, override: e.override,
      });
      const patch: any = {
        amount_due: parseFloat(e.amount) || 0,
        due_date: e.due,
        billing_credits: calc.totalCredits,
        sms_message: e.note || null,
      };
      if (publish) {
        patch.notification_status = "sent";
        patch.approved_at = new Date().toISOString();
      }
      await sup.from("payment_reminders").update(patch).eq("id", r.id);
      await load();
    } finally { setBusy(null); }
  };

  const confirmPaid = async (r: Rem) => {
    setBusy(r.id);
    try {
      const sup = createClient() as any;
      await sup.from("payment_reminders").update({
        notification_status: "paid",
        paid_confirmed_at: new Date().toISOString(),
      }).eq("id", r.id);
      if (r.fee != null) {
        await sup.from("payment_reminders").insert({
          client_id: r.client_id,
          due_date: nextDueDate(r.due_date, r.cadence),
          amount_due: r.fee,
          notification_status: "pending",
        });
      }
      await load();
    } finally { setBusy(null); }
  };

  if (!loaded) return null;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-3">
      <h2 className="text-lg font-bold" style={{ color: "var(--brand-text)" }}>Payment reminders</h2>
      {err && <div className="text-sm" style={{ color: "#ef4444" }}>{"Loading error: " + err}</div>}
      {rows.length === 0 && !err && (
        <div className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>No open reminders.</div>
      )}
      {rows.map((r) => {
        const e = edits[r.id];
        if (!e) return null;
        const calc = calcReminder({
          fee: r.fee, sessionRate: r.sessionRate, cadence: r.cadence, dueDate: e.due,
          cancelledFull: r.cancelledFull, cancelledHalf: r.cancelledHalf,
          manualCredits: parseFloat(e.manual) || 0, lastPaymentAmount: r.lastPay,
        lastCycleApprovedOn: r.lastApprovedOn, flatBilling: r.flatBilling,
          draftAmount: parseFloat(e.amount) || 0, override: e.override,
        });
        const blocked = calc.blocking.length > 0;
        const sent = r.notification_status === "sent";
        return (
          <div key={r.id} className="rounded-3xl p-4 space-y-2"
            style={{ background: "var(--brand-surface)", border: "1px solid " + (blocked ? "#ef4444" : "var(--brand-border)"), boxShadow: "0 8px 26px rgba(20,30,55,0.08)" }}>
            <div className="flex justify-between items-center">
              <div className="font-semibold" style={{ color: "var(--brand-text)" }}>{r.name}</div>
              <span key={sent ? "sent" : blocked ? "blk" : "rdy"} className="text-xs font-bold px-2 py-1 rounded-full cw-pop"
                style={{ background: sent ? "#f59e0b22" : blocked ? "#ef444422" : "#22c55e22", color: sent ? "#f59e0b" : blocked ? "#ef4444" : "#22c55e" }}>
                {sent ? "AWAITING PAYMENT" : blocked ? "BLOCKED" : "READY"}
              </span>
            </div>
            <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
              {"Fee $" + (r.fee ?? "?") + (r.cadence ? " / " + r.cadence : "") + " · rate $" + (r.sessionRate ?? "?") + "/session · billing cycle " + calc.cycleStart + " → " + calc.cycleEnd + " (reminder sends " + calc.cycleEnd + ") · due " + r.due_date}
            </div>
            <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
              {"Cancelled in cycle: " + r.cancelledFull + " full, " + r.cancelledHalf + " half → auto credit $" + calc.autoCredits + " · calculated: $" + calc.expected}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Amount
                <input type="number" step="0.01" value={e.amount} disabled={sent}
                  onChange={(ev) => setEdit(r.id, { amount: ev.target.value })}
                  className="w-full rounded-xl p-2 mt-1 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </label>
              <label className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Due date
                <input type="date" value={e.due} disabled={sent}
                  onChange={(ev) => setEdit(r.id, { due: ev.target.value })}
                  className="w-full rounded-xl p-2 mt-1 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </label>
            </div>
            {!sent && (
              <label className="text-xs block" style={{ color: "var(--brand-text-secondary)" }}>Extra credit (manual $)
                <input type="number" step="0.01" value={e.manual} placeholder="0"
                  onChange={(ev) => setEdit(r.id, { manual: ev.target.value })}
                  className="w-full rounded-xl p-2 mt-1 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </label>
            )}
            {!sent && (
              <label className="text-xs block" style={{ color: "var(--brand-text-secondary)" }}>Message shown to client
                <textarea value={e.note} rows={2}
                  onChange={(ev) => setEdit(r.id, { note: ev.target.value })}
                  className="w-full rounded-xl p-2 mt-1 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </label>
            )}
            {calc.blocking.map((b) => (
              <div key={b} className="text-xs font-semibold" style={{ color: "#ef4444" }}>{"🔴 " + b}</div>
            ))}
            {calc.warnings.map((w) => (
              <div key={w} className="text-xs" style={{ color: "#f59e0b" }}>{"⚠️ " + w}</div>
            ))}
            {!sent && (
              <div className="flex gap-2">
                <button onClick={() => setEdit(r.id, { amount: String(calc.expected) })}
                  className="text-xs font-bold px-3 py-2 rounded-xl"
                  style={{ background: "var(--brand-primary)", color: "#fff" }}>
                  {"Use calculated $" + calc.expected}
                </button>
                <label className="text-xs flex items-center gap-1" style={{ color: "var(--brand-text-secondary)" }}>
                  <input type="checkbox" checked={e.override} onChange={(ev) => setEdit(r.id, { override: ev.target.checked })} />
                  Override calc
                </label>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              {!sent && (
                <button disabled={busy === r.id} onClick={() => save(r, false)}
                  className="flex-1 text-sm font-bold py-2 rounded-xl"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                  Save
                </button>
              )}
              {!sent && (
                <button disabled={blocked || busy === r.id} onClick={() => save(r, true)}
                  className="flex-1 text-sm font-bold py-2 rounded-xl"
                  style={{ background: blocked ? "var(--brand-border)" : "#22c55e", color: "#fff", opacity: blocked ? 0.6 : 1 }}>
                  Approve &amp; notify
                </button>
              )}
              {sent && (
                <button disabled={busy === r.id} onClick={() => confirmPaid(r)}
                  className="flex-1 text-sm font-bold py-2 rounded-xl"
                  style={{ background: "#22c55e", color: "#fff" }}>
                  {"Confirm paid $" + e.amount}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
