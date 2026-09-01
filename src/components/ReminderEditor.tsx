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
import { fetchAllRows } from "@/lib/fetchAllRows";
import {
  calcReminder,
  resolveBillingType,
  nextDueDate,
  previousDueDate,
  reminderSendDate,
  Cadence,
  BillingType,
  billedRateOf,
  describeAdjustment,
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
  /** The rate THIS reminder was billed at. Frozen once sent; see reminder-calc.ts. */
  billedRate: number | null;
  /** clients.current_fees — the monthly/cycle rate the deduction comes off. */
  monthlyRate: number | null;
  expectedSessions: number | null;
  /** Remote sessions run at half rate while Dustin was away. Manual. */
  halfPriceSessions: number;
  cadence: Cadence | null;
  billingType: BillingType;
  previousDueDateActual: string | null;
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
  /** Remote sessions at half rate. Blank means "unchanged from the row". */
  halfPrice: string;
  /** true when Dustin typed an amount directly, so the count no longer drives it */
  amountOverridesCount: boolean;
  override: boolean;
}

const fmtDay = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How far ahead a reminder is considered live. The appointment read below is
 * bounded by this SAME constant rather than a second number, because the safety
 * of that bound is derived from this one — see the note at the read.
 */
const REMINDER_HORIZON_DAYS = 45;

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
        .select("id, client_id, due_date, amount_due, billing_credits, sms_message, notification_status, approved_at, credit_details, half_price_sessions")
        .in("notification_status", ["pending", "sent"])
        .lte("due_date", new Date(Date.now() + REMINDER_HORIZON_DAYS * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
        .order("due_date");
      const { data: clients } = await sup
        .from("clients")
        .select("id, name, current_fees, session_rate, billing_type, billing_cadence, flat_billing, expected_sessions_per_cycle")
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
      // Every reminder's due date, approved or not, so a cycle can start where
      // the last one actually ended instead of where subtracting a month from
      // this one happens to land. See previousDueDateActual in reminder-calc.
      const allDue = await fetchAllRows<{ client_id: string; due_date: string }>(
        () => sup.from("payment_reminders").select("client_id, due_date"),
        { label: "payment_reminders.due_date", orderedBy: "due_date" },
      );
      // BOTH scheduled and cancelled appointments now load. The old
      // .ilike("status","cancelled%") filter is gone: under the sessions-trained
      // rule the scheduled rows ARE the bill, so dropping them dropped the
      // arithmetic. Look-back widened 110 -> 200 days so a past-due QUARTERLY
      // cycle (Jennifer Day) is not truncated and silently under-counted.
      // SCOPED TO THE CLIENTS ON SCREEN, ORDERED, AND WITH AN EXPLICIT LIMIT.
      //
      // This fetched EVERY appointment in a 200-day window with no .in(), no
      // .order() and no .limit(). PostgREST caps an unbounded select at 1000
      // rows; there are 4,859 in that window. So ~80% of appointments never
      // reached the arithmetic, and with no ORDER BY the 1000 that did arrive
      // were whatever physical order the heap happened to return — meaning
      // which clients got billed correctly was luck, and it could change
      // between page loads.
      //
      // Found from Sharon Rambo's reminder reading "0 sessions trained in this
      // cycle" while her calendar showed three inside the window. Silent
      // under-billing: the screen looked fine and the number was simply too
      // small.
      //
      // Scoping to the client_ids that actually have a live reminder narrows it
      // and is correct — but the claim that followed here, that it left "a
      // couple of hundred" rows and the limit was only a backstop, was wrong by
      // a factor of twenty. See the note below the id list.
      const reminderClientIds = Array.from(
        new Set((rems || []).map((r: any) => r.client_id).filter(Boolean)),
      );
      //
      // 24 AUG — AND IT WAS STILL TRUNCATING. Scoping to reminder clients did
      // not take this to "a couple of hundred": measured against the live
      // database it is 3,977 rows, because the window has a floor and no
      // ceiling, so it drags in every future booking out to Aug 2028 as well.
      // `.limit(5000)` bounded nothing — PostgREST caps a response at 1,000
      // whatever the limit says — so the read stopped dead at 19 Dec 2026.
      //
      // Today's cycles sort before that cut and so they still arrive, which is
      // the only reason nobody has been under-billed a second time. That is
      // luck, not design: the cut walks backwards every time he programmes
      // further ahead, and it lands on the current cycle without a word.
      //
      // 26 AUG — AND IT WAS BOUNDED AT ONE END ONLY, WHICH IS WHY THE PAGE
      // TOOK MINUTES. Dustin: "payments overdue takes me to pmts but takes
      // minutes to load."
      //
      // The window had a floor and no ceiling, so it dragged in every future
      // booking to Aug 2028: 3,736 rows, four sequential round trips, on a
      // phone, before the billing screen would draw. Every one of those rows
      // past the horizon was downloaded and then ignored.
      //
      // A ceiling is provably safe here, and the proof is short. The reminder
      // query above only takes rows with due_date <= today + 45. A cycle window
      // ENDS at reminderSendDate(due_date), which is due_date - 7. So no cycle
      // this component can compute reaches beyond today + 38, and no
      // appointment after that can be counted by anything on this screen.
      // APPT_HORIZON_DAYS is deliberately the same 45 rather than 38: it is
      // tied to the reminder horizon it is derived from, so the two cannot
      // drift apart, and it leaves a week of slack besides.
      //
      // 3,736 rows becomes 608. Four round trips becomes one. Still paged,
      // because a bound is not a guarantee — the roster grows, and fetchAllRows
      // throws at its ceiling rather than silently returning a short answer,
      // which is the whole reason the under-billing below went unnoticed.
      const APPT_HORIZON_DAYS = REMINDER_HORIZON_DAYS;
      const apptsRes = reminderClientIds.length
        ? await fetchAllRows<any>(
            () =>
              sup
                .from("appointments")
                .select("client_id, scheduled_at, status")
                .in("client_id", reminderClientIds)
                .gte("scheduled_at", new Date(Date.now() - 200 * 86400000).toISOString())
                .lte("scheduled_at", new Date(Date.now() + APPT_HORIZON_DAYS * 86400000).toISOString())
                .order("scheduled_at")
                .order("id"),
            { label: "ReminderEditor.appointments" },
          )
        : ([] as any[]);
      const appts = apptsRes;
      const byClient: Record<string, any> = {};
      (clients || []).forEach((c: any) => { byClient[c.id] = c; });
      const calendarCadenceOf = (cid: string): Cadence | null => {
        const p = (pays || []).find((x: any) => x.client_id === cid && x.cadence);
        return p ? (p.cadence as Cadence) : null;
      };
      const out: Rem[] = (rems || [])
        .map((r: any) => {
          const c = byClient[r.client_id] || {};
          // ⚠️ THE ONE MISSING WORD, 29 Aug. "monthly_adjusted" was absent from
          // this list, so all 15 monthly clients fell through to per_session and
          // every screen downstream believed it. Tim Yancey's card read
          // "8 sessions × $70 = $560" beside an amount of $490, threw a red
          // "does not match", reset to the wrong figure, and — worst — save()
          // wrote basis:"sessions_trained" back over the correct value the
          // nightly recalc had just written. The rule was right in the database
          // and right in reminder-calc.ts; only the line choosing between them
          // was wrong, which is why this came back four times.
          //
          // resolveBillingType() already knows every valid type. Use it rather
          // than a second hand-maintained list that can fall out of step again.
          const billingType: BillingType = resolveBillingType({
            billingType: c.billing_type as BillingType | null,
            flatBilling: c.flat_billing === true,
          });
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
          // The latest recorded due date BEFORE this one. Null for a client's
          // first ever reminder, which then falls back to the calculation.
          const prevActual = (allDue || [])
            .filter((x) => x.client_id === r.client_id && x.due_date < r.due_date)
            .map((x) => x.due_date)
            .sort()
            .pop() || null;
          const start = reminderSendDate(prevActual ?? previousDueDate(r.due_date, cad));
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
          // ⚠️ This asked "is basis exactly 'sessions_trained'?" as a proxy for
          // "does this row carry the structured shape?". Those were the same
          // question only while every row was written with that one basis. The
          // basis now follows the client's real billing type, so keying on it
          // would have made every NEW monthly or flat row look like the OLD
          // shape and silently recompute counts from live data instead of
          // reading what the bill was actually calculated from -- which is the
          // drift this whole file exists to prevent.
          //
          // Ask the question that was always meant: does it carry the fields?
          const storedIsNewShape = !!cd && typeof cd === "object"
            && ("sessions_trained" in cd || "cycle" in cd);
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
            // FROZEN ONCE SENT, live while pending. A bill she has already been
            // emailed must keep itemising at the rate it was calculated with; a
            // draft should follow the client's current rate, because that is
            // what it will actually be billed at.
            monthlyRate: c.current_fees == null ? null : Number(c.current_fees),
            expectedSessions: c.expected_sessions_per_cycle == null ? null : Number(c.expected_sessions_per_cycle),
            halfPriceSessions: Number(r.half_price_sessions ?? 0),
            billedRate: billedRateOf(
              storedIsNewShape && r.notification_status !== "pending" ? cd.rate : null,
              c.session_rate == null ? null : Number(c.session_rate),
            ),
            cadence: cad,
            billingType,
            sessionsTrained,
            trainedDates: outTrainedDates,
            cancelledFull: full,
            cancelledHalf: half,
            cancelledDates,
            previousDueDateActual: prevActual,
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
          halfPrice: String(r.halfPriceSessions || 0),
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

  /**
   * Editing half-price recomputes the amount the same way editing the count
   * does. Without this the deduction shows in the itemisation while the Amount
   * box keeps the old figure — and the Amount box is what actually gets billed.
   */
  const setHalfPrice = (r: Rem, raw: string) => {
    const n = Math.max(0, parseInt(raw, 10) || 0);
    const patch: Partial<Edit> = { halfPrice: raw };
    const rate = r.billedRate ?? 0;
    if (r.billingType === "monthly_adjusted" && r.monthlyRate != null) {
      patch.amount = String(round2(Math.max(0,
        r.monthlyRate - r.cancelledFull * rate - n * (rate / 2))));
      patch.amountOverridesCount = false;
    } else if (r.billingType === "per_session") {
      patch.amount = String(round2(Math.max(0,
        r.sessionsTrained * rate - n * (rate / 2))));
      patch.amountOverridesCount = false;
    }
    setEdit(r.id, patch);
  };

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
    const half = parseInt(edits[r.id]?.halfPrice ?? "0", 10) || 0;
    const rate = r.billedRate ?? 0;
    // "Reset" has to reset to the rule this client is actually on. It used to
    // assume sessions x rate for everyone who was not flat, which on a
    // monthly-rate client silently replaced their rate with a session count.
    const amt =
      r.billingType === "flat"
        ? (r.fee ?? 0)
        : r.billingType === "monthly_adjusted"
          // Only the sessions they actually missed, never the raw cancel count.
          ? round2(Math.max(0, (r.monthlyRate ?? 0)
              - Math.min(r.cancelledFull, Math.max(0, (r.expectedSessions ?? 0) - r.sessionsTrained)) * rate))
          : round2(Math.max(0, n * rate));
    setEdit(r.id, { amount: String(amt), amountOverridesCount: false, override: false });
  };

  const calcFor = (r: Rem, e: Edit) =>
    calcReminder({
      fee: r.fee,
      // The rate on the ROW, not the client's rate today — a sent bill must not
      // re-itemise itself when the client's rate changes.
      sessionRate: r.billedRate,
      expectedSessions: r.expectedSessions,
      // Central, not the browser's clock. Drives the provisional lock below.
      todayCT: new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }),
      halfPriceSessions: e.halfPrice === "" ? r.halfPriceSessions : (parseInt(e.halfPrice, 10) || 0),
      cadence: r.cadence,
      dueDate: e.due,
      sessionsTrained: parseInt(e.count, 10) || 0,
      billingType: r.billingType,
      previousDueDateActual: r.previousDueDateActual,
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
        half_price_sessions: parseInt(e.halfPrice, 10) || 0,
        credit_details: {
          // ⚠️ THE BILL EXPLAINED ITSELF WRONG ON EVERY CLIENT'S PHONE.
          //
          // This was hard-coded to "sessions_trained" for everyone, so the
          // client-facing line always read "N sessions x $rate" no matter what
          // they were actually on. Tim Yancey's phone said "8 sessions x $70 =
          // $490" -- 8 x 70 is 560. Sharon Rambo's said "6 sessions x $75 =
          // $300" -- that is 450. The amounts charged were right; the sentence
          // explaining them was arithmetic that does not work, sitting on the
          // screen Dustin screenshots for clients.
          //
          // NOT ONE CLIENT IS ON PER-SESSION BILLING. Checked, 29 Aug: 15 are
          // monthly_adjusted, 5 are flat, 16 are none. So the one basis this
          // wrote was the only one nobody had.
          //
          // The basis now follows the client's actual billing type, and the
          // numbers the monthly explanation needs are written with it --
          // monthly_rate, cancel_deduction and half_price_deduction were read
          // by parseInvoiceDetail() and never written by anything, so that
          // branch could only ever have come out blank.
          basis: r.billingType === "monthly_adjusted" ? "monthly_less_missed"
               : r.billingType === "flat" ? "flat"
               : r.billingType === "per_session" ? "sessions_trained"
               : "",
          monthly_rate: calc.baseRate ?? null,
          cancel_deduction: calc.cancelDeduction ?? 0,
          half_price_deduction: calc.halfPriceDeduction ?? 0,
          cycle: calc.cycleStart + " to " + calc.cycleEnd,
          rate: r.sessionRate == null ? null : String(r.sessionRate),
          billing_type: r.billingType,
          sessions_trained: count,
          sessions_credited: calc.sessionsCredited,
          sessions_extra: calc.sessionsExtra,
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
      // Checked, and it has to be checked BEFORE the email. The notice below
      // says "Reminder approved and the in-app banner is showing, but the email
      // didn't send" — on a refused update that sentence is two lies and an
      // email to the client about a reminder that was never approved.
      const { error: saveErr } = await sup.from("payment_reminders").update(patch).eq("id", r.id);
      if (saveErr) {
        alert(
          (publish ? "Not approved" : "Not saved") +
            " — nothing was changed and the client was not contacted. " +
            saveErr.message,
        );
        return;
      }
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
          const j = await res.json().catch(() => ({} as any));
          if (!res.ok) {
            alert("Reminder approved and the in-app banner is showing, but the email didn't send: " + (j.error || ("HTTP " + res.status)));
          } else if (j.warning) {
            alert(j.warning);
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
      // This is the write that means PAID. Everything after it is downstream of
      // it being true, so nothing after it may run until it is known to have
      // landed: unchecked, a refused update still thanked the client for a
      // payment the books did not record and still rolled the cycle forward.
      // There is precedent for the shape in paymentActions.ts's own history —
      // markClientPaid once inserted with a column that did not exist,
      // unchecked, right after deleting the current reminder, and quietly wiped
      // a client's billing schedule.
      const { error: paidErr } = await sup.from("payment_reminders").update({
        notification_status: "paid",
        paid_confirmed_at: new Date().toISOString(),
      }).eq("id", r.id);
      if (paidErr) {
        alert("Not marked paid — nothing was changed and the client was not notified. " + paidErr.message);
        return;
      }
      // Notify the client their payment was received (feedback b0ee64d6).
      // Best-effort by design: they HAVE been marked paid, and failing that
      // back out over a notification would be worse. But it must be capable of
      // saying so — a client who never hears is a client who asks.
      const { error: notifyErr } = await sup.from("client_notifications").insert({
        client_id: r.client_id,
        type: "payment_received",
        title: "Payment received ✓",
        body: "Thanks! We've received your payment" + (r.amount_due != null ? " of $" + Number(r.amount_due).toFixed(2) : "") + ".",
      });
      // Roll forward. Seed 0, NOT the fee or the previous amount: under the
      // sessions-trained rule the next cycle's amount is not knowable yet — it
      // is whatever they train. The editor computes it at send time.
      const { error: rollErr } = await sup.from("payment_reminders").insert({
        client_id: r.client_id,
        due_date: nextDueDate(r.due_date, r.cadence),
        amount_due: 0,
        notification_status: "pending",
      });
      // Named separately: a missing next cycle is a reminder that never goes
      // out, and it is invisible — nothing on the screen shows the absence.
      if (rollErr) {
        alert("Marked paid, but the next cycle was NOT created — add it by hand. " + rollErr.message);
      } else if (notifyErr) {
        alert("Marked paid, but the client wasn't notified. " + notifyErr.message);
      }
      await load();
    } finally { setBusy(null); }
  };

  const deleteReminder = async (r: Rem) => {
    if (!confirm(`Delete this payment reminder for ${r.name} (due ${r.due_date}, $${r.amount_due})?\n\nThis removes the reminder only — it does not affect anything already sent to the client. This can't be undone.`)) return;
    setBusy(r.id);
    try {
      const sup = createClient() as any;
      // The reload would put the row back, which is honest but mute — a Delete
      // that visibly does nothing reads as a broken button, not a refusal.
      const { error } = await sup.from("payment_reminders").delete().eq("id", r.id);
      if (error) alert("Not deleted — the reminder is still there. " + error.message);
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
        const adjusted = r.billingType === "monthly_adjusted";
        return (
          <div key={r.id} className="rounded-3xl p-4 space-y-2"
            style={{ background: "var(--brand-surface)", border: "1px solid " + (blocked ? "#ef4444" : "var(--brand-border)"), boxShadow: "0 8px 26px rgba(20,30,55,0.08)" }}>
            <div className="flex justify-between items-center">
              <div className="font-semibold" style={{ color: "var(--brand-text)" }}>{r.name}</div>
              <div className="flex items-center gap-2">
                {calc.provisional && !sent && (
                  <span className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{ background: "#3b82f622", color: "#3b82f6" }}>
                    {"PROVISIONAL — can send from " + fmtDay(calc.cycleEnd)}
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
              {/* THE RULE, shown as arithmetic. Dustin, 20 Aug: "$640 minus any
                  cancelled sessions based on that monthly rate divided by the
                  number of sessions (8)." Written out rather than summarised,
                  because this is the screen he screenshots for clients. */}
              {/* THE BILL, READ TOP TO BOTTOM LIKE A RECEIPT: what the rate
                  covers, what came off it, what is owed. Dustin, 29 Aug: "this
                  needs to be set up where its very easy for me to confirm its
                  correct, edit if needed and send it off." Three aligned lines
                  beat one run-on sentence, and this is the screen he
                  screenshots for clients. */}
              {adjusted ? (
                <>
                  <div className="flex items-baseline gap-2 text-xs font-semibold" style={{ color: "var(--brand-text)" }}>
                    <span>{(r.expectedSessions ?? "?") + " sessions × $" + (r.billedRate ?? "?")}</span>
                    <span className="ml-auto tabular-nums">{"$" + (r.monthlyRate ?? "?")}</span>
                  </div>
                  {calc.sessionsCredited > 0 && (
                    <div className="flex items-baseline gap-2 text-xs font-semibold" style={{ color: "#22c55e" }}>
                      <span>{calc.sessionsCredited + (calc.sessionsCredited === 1 ? " session" : " sessions") + " covered · not charged"}</span>
                      <span className="ml-auto tabular-nums">{"− $" + calc.cancelDeduction}</span>
                    </div>
                  )}
                  {/* Extras are not billed (Dustin, 29 Aug). Shown anyway, because
                      a free session he cannot see is a free session he gets no
                      credit for — the same reason the covered line exists. */}
                  {!!calc.sessionsExtra && calc.sessionsExtra > 0 && (
                    <div className="flex items-baseline gap-2 text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                      <span>{calc.sessionsExtra + (calc.sessionsExtra === 1 ? " session" : " sessions") + " above the plan"}</span>
                      <span className="ml-auto tabular-nums">not charged</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-baseline gap-2 text-xs font-semibold" style={{ color: "var(--brand-text)" }}>
                  <span>{perSession
                    ? r.sessionsTrained + " sessions trained × $" + (r.billedRate ?? "?")
                    : "Flat " + (r.cadence || "monthly") + " rate"}</span>
                  <span className="ml-auto tabular-nums">{"$" + calc.expected}</span>
                </div>
              )}
              {adjusted && calc.sessionsCredited === 0 && (
                <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                  {r.cancelledFull > 0
                    ? "Nothing missed this cycle — every cancelled session was made up. The full rate."
                    : "Nothing cancelled this cycle — the full rate."}
                </div>
              )}
              {/* A discount nobody can see is a discount you get no credit for.
                  Dustin, 18 Aug: "so I can screenshot the dates n show her I gave
                  her 2 free." */}
              {(() => {
                const adj = describeAdjustment(calc.expected, r.amount_due, r.billedRate);
                if (!adj) return null;
                const noun = adj.sessions
                  ? adj.sessions + (adj.sessions === 1 ? " session" : " sessions")
                  : "$" + adj.amount;
                return (
                  <div className="text-xs font-semibold" style={{ color: "#22c55e" }}>
                    {"Billed $" + r.amount_due + " — " + noun +
                      (adj.direction === "covered" ? " covered" : " added")}
                  </div>
                );
              })()}
              <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                {"Billing cycle " + calc.cycleStart + " → " + calc.cycleEnd + " · due " + r.due_date}
              </div>
              {(perSession || adjusted) && r.trainedDates.length > 0 && (
                <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                  {"Trained (" + r.trainedDates.length + "): " + r.trainedDates.map(fmtDay).join(", ")}
                </div>
              )}
              {(perSession || adjusted) && r.trainedDates.length === 0 && (
                <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                  No sessions trained in this cycle.
                </div>
              )}
              {r.cancelledDates.length > 0 && (
                <div className="text-xs" style={{ color: "var(--brand-text-secondary)", opacity: 0.75 }}>
                  {"Cancelled (" + r.cancelledDates.length + "): " +
                    r.cancelledDates.map((c) => fmtDay(c.date) + (c.type === "half" ? " (½)" : "")).join(", ") +
                    (adjusted
                      ? (calc.sessionsCredited === r.cancelledDates.length ? " — not charged"
                         : calc.sessionsCredited === 0 ? " — all made up, still charged"
                         : " — " + calc.sessionsCredited + " credited, the rest made up")
                      : perSession
                        ? " — not billed"
                        : " — flat rate, not deducted")}
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

            {/* HALF PRICE WHILE HE IS AWAY. Dustin, 20 Aug: "only time i will bill
                half price is when im on vacation and i am going to train them
                from the app. this will be done manually so ill need an option
                for that somehow."

                Manual by design and it stays manual: nothing in the calendar
                marks a remote session, and inferring one from a gap would be
                guessing at a discount. Only shown on models where a session
                rate means anything — on a flat client it would do nothing. */}
            {!sent && (adjusted || perSession) && (
              <div className="flex items-center justify-between gap-3 rounded-xl p-2.5"
                style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                <label className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                  Remote sessions at half price
                  <span className="block" style={{ opacity: 0.7 }}>
                    {r.billedRate ? "−$" + (r.billedRate / 2) + " each" : "set a session rate first"}
                  </span>
                </label>
                <input type="number" min="0" step="1" value={e.halfPrice}
                  onChange={(ev) => setHalfPrice(r, ev.target.value)}
                  className="rounded-xl p-2 text-sm text-right"
                  style={{ width: 74, background: "var(--brand-card)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </div>
            )}
            {sent && r.halfPriceSessions > 0 && (
              <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                {r.halfPriceSessions + " remote session" + (r.halfPriceSessions === 1 ? "" : "s") + " billed at half rate"}
              </div>
            )}

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

            {/* Once sent the textarea below is gone, and with it the only place
                the client-facing line was visible — including on the screen that
                gets screenshotted TO the client. Show it read-only instead. */}
            {sent && r.sms_message && (
              <div className="text-xs rounded-xl p-2" style={{ background: "var(--brand-bg)", color: "var(--brand-text-secondary)" }}>
                {"Message shown to client: " + r.sms_message}
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
