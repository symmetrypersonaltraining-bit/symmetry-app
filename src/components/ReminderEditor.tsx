"use client";

// Payment reminder editor — trainer-only surface (payments page).
//
// THE RULE (Dustin, 2026-07-31): amount = sessions_trained x session_rate.
// "8 sessions at $75 = $600, plain and simple."
//
// Sessions trained = appointments with status='scheduled' inside the cycle
// (blue in Google Calendar). Cancelled sessions (orange) are shown so the shape
// of the cycle is visible, but they are NOT billed and NOT deducted — there is
// nothing to deduct them from.
//
// Every draft is verified via reminder-calc; blocking flags disable Approve.
// NOTHING sends externally until Approve: that publishes an in-app banner to
// the client and emails them.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  calcReminder,
  nextDueDate,
  previousDueDate,
  reminderSendDate,
  Cadence,
  BillingType,
} from "@/lib/reminder-calc";

type DatedSession = { date: string; type: "trained" | "full" | "half" };

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
  billingType: BillingType;
  sessionsTrained: number;
  trainedDates: string[];
  cancelledFull: number;
  cancelledHalf: number;
  cancelledDates: DatedSession[];
  lastApprovedOn: string | null;
  approved_at: string | null;
  /** true when credit_details says the cycle has not closed yet */
  provisional: boolean;
  /** set when the stored credit_details disagrees with what the calendar says now */
  staleNote: string | null;
}

interface Edit {
  amount: string;
  due: string;
  /** session count, editable; recomputes amount as count x rate */
  count: string;
  note: string;
  /** true when Dustin typed an amount directly, so the count no longer drives it */
  amountOverridesCount: boolean;
  override: boolean;
}

const fmtDay = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

const round2 = (n: number) => Math.round(n * 100) / 100;

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
        .select("id, client_id, due_date, amount_due, billing_credits, sms_message, notification_status, approved_at, credit_details")
        .in("notification_status", ["pending", "sent"])
        .lte("due_date", new Date(Date.now() + 45 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
        .order("due_date");
      const { data: clients } = await sup
        .from("clients")
        .select("id, name, current_fees, session_rate, billing_type, billing_cadence, flat_billing")
        .is("archived_at", null);
      const { data: pays } = await sup
        .from("calendar_payments")
        .select("client_id, amount, payment_date, cadence")
        .order("payment_date", { ascending: false })
        .limit(400);
      const { data: appr } = await sup
        .from("payment_reminders")
        .select("client_id, approved_at, due_date")
        .not("approved_at", "is", null);
      // BOTH scheduled and cancelled appointments now load. The old
      // .ilike("status","cancelled%") filter is gone: under the sessions-trained
      // rule the scheduled rows ARE the bill, so dropping them dropped the
      // arithmetic. Look-back widened 110 -> 200 days so a past-due QUARTERLY
      // cycle (Jennifer Day) is not truncated and silently under-counted.
      const { data: appts } = await sup
        .from("appointments")
        .select("client_id, scheduled_at, status")
        .gte("scheduled_at", new Date(Date.now() - 200 * 86400000).toISOString());
      const byClient: Record<string, any> = {};
      (clients || []).forEach((c: any) => { byClient[c.id] = c; });
      const calendarCadenceOf = (cid: string): Cadence | null => {
        const p = (pays || []).find((x: any) => x.client_id === cid && x.cadence);
        return p ? (p.cadence as Cadence) : null;
      };
      const out: Rem[] = (rems || [])
        .map((r: any) => {
          const c = byClient[r.client_id] || {};
          const billingType: BillingType =
            c.billing_type === "flat" || c.billing_type === "none" || c.billing_type === "per_session"
              ? c.billing_type
              : (c.flat_billing === true ? "flat" : "per_session");
          // clients.billing_cadence is authoritative; the calendar is the fallback.
          const cad: Cadence | null = (c.billing_cadence as Cadence) || calendarCadenceOf(r.client_id);
          const la = (appr || [])
            .filter((a: any) => a.client_id === r.client_id && a.due_date < r.due_date && a.approved_at)
            .map((a: any) => new Date(a.approved_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
            .sort()
            .pop() || null;
          // Send-anchored cycle: window closes 7 days before due, so sessions in
          // the final week roll to the next cycle. It OPENS at the previous
          // cycle's send date so the cycles tile exactly — see the note in
          // reminder-calc.ts on why the prior-approval date must not move the
          // start (it dropped real sessions out of every cycle).
          const start = reminderSendDate(previousDueDate(r.due_date, cad));
          const end = reminderSendDate(r.due_date);

          let trained = 0, full = 0, half = 0;
          const trainedDates: string[] = [];
          const cancelledDates: DatedSession[] = [];
          (appts || []).forEach((a: any) => {
            if (a.client_id !== r.client_id) return;
            const d = new Date(a.scheduled_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
            if (!(d > start && d <= end)) return;
            const st = String(a.status || "");
            if (st === "scheduled") { trained += 1; trainedDates.push(d); }
            else if (st === "cancelled_half") { half += 1; cancelledDates.push({ date: d, type: "half" }); }
            else if (st.startsWith("cancelled")) { full += 1; cancelledDates.push({ date: d, type: "full" }); }
          });
          trainedDates.sort();
          cancelledDates.sort((x, y) => x.date.localeCompare(y.date));

          // Prefer the stored credit_details when it is the new shape — the sync
          // recalculates it against fresh appointments and it is the row of
          // record. Fall back to what we just derived otherwise. If the two
          // disagree, say so rather than silently picking one.
          const cd = r.credit_details;
          const storedIsNewShape = cd && typeof cd === "object" && cd.basis === "sessions_trained";
          let sessionsTrained = trained;
          let outTrainedDates = trainedDates;
          let staleNote: string | null = null;
          if (storedIsNewShape) {
            const storedCount = Number(cd.sessions_trained ?? 0);
            sessionsTrained = storedCount;
            if (Array.isArray(cd.dates_trained) && cd.dates_trained.length) {
              outTrainedDates = cd.dates_trained.map((d: string) =>
                d.length === 5 ? r.due_date.slice(0, 4) + "-" + d : d
              );
            }
            if (storedCount !== trained) {
              staleNote =
                "Stored count " + storedCount + " but the calendar now shows " + trained +
                " — stored value recalculated " + (cd.recalculated_at || "earlier") +
                ". Edit the count to use the calendar figure.";
            }
          }

          return {
            id: r.id,
            client_id: r.client_id,
            due_date: r.due_date,
            amount_due: Number(r.amount_due),
            billing_credits: r.billing_credits == null ? null : Number(r.billing_credits),
            sms_message: r.sms_message,
            notification_status: r.notification_status,
            name: c.name || "?",
            fee: c.current_fees == null ? null : Number(c.current_fees),
            sessionRate: c.session_rate == null ? null : Number(c.session_rate),
            cadence: cad,
            billingType,
            sessionsTrained,
            trainedDates: outTrainedDates,
            cancelledFull: full,
            cancelledHalf: half,
            cancelledDates,
            lastApprovedOn: la,
            approved_at: r.approved_at || null,
            provisional: !!(storedIsNewShape && cd.provisional),
            staleNote,
          } as Rem;
        })
        // billing_type='none' clients pay together with a partner and are never
        // billed individually. Never generate, never show.
        .filter((r: Rem) => r.billingType !== "none");

      setRows(out);
      const e: Record<string, Edit> = {};
      out.forEach((r) => {
        e[r.id] = {
          amount: String(r.amount_due),
          due: r.due_date,
          count: String(r.sessionsTrained),
          note: r.sms_message || "",
          amountOverridesCount: false,
          override: false,
        };
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

  /** Editing the count recomputes the amount as count x rate. */
  const setCount = (r: Rem, raw: string) => {
    const n = Math.max(0, parseInt(raw, 10) || 0);
    const patch: Partial<Edit> = { count: raw };
    if (r.billingType === "per_session" && r.sessionRate != null) {
      patch.amount = String(round2(n * r.sessionRate));
      patch.amountOverridesCount = false;
    }
    setEdit(r.id, patch);
  };

  /** Typing an amount directly wins, and flags that the count no longer drives it. */
  const setAmount = (r: Rem, raw: string) => {
    const expected =
      r.billingType === "per_session" && r.sessionRate != null
        ? round2((parseInt(edits[r.id]?.count ?? "0", 10) || 0) * r.sessionRate)
        : r.fee ?? 0;
    setEdit(r.id, {
      amount: raw,
      amountOverridesCount: Math.abs((parseFloat(raw) || 0) - expected) > 0.009,
    });
  };

  const resetAmountToCount = (r: Rem) => {
    const n = parseInt(edits[r.id]?.count ?? "0", 10) || 0;
    const amt = r.billingType === "flat" ? (r.fee ?? 0) : round2(n * (r.sessionRate ?? 0));
    setEdit(r.id, { amount: String(amt), amountOverridesCount: false, override: false });
  };

  const calcFor = (r: Rem, e: Edit) =>
    calcReminder({
      fee: r.fee,
      sessionRate: r.sessionRate,
      cadence: r.cadence,
      dueDate: e.due,
      sessionsTrained: parseInt(e.count, 10) || 0,
      billingType: r.billingType,
      cancelledFull: r.cancelledFull,
      cancelledHalf: r.cancelledHalf,
      lastCycleApprovedOn: r.lastApprovedOn,
      draftAmount: parseFloat(e.amount) || 0,
      override: e.override || e.amountOverridesCount,
    });

  const save = async (r: Rem, publish: boolean) => {
    const e = edits[r.id];
    setBusy(r.id);
    try {
      const sup = createClient() as any;
      const calc = calcFor(r, e);
      const count = parseInt(e.count, 10) || 0;
      const patch: any = {
        amount_due: parseFloat(e.amount) || 0,
        due_date: e.due,
        // Cancellations are never deducted, so there are no credits to carry.
        billing_credits: 0,
        sms_message: e.note || null,
        credit_details: {
          basis: "sessions_trained",
          cycle: calc.cycleStart + " to " + calc.cycleEnd,
          rate: r.sessionRate == null ? null : String(r.sessionRate),
          billing_type: r.billingType,
          sessions_trained: count,
          dates_trained: r.trainedDates,
          sessions_cancelled: r.cancelledFull + r.cancelledHalf,
          dates_cancelled: r.cancelledDates.map((c) => c.date),
          provisional: r.provisional,
          needs_rate: r.billingType === "per_session" && r.sessionRate == null,
          count_overridden: e.amountOverridesCount,
          recalculated_at: new Date().toISOString(),
        },
      };
      if (publish) {
        patch.notification_status = "sent";
        patch.approved_at = new Date().toISOString();
      }
      await sup.from("payment_reminders").update(patch).eq("id", r.id);
      if (publish) {
        // Auto-email the client the reminder on approval. Best-effort: the approval
        // + in-app banner already committed above, so an email failure never blocks
        // the approval — we just surface a notice. The send route stamps email_sent_at.
        try {
          const res = await fetch("/api/reminders/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reminderId: r.id }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({} as any));
            alert("Reminder approved and the in-app banner is showing, but the email didn't send: " + (j.error || ("HTTP " + res.status)));
          }
        } catch (sendErr: any) {
          alert("Reminder approved and the in-app banner is showing, but the email didn't send: " + (sendErr?.message || "network error"));
        }
      }
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
      // Notify the client their payment was received (feedback b0ee64d6)
      await sup.from("client_notifications").insert({
        client_id: r.client_id,
        type: "payment_received",
        title: "Payment received ✓",
        body: "Thanks! We've received your payment" + (r.amount_due != null ? " of $" + Number(r.amount_due).toFixed(2) : "") + ".",
      });
      // Roll forward. Seed 0, NOT the fee or the previous amount: under the
      // sessions-trained rule the next cycle's amount is not knowable yet — it
      // is whatever they train. The editor computes it at send time.
      await sup.from("payment_reminders").insert({
        client_id: r.client_id,
        due_date: nextDueDate(r.due_date, r.cadence),
        amount_due: 0,
        notification_status: "pending",
      });
      await load();
    } finally { setBusy(null); }
  };

  const deleteReminder = async (r: Rem) => {
    if (!confirm(`Delete this payment reminder for ${r.name} (due ${r.due_date}, $${r.amount_due})?\n\nThis removes the reminder only — it does not affect anything already sent to the client. This can't be undone.`)) return;
    setBusy(r.id);
    try {
      const sup = createClient() as any;
      await sup.from("payment_reminders").delete().eq("id", r.id);
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
        const calc = calcFor(r, e);
        const blocked = calc.blocking.length > 0;
        const sent = r.notification_status === "sent";
        const perSession = r.billingType === "per_session";
        return (
          <div key={r.id} className="rounded-3xl p-4 space-y-2"
            style={{ background: "var(--brand-surface)", border: "1px solid " + (blocked ? "#ef4444" : "var(--brand-border)"), boxShadow: "0 8px 26px rgba(20,30,55,0.08)" }}>
            <div className="flex justify-between items-center">
              <div className="font-semibold" style={{ color: "var(--brand-text)" }}>{r.name}</div>
              <div className="flex items-center gap-2">
                {r.provisional && !sent && (
                  <span className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{ background: "#3b82f622", color: "#3b82f6" }}>
                    {"PROVISIONAL — cycle ends " + fmtDay(calc.cycleEnd)}
                  </span>
                )}
                <span key={sent ? "sent" : blocked ? "blk" : "rdy"} className="text-xs font-bold px-2 py-1 rounded-full cw-pop"
                  style={{ background: sent ? "#f59e0b22" : blocked ? "#ef444422" : "#22c55e22", color: sent ? "#f59e0b" : blocked ? "#ef4444" : "#22c55e" }}>
                  {sent ? "AWAITING PAYMENT" : blocked ? "BLOCKED" : "READY"}
                </span>
                <button onClick={() => deleteReminder(r)} disabled={busy === r.id} aria-label="Delete reminder"
                  title="Delete this reminder"
                  className="flex items-center justify-center rounded-full"
                  style={{ width: 28, height: 28, background: "#ef444418", color: "#ef4444", border: "1px solid #ef444440", cursor: "pointer" }}>
                  <i className="ti ti-trash text-sm" />
                </button>
              </div>
            </div>

            {/* THE ITEMISATION — what this amount is made of. */}
            <div className="rounded-2xl p-3 space-y-1" style={{ background: "var(--brand-bg)" }}>
              <div className="text-xs font-semibold" style={{ color: "var(--brand-text)" }}>
                {perSession
                  ? r.sessionsTrained + " sessions × $" + (r.sessionRate ?? "?") + " = $" + calc.expected
                  : "Flat " + (r.cadence || "monthly") + " fee = $" + calc.expected}
              </div>
              <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                {"Billing cycle " + calc.cycleStart + " → " + calc.cycleEnd + " · due " + r.due_date}
              </div>
              {perSession && r.trainedDates.length > 0 && (
                <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                  {"Trained: " + r.trainedDates.map(fmtDay).join(", ")}
                </div>
              )}
              {perSession && r.trainedDates.length === 0 && (
                <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                  No sessions trained in this cycle.
                </div>
              )}
              {r.cancelledDates.length > 0 && (
                <div className="text-xs" style={{ color: "var(--brand-text-secondary)", opacity: 0.6 }}>
                  {"Cancelled (" + r.cancelledDates.length + "): " +
                    r.cancelledDates.map((c) => fmtDay(c.date) + (c.type === "half" ? " (½)" : "")).join(", ") +
                    " — not billed, not deducted"}
                </div>
              )}
            </div>

            {r.staleNote && (
              <div className="text-xs" style={{ color: "#f59e0b" }}>{"⚠️ " + r.staleNote}</div>
            )}

            {sent && (
              <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                {"Notified (in-app banner) " + (r.approved_at ? new Date(r.approved_at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "— publish time not recorded")}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Sessions
                <input type="number" step="1" min="0" value={e.count} disabled={sent || !perSession}
                  onChange={(ev) => setCount(r, ev.target.value)}
                  className="w-full rounded-xl p-2 mt-1 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", opacity: perSession ? 1 : 0.5 }} />
              </label>
              <label className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Amount
                <input type="number" step="0.01" value={e.amount} disabled={sent}
                  onChange={(ev) => setAmount(r, ev.target.value)}
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

            {!sent && e.amountOverridesCount && (
              <div className="flex items-center justify-between text-xs" style={{ color: "#f59e0b" }}>
                <span>{"Amount typed directly — session count no longer drives it"}</span>
                <button onClick={() => resetAmountToCount(r)}
                  className="font-bold px-2 py-1 rounded-lg"
                  style={{ background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b40" }}>
                  Reset
                </button>
              </div>
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
                <button onClick={() => setEdit(r.id, { amount: String(calc.expected), amountOverridesCount: false })}
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
