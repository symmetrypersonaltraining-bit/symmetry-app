"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface ReminderSummary {
  id: string;
  dueDate: string;
  amountDue: number;
  notificationStatus: string;
  emailSentAt: string | null;
}

interface ClientPayment {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  currentFees: number | null;
  trainingFrequency: number | null;
  reminderId: string | null;
  dueDate: string | null;
  amountDue: number;
  billingCredits: number;
  notificationStatus: string; // "pending"|"paused"|"sent"|"paid"|"cancelled"|"no_reminder"
  emailSentAt: string | null;
  approvedAt: string | null;
  notes: string | null;
  hasReminder: boolean;
  allReminders: ReminderSummary[];
}

type Tab = "upcoming" | "all";

const STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
  pending:     { bg: "#f59e0b20", color: "#f59e0b", label: "Pending" },
  paused:      { bg: "rgba(100,100,120,0.15)", color: "#94a3b8", label: "Paused" },
  sent:        { bg: "#22c55e20", color: "#22c55e", label: "Reminder Sent" },
  paid:        { bg: "#0EA5E920", color: "#0EA5E9", label: "Paid" },
  cancelled:   { bg: "#ef444420", color: "#ef4444", label: "Cancelled" },
  no_reminder: { bg: "rgba(100,100,120,0.1)", color: "#64748b", label: "No Reminder" },
};

function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(d: string, today: string) {
  return Math.round((new Date(d + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000);
}

// ── Confirm Modal ──────────────────────────────────────────────────────────────
interface ConfirmModalProps {
  client: ClientPayment;
  onClose: () => void;
  onSent: (clientId: string) => void;
}

function ConfirmModal({ client, onClose, onSent }: ConfirmModalProps) {
  const supabase = createClient();
  const [amount, setAmount] = useState(String(client.amountDue - client.billingCredits));
  const [notes, setNotes] = useState(client.notes || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.select(); }, []);

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  async function handleSend() {
    if (!client.clientEmail) { setError("This client has no email address on file."); return; }
    setSending(true);
    setError(null);
    try {
      // If there's no reminder row yet, we can't send via the API — just log
      if (!client.reminderId) {
        // Create a reminder row first
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const { data: newReminder, error: createErr } = await supabase
          .from("payment_reminders")
          .insert({
            client_id: client.clientId,
            due_date: localDateStr(nextMonth),
            amount_due: parseFloat(amount) || 0,
            billing_credits: 0,
            notification_status: "pending",
            notes: notes || null,
          })
          .select("id")
          .single();
        if (createErr || !newReminder) {
          setError("Failed to create reminder: " + (createErr?.message || "unknown"));
          setSending(false);
          return;
        }
        // Now send via API
        const res = await fetch("/api/reminders/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reminderId: newReminder.id }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to send reminder.");
          setSending(false);
          return;
        }
      } else {
        // Update amount/notes if changed, then send
        await supabase.from("payment_reminders").update({
          amount_due: parseFloat(amount) || client.amountDue,
          notes: notes || null,
          approved_at: new Date().toISOString(),
        }).eq("id", client.reminderId);

        const res = await fetch("/api/reminders/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reminderId: client.reminderId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to send reminder.");
          setSending(false);
          return;
        }
      }
      setSent(true);
      setTimeout(() => { onSent(client.clientId); onClose(); }, 1200);
    } catch (e: any) {
      setError(e.message || "Unexpected error");
      setSending(false);
    }
  }

  const net = parseFloat(amount) || 0;

  return (
    <div
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
      >
        {/* Modal header */}
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)", borderBottom: "1px solid var(--brand-border)" }}>
          <div>
            <h2 className="text-base font-bold text-white">Send Payment Reminder</h2>
            <p className="text-xs text-red-200 mt-0.5">{client.clientName}</p>
          </div>
          <button onClick={onClose} className="text-red-200 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Email preview */}
        <div className="px-5 py-4 space-y-4">
          {/* To field */}
          <div className="rounded-xl p-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "var(--brand-text-secondary)" }}>TO</p>
            {client.clientEmail
              ? <p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>{client.clientEmail}</p>
              : <p className="text-sm text-red-400 font-medium">No email on file — cannot send</p>}
          </div>

          {/* Amount field (editable) */}
          <div>
            <label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--brand-text-secondary)" }}>
              AMOUNT DUE <span className="text-xs font-normal">(edit to adjust)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold"
                style={{ color: "var(--brand-text-secondary)" }}>$</span>
              <input
                ref={inputRef}
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full pl-7 pr-4 py-3 rounded-xl text-xl font-bold outline-none"
                style={{
                  background: "var(--brand-bg)",
                  color: "var(--brand-text)",
                  border: "2px solid var(--brand-primary)",
                }}
              />
            </div>
            {client.billingCredits > 0 && (
              <p className="text-xs mt-1" style={{ color: "#22c55e" }}>
                Includes -${client.billingCredits} billing credit already applied
              </p>
            )}
          </div>

          {/* Due date */}
          {client.dueDate && (
            <div className="rounded-xl p-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--brand-text-secondary)" }}>DUE DATE</p>
              <p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>{fmtDate(client.dueDate)}</p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--brand-text-secondary)" }}>
              PERSONAL NOTE <span className="text-xs font-normal">(optional — included in email)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Great work this month!"
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
              style={{
                background: "var(--brand-bg)",
                color: "var(--brand-text)",
                border: "1px solid var(--brand-border)",
              }}
            />
          </div>

          {/* Email preview snippet */}
          <div className="rounded-xl p-3 text-xs space-y-1"
            style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)" }}>
            <p className="font-semibold" style={{ color: "#dc2626" }}>Email Preview</p>
            <p style={{ color: "var(--brand-text-secondary)" }}>
              Hi {client.clientName.split(" ")[0]}, this is a friendly reminder that a payment of{" "}
              <strong style={{ color: "var(--brand-text)" }}>${net.toFixed(2)}</strong> is due
              {client.dueDate ? ` on ${fmtDate(client.dueDate)}` : ""}.
              {notes ? ` ${notes}` : ""}
            </p>
          </div>

          {error && (
            <div className="rounded-xl px-3 py-2 text-sm" style={{ background: "#ef444420", color: "#ef4444" }}>
              {error}
            </div>
          )}

          {sent && (
            <div className="rounded-xl px-3 py-2 text-sm font-medium text-center"
              style={{ background: "#22c55e20", color: "#22c55e" }}>
              Reminder sent successfully!
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 flex gap-3" style={{ borderTop: "1px solid var(--brand-border)" }}>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "var(--brand-bg)", color: "var(--brand-text-secondary)", border: "1px solid var(--brand-border)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || sent || !client.clientEmail}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
            style={{
              background: sending || sent || !client.clientEmail
                ? "rgba(220,38,38,0.4)"
                : "linear-gradient(135deg, #dc2626, #b91c1c)",
              cursor: sending || sent || !client.clientEmail ? "not-allowed" : "pointer",
            }}
          >
            {sending ? "Sending…" : sent ? "Sent!" : "Send Reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PaymentsClient({ clients }: { clients: ClientPayment[] }) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [search, setSearch] = useState("");
  const [localClients, setLocalClients] = useState(clients);
  const [confirmClient, setConfirmClient] = useState<ClientPayment | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const today = localDateStr();
  const thirtyDaysDate = new Date();
  thirtyDaysDate.setDate(thirtyDaysDate.getDate() + 30);
  const thirtyStr = localDateStr(thirtyDaysDate);

  const filtered = localClients.filter(c => {
    if (search && !c.clientName.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === "upcoming") {
      // Show: has a due date within 30 days, or no reminder yet (needs setup)
      if (c.notificationStatus === "paid" || c.notificationStatus === "cancelled") return false;
      if (!c.dueDate) return true; // no reminder — always show in upcoming
      return c.dueDate >= today && c.dueDate <= thirtyStr;
    }
    return true;
  });

  const pendingCount = filtered.filter(c => c.notificationStatus === "pending" || c.notificationStatus === "no_reminder").length;
  const totalOwed = filtered
    .filter(c => c.notificationStatus !== "paid" && c.notificationStatus !== "cancelled" && c.notificationStatus !== "no_reminder")
    .reduce((a, c) => a + c.amountDue - c.billingCredits, 0);
  const overdueCount = filtered.filter(c => c.dueDate && daysUntil(c.dueDate, today) < 0 && c.notificationStatus !== "paid").length;

  async function handleMarkPaid(c: ClientPayment) {
    if (!c.reminderId) return;
    setUpdating(c.clientId);
    await supabase.from("payment_reminders").update({ notification_status: "paid" }).eq("id", c.reminderId);
    setLocalClients(prev => prev.map(p =>
      p.clientId === c.clientId ? { ...p, notificationStatus: "paid" } : p
    ));
    setUpdating(null);
  }

  async function handlePauseToggle(c: ClientPayment) {
    if (!c.reminderId) return;
    const next = c.notificationStatus === "paused" ? "pending" : "paused";
    setUpdating(c.clientId);
    await supabase.from("payment_reminders").update({ notification_status: next }).eq("id", c.reminderId);
    setLocalClients(prev => prev.map(p =>
      p.clientId === c.clientId ? { ...p, notificationStatus: next } : p
    ));
    setUpdating(null);
  }

  function handleSent(clientId: string) {
    setLocalClients(prev => prev.map(p =>
      p.clientId === clientId
        ? { ...p, notificationStatus: "sent", emailSentAt: new Date().toISOString() }
        : p
    ));
  }

  return (
    <div className="pb-24" style={{ background: "var(--brand-bg)", minHeight: "100vh" }}>
      {/* ── Red gradient header ───────────────────────────────── */}
      <div className="px-4 lg:px-6 pt-6 pb-5"
        style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <i className="ti ti-credit-card text-white text-lg" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Payments</h1>
            <p className="text-xs text-red-200">
              {pendingCount} need action · ${totalOwed.toLocaleString()} total owed
            </p>
          </div>
        </div>

        {/* Summary pills */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Pending", value: pendingCount, icon: "ti-clock" },
            { label: "Overdue", value: overdueCount, icon: "ti-alert-triangle" },
            { label: "Total Owed", value: `$${totalOwed.toLocaleString()}`, icon: "ti-currency-dollar" },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-2.5 text-center"
              style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}>
              <p className="text-base font-bold text-white">{s.value}</p>
              <p className="text-xs text-red-200">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs + search ─────────────────────────────────────── */}
      <div className="px-4 lg:px-6 py-3 flex items-center gap-3 sticky top-0 z-10"
        style={{ background: "var(--brand-surface)", borderBottom: "1px solid var(--brand-border)" }}>
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "var(--brand-border)" }}>
          {(["upcoming", "all"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 text-xs font-semibold capitalize transition-all"
              style={t === tab
                ? { background: "#dc2626", color: "white" }
                : { background: "var(--brand-surface)", color: "var(--brand-text-secondary)" }}>
              {t === "upcoming" ? "Upcoming" : "All Clients"}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search client…"
          className="flex-1 px-3 py-1.5 text-sm rounded-xl outline-none"
          style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}
        />
      </div>

      {/* ── Client list ───────────────────────────────────────── */}
      <div className="px-4 lg:px-6 space-y-2 mt-3">
        {filtered.length === 0 && (
          <div className="py-12 text-center rounded-2xl"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-check-circle text-4xl block mb-2" style={{ color: "#22c55e" }} />
            <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
              {tab === "upcoming" ? "All clear — no upcoming payments in the next 30 days." : "No clients found."}
            </p>
          </div>
        )}

        {filtered.map(c => {
          const days = c.dueDate ? daysUntil(c.dueDate, today) : null;
          const net = c.amountDue - c.billingCredits;
          const s = STATUS_META[c.notificationStatus] || STATUS_META.pending;
          const isUpdating = updating === c.clientId;
          const initials = c.clientName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
          const isOverdue = days !== null && days < 0 && c.notificationStatus !== "paid";
          const isPaid = c.notificationStatus === "paid";
          const noReminder = c.notificationStatus === "no_reminder";

          return (
            <div
              key={c.clientId}
              className="rounded-2xl overflow-hidden transition-all"
              style={{
                background: "var(--brand-surface)",
                border: `1px solid ${isOverdue ? "rgba(239,68,68,0.4)" : "var(--brand-border)"}`,
              }}
            >
              <div className="flex items-start gap-3 p-4">
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                  style={{
                    background: isPaid ? "#22c55e"
                      : isOverdue ? "#ef4444"
                      : noReminder ? "#6b7280"
                      : "#dc2626",
                  }}
                >
                  {initials}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/clients/${c.clientId}`}
                        className="text-sm font-bold hover:underline truncate block"
                        style={{ color: "var(--brand-text)" }}
                      >
                        {c.clientName}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {c.dueDate ? (
                          <>
                            <span className="text-xs"
                              style={{ color: isOverdue ? "#ef4444" : days! <= 3 ? "#f59e0b" : "var(--brand-text-secondary)" }}>
                              {isOverdue
                                ? `${Math.abs(days!)}d overdue`
                                : days === 0 ? "Due today!"
                                : `Due in ${days}d`}
                            </span>
                            <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                              · {fmtDate(c.dueDate)}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs" style={{ color: "#f59e0b" }}>No reminder scheduled</span>
                        )}
                        {c.trainingFrequency && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full"
                            style={{ background: "var(--brand-bg)", color: "var(--brand-text-secondary)" }}>
                            {c.trainingFrequency}x/mo
                          </span>
                        )}
                      </div>
                      {c.notes && (
                        <p className="text-xs mt-1 italic" style={{ color: "var(--brand-text-secondary)" }}>{c.notes}</p>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold" style={{ color: isPaid ? "#22c55e" : "var(--brand-text)" }}>
                        ${net > 0 ? net.toLocaleString() : (c.currentFees ? c.currentFees.toLocaleString() : "—")}
                      </p>
                      {c.billingCredits > 0 && (
                        <p className="text-xs" style={{ color: "#22c55e" }}>-${c.billingCredits} credit</p>
                      )}
                      {c.currentFees && !c.hasReminder && (
                        <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                          rate: ${c.currentFees}/mo
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status badge + action buttons */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: s.bg, color: s.color }}>
                      {s.label}
                    </span>

                    {c.emailSentAt && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "#22c55e20", color: "#22c55e" }}>
                        <i className="ti ti-mail text-[10px] mr-0.5" />Email sent
                      </span>
                    )}

                    {/* PRIMARY: Confirm & Send */}
                    {!isPaid && c.notificationStatus !== "cancelled" && (
                      <button
                        onClick={() => setConfirmClient(c)}
                        disabled={isUpdating}
                        className="text-xs px-2.5 py-1 rounded-lg font-semibold transition-all"
                        style={{
                          background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                          color: "white",
                          opacity: isUpdating ? 0.5 : 1,
                        }}
                      >
                        {c.emailSentAt ? "Resend Reminder" : noReminder ? "Set Up & Send" : "Confirm & Send"}
                      </button>
                    )}

                    {/* Mark Paid */}
                    {!isPaid && c.hasReminder && c.notificationStatus !== "cancelled" && (
                      <button
                        onClick={() => handleMarkPaid(c)}
                        disabled={isUpdating}
                        className="text-xs px-2.5 py-1 rounded-lg font-medium"
                        style={{ background: "#22c55e20", color: "#22c55e", opacity: isUpdating ? 0.5 : 1 }}
                      >
                        {isUpdating ? "…" : "Mark Paid"}
                      </button>
                    )}

                    {/* Pause / Resume */}
                    {c.hasReminder && !isPaid && c.notificationStatus !== "cancelled" && (
                      <button
                        onClick={() => handlePauseToggle(c)}
                        disabled={isUpdating}
                        className="text-xs px-2.5 py-1 rounded-lg font-medium"
                        style={{ background: "var(--brand-bg)", color: "var(--brand-text-secondary)", border: "1px solid var(--brand-border)" }}
                      >
                        {c.notificationStatus === "paused" ? "Resume" : "Pause"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment history strip */}
              {c.allReminders.length > 1 && (
                <div className="px-4 py-2 flex gap-2 overflow-x-auto"
                  style={{ borderTop: "1px solid var(--brand-border)", background: "var(--brand-bg)" }}>
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>History:</span>
                  {c.allReminders.slice(1).map(r => (
                    <span key={r.id} className="text-xs flex-shrink-0 px-2 py-0.5 rounded-full"
                      style={{
                        background: r.notificationStatus === "paid" ? "#22c55e20" : "var(--brand-surface)",
                        color: r.notificationStatus === "paid" ? "#22c55e" : "var(--brand-text-secondary)",
                        border: "1px solid var(--brand-border)",
                      }}>
                      {fmtDate(r.dueDate)} · ${r.amountDue}
                      {r.notificationStatus === "paid" ? " ✓" : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Confirm modal ─────────────────────────────────────── */}
      {confirmClient && (
        <ConfirmModal
          client={confirmClient}
          onClose={() => setConfirmClient(null)}
          onSent={handleSent}
        />
      )}
    </div>
  );
}
