"use client";

// Billing & Schedule — how a client trains and how they pay, in one editable place.
//
// Dustin, 20 Aug: "we definately need some type of form in their profile that
// has their actually billing set up... this needs a home in the profile and it
// needs to be 100% editable by me at any time. also this needs to live in same
// place as how many days they train and what days they train."
//
// Before this screen existed, `billing_type` was not on the API's allow-list at
// all — it could only be changed by editing the database by hand. `session_rate`,
// `billing_cadence`, `training_days` and the payment anchor dates had no UI
// either. Every client sat on whatever they were created with, and the two
// clearest symptoms were Tyler Dorsett being billed $60 against a $300
// agreement, and Madeleine Coker's $75 SESSION rate living in her monthly fee
// field for weeks.

import { useState } from "react";
import BillingHistory from "@/components/BillingHistory";
import {
  BILLING_TYPES, BILLING_TYPE_LABEL, CADENCES, CADENCE_LABEL,
  fieldsFor, clearUnusedFields, validateBillingFields,
} from "@/lib/billingFields";

export interface BillingClient {
  id: string;
  name: string;
  billing_type: string | null;
  billing_cadence: string | null;
  current_fees: number | null;
  session_rate: number | null;
  expected_sessions_per_cycle: number | null;
  billing_anchor_day: number | null;
  billing_anchor_day_2: number | null;
  training_frequency: number | null;
  training_days: string | null;
  payment_reminders_enabled: boolean | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const BILLING_HELP: Record<string, string> = {
  monthly_adjusted:
    "The rate, less any session marked orange in Google Calendar, at the session rate.",
  flat: "The rate every cycle. Sessions and cancellations change nothing.",
  per_session: "Only sessions actually trained, at the session rate.",
  paid_by_other: "Billed on another client's invoice. Nothing is sent to them.",
  none: "No reminder is ever generated.",
};

const money = (n: number) => "$" + (Math.round(n * 100) / 100).toLocaleString("en-US");

export default function BillingScheduleTab({ client }: { client: BillingClient }) {
  const [f, setF] = useState({
    billing_type: client.billing_type || "none",
    billing_cadence: client.billing_cadence || "monthly",
    current_fees: client.current_fees != null ? String(client.current_fees) : "",
    session_rate: client.session_rate != null ? String(client.session_rate) : "",
    expected_sessions_per_cycle:
      client.expected_sessions_per_cycle != null ? String(client.expected_sessions_per_cycle) : "",
    billing_anchor_day: client.billing_anchor_day != null ? String(client.billing_anchor_day) : "",
    billing_anchor_day_2: client.billing_anchor_day_2 != null ? String(client.billing_anchor_day_2) : "",
    training_frequency: client.training_frequency != null ? String(client.training_frequency) : "",
    payment_reminders_enabled: client.payment_reminders_enabled ?? false,
  });
  const [days, setDays] = useState<string[]>(
    (client.training_days || "").split(",").map((d) => d.trim()).filter(Boolean),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (k: keyof typeof f, v: string | boolean) => {
    setF((p) => ({ ...p, [k]: v }));
    setSaved(false);
    setErr(null);
  };

  const shows = fieldsFor(f.billing_type);
  const rate = Number(f.current_fees) || 0;
  const perSession = Number(f.session_rate) || 0;
  const expected = Number(f.expected_sessions_per_cycle) || 0;

  // The three numbers should agree. When they do not, one of them is wrong —
  // and the screen says which combination it is rather than leaving Dustin to
  // divide it in his head.
  const implied = perSession > 0 ? Math.round((rate / perSession) * 100) / 100 : null;
  const mismatch =
    shows.expectedSessions && rate > 0 && perSession > 0 && expected > 0 && implied !== null
      ? Math.abs(implied - expected) > 0.01
      : false;

  const toggleDay = (d: string) => {
    setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const numOrNull = (v: string) => (v === "" ? null : Number(v));
      const patch: Record<string, unknown> = {
        billing_type: f.billing_type,
        billing_cadence: shows.cadence ? f.billing_cadence : null,
        current_fees: numOrNull(f.current_fees),
        session_rate: numOrNull(f.session_rate),
        expected_sessions_per_cycle: numOrNull(f.expected_sessions_per_cycle),
        billing_anchor_day: numOrNull(f.billing_anchor_day),
        billing_anchor_day_2:
          f.billing_cadence === "semimonthly" ? numOrNull(f.billing_anchor_day_2) : null,
        training_frequency: numOrNull(f.training_frequency),
        // Sorted into week order, not the order they were tapped, so the stored
        // string is stable and comparable.
        training_days: days.length
          ? DAYS.filter((d) => days.includes(d)).join(",")
          : null,
        payment_reminders_enabled: f.payment_reminders_enabled,
      };
      // Whatever this billing type does not use is explicitly nulled. A form
      // that only writes what it SHOWS leaves the hidden fields behind, still
      // set and still read by the billing engine — which is exactly how Tyler
      // kept a $15 session rate after moving to a $300 flat rate.
      Object.assign(patch, clearUnusedFields(f.billing_type));

      const local = validateBillingFields(patch);
      if (local) { setErr(local); return; }

      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.error || `Couldn't save (HTTP ${res.status}). Nothing was changed.`);
        return;
      }
      setSaved(true);
    } catch (e) {
      setErr((e as Error)?.message || "Couldn't save — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  const L = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5"
      style={{ color: "var(--brand-text-secondary)" }}>{children}</label>
  );
  const inputStyle = {
    background: "var(--brand-bg)",
    border: "1px solid var(--brand-border)",
    color: "var(--brand-text)",
  };
  const Section = ({ title }: { title: string }) => (
    <div className="text-[11px] font-bold uppercase tracking-wider mt-6 mb-2 first:mt-0"
      style={{ color: "var(--brand-text-secondary)" }}>{title}</div>
  );

  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4" style={{ background: "var(--brand-card)", border: "1px solid var(--brand-border)" }}>

        <Section title="Schedule" />
        <div className="mb-3">
          <L>Days per week</L>
          <input type="number" min={1} max={6} value={f.training_frequency}
            onChange={(e) => set("training_frequency", e.target.value)}
            className="w-full rounded-xl p-2.5 text-sm" style={inputStyle} />
        </div>
        <div className="mb-1">
          <L>Training days</L>
          <div className="flex gap-1.5">
            {DAYS.map((d) => (
              <button key={d} type="button" onClick={() => toggleDay(d)}
                className="flex-1 rounded-xl py-2 text-xs font-bold"
                style={days.includes(d)
                  ? { background: "var(--brand-primary)", color: "#fff", border: "1px solid var(--brand-primary)" }
                  : { background: "var(--brand-bg)", color: "var(--brand-text-secondary)", border: "1px solid var(--brand-border)" }}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <Section title="How they're billed" />
        <div className="space-y-2">
          {BILLING_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => set("billing_type", t)}
              className="w-full text-left rounded-xl p-3 flex gap-2.5 items-start"
              style={f.billing_type === t
                ? { background: "color-mix(in srgb, var(--brand-primary) 12%, transparent)", border: "1px solid var(--brand-primary)" }
                : { background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
              <span className="mt-1 rounded-full flex-shrink-0"
                style={{ width: 14, height: 14,
                  border: `2px solid ${f.billing_type === t ? "var(--brand-primary)" : "var(--brand-border)"}`,
                  background: f.billing_type === t ? "var(--brand-primary)" : "transparent",
                  boxShadow: f.billing_type === t ? "inset 0 0 0 2.5px var(--brand-card)" : undefined }} />
              <span>
                <span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>
                  {BILLING_TYPE_LABEL[t]}
                </span>
                <span className="block text-xs leading-snug" style={{ color: "var(--brand-text-secondary)" }}>
                  {BILLING_HELP[t]}
                </span>
              </span>
            </button>
          ))}
        </div>

        {(shows.rate || shows.sessionRate) && (
          <>
            <Section title="Rates" />
            <div className="flex gap-2">
              {shows.rate && (
                <div className="flex-1">
                  <L>{f.billing_cadence === "semimonthly" ? "Each payment" : "Rate"}</L>
                  <input type="number" step="0.01" min="0" value={f.current_fees}
                    onChange={(e) => set("current_fees", e.target.value)}
                    className="w-full rounded-xl p-2.5 text-sm" style={inputStyle} />
                </div>
              )}
              {shows.sessionRate && (
                <div className="flex-1">
                  <L>Per session</L>
                  <input type="number" step="0.01" min="0" value={f.session_rate}
                    onChange={(e) => set("session_rate", e.target.value)}
                    className="w-full rounded-xl p-2.5 text-sm" style={inputStyle} />
                </div>
              )}
            </div>
            {shows.expectedSessions && (
              <div className="mt-3">
                <L>Sessions per payment</L>
                <input type="number" min={1} max={60} value={f.expected_sessions_per_cycle}
                  onChange={(e) => set("expected_sessions_per_cycle", e.target.value)}
                  className="w-full rounded-xl p-2.5 text-sm" style={inputStyle} />
              </div>
            )}
            {shows.expectedSessions && rate > 0 && perSession > 0 && (
              <div className="mt-2 rounded-xl p-3 text-xs leading-relaxed"
                style={{ background: "var(--brand-bg)",
                  color: mismatch ? "#f59e0b" : "var(--brand-text-secondary)",
                  border: `1px solid ${mismatch ? "#f59e0b60" : "var(--brand-border)"}` }}>
                {mismatch ? (
                  <>⚠️ {money(rate)} ÷ {money(perSession)} = <b>{implied}</b> sessions, but{" "}
                  <b>{expected}</b> are set. One of these three is wrong.</>
                ) : (
                  <>{money(rate)} ÷ {expected} = <b style={{ color: "var(--brand-text)" }}>{money(perSession)}</b> per session.
                  {" "}Each cancelled session takes off {money(perSession)}.</>
                )}
              </div>
            )}
          </>
        )}

        {shows.cadence && (
          <>
            <Section title="When they pay" />
            <div className="mb-3">
              <L>Cadence</L>
              <select value={f.billing_cadence} onChange={(e) => set("billing_cadence", e.target.value)}
                className="w-full rounded-xl p-2.5 text-sm" style={inputStyle}>
                {CADENCES.map((c) => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <L>{f.billing_cadence === "semimonthly" ? "First date" : "Due on"}</L>
                <input type="number" min={1} max={31} value={f.billing_anchor_day}
                  onChange={(e) => set("billing_anchor_day", e.target.value)}
                  placeholder="Day of month"
                  className="w-full rounded-xl p-2.5 text-sm" style={inputStyle} />
              </div>
              {f.billing_cadence === "semimonthly" && (
                <div className="flex-1">
                  <L>Second date</L>
                  <input type="number" min={1} max={31} value={f.billing_anchor_day_2}
                    onChange={(e) => set("billing_anchor_day_2", e.target.value)}
                    placeholder="Day of month"
                    className="w-full rounded-xl p-2.5 text-sm" style={inputStyle} />
                </div>
              )}
            </div>
          </>
        )}

        {f.billing_type !== "none" && f.billing_type !== "paid_by_other" && (
          <>
            <Section title="Reminders" />
            <button type="button" onClick={() => set("payment_reminders_enabled", !f.payment_reminders_enabled)}
              className="w-full rounded-xl p-3 flex items-center justify-between text-sm"
              style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
              <span>Email a reminder 7 days before it's due</span>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={f.payment_reminders_enabled
                  ? { background: "#16A34A22", color: "#16A34A" }
                  : { background: "var(--brand-border)", color: "var(--brand-text-secondary)" }}>
                {f.payment_reminders_enabled ? "ON" : "OFF"}
              </span>
            </button>
          </>
        )}

        {err && (
          <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "#ef444418", color: "#ef4444", border: "1px solid #ef444440" }}>
            {err}
          </div>
        )}
        {saved && !err && (
          <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "#16A34A18", color: "#16A34A", border: "1px solid #16A34A40" }}>
            Saved. It applies from the next time the reminder is worked out.
          </div>
        )}

        <button onClick={save} disabled={saving}
          className="w-full mt-4 rounded-xl py-3 text-sm font-bold"
          style={{ background: saving ? "var(--brand-border)" : "var(--brand-primary)", color: "#fff", border: "none" }}>
          {saving ? "Saving…" : "Save billing & schedule"}
        </button>
      </div>

      {/* The same records the client sees, on the trainer's side of the app, so
          a question about a past bill can be answered without leaving the
          client's profile. */}
      <BillingHistory clientId={client.id} />
    </div>
  );
}
