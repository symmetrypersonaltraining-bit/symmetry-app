"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Reminder {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  dueDate: string;
  amountDue: number;
  billingCredits: number;
  notificationStatus: string;
  emailSentAt: string | null;
  notes: string | null;
}

type Tab = "upcoming" | "all";

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: "#f59e0b20", color: "#f59e0b", label: "Pending" },
  paused:   { bg: "var(--brand-card)", color: "var(--brand-text-secondary)", label: "Paused" },
  sent:     { bg: "#22c55e20", color: "#22c55e", label: "Sent" },
  paid:     { bg: "#0EA5E920", color: "#0EA5E9", label: "Paid" },
  cancelled:{ bg: "#ef444420", color: "#ef4444", label: "Cancelled" },
};

export default function PaymentsClient({ reminders }: { reminders: Reminder[] }) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [updating, setUpdating] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [localReminders, setLocalReminders] = useState(reminders);

  const today = new Date().toISOString().split("T")[0];
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);
  const thirtyStr = thirtyDays.toISOString().split("T")[0];

  const filtered = localReminders.filter(r => {
    if (search) {
      const q = search.toLowerCase();
      if (!r.clientName.toLowerCase().includes(q)) return false;
    }
    if (tab === "upcoming") return r.dueDate >= today && r.dueDate <= thirtyStr && r.notificationStatus !== "paid";
    return true;
  });

  const totalPending = filtered.filter(r => r.notificationStatus === "pending").reduce((a, r) => a + r.amountDue - r.billingCredits, 0);

  function daysUntil(d: string) {
    return Math.round((new Date(d + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000);
  }

  function fmtDate(d: string) {
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    await supabase.from("payment_reminders").update({ notification_status: status }).eq("id", id);
    setLocalReminders(prev => prev.map(r => r.id === id ? { ...r, notificationStatus: status } : r));
    setUpdating(null);
  }

  async function sendReminder(r: Reminder) {
    setUpdating(r.id);
    try {
      const res = await fetch("/api/reminders/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderId: r.id }),
      });
      if (res.ok) {
        setLocalReminders(prev => prev.map(p =>
          p.id === r.id ? { ...p, emailSentAt: new Date().toISOString(), notificationStatus: "sent" } : p
        ));
      }
    } finally { setUpdating(null); }
  }

  return (
    <div className="pb-20" style={{ background: "var(--brand-bg)", minHeight: "100vh" }}>
      {/* Header */}
      <div className="px-4 lg:px-6 pt-6 pb-4"
        style={{ background: "var(--brand-surface)", borderBottom: "1px solid var(--brand-border)" }}>
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--brand-text)" }}>Payments</h1>
        <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
          {tab === "upcoming" ? `${filtered.length} due in next 30 days · $${totalPending.toLocaleString()} pending` : `${localReminders.length} total reminders`}
        </p>
      </div>

      {/* Tabs + search */}
      <div className="px-4 lg:px-6 py-3 flex items-center gap-3"
        style={{ background: "var(--brand-surface)", borderBottom: "1px solid var(--brand-border)" }}>
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "var(--brand-border)" }}>
          {(["upcoming", "all"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 text-xs font-semibold capitalize transition-all"
              style={t === tab
                ? { background: "var(--brand-primary)", color: "white" }
                : { background: "var(--brand-surface)", color: "var(--brand-text-secondary)" }}>
              {t === "upcoming" ? "Upcoming" : "All"}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search client…"
          className="flex-1 px-3 py-1.5 text-sm rounded-xl outline-none"
          style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
      </div>

      {/* Summary cards */}
      {tab === "upcoming" && (
        <div className="px-4 lg:px-6 py-3 grid grid-cols-3 gap-3">
          {[
            { label: "Due This Week", value: filtered.filter(r => daysUntil(r.dueDate) <= 7 && daysUntil(r.dueDate) >= 0 && r.notificationStatus !== "paid").length, color: "#f59e0b" },
            { label: "Email Sent", value: filtered.filter(r => r.emailSentAt).length, color: "#22c55e" },
            { label: "Total $", value: `$${filtered.filter(r => r.notificationStatus === "pending").reduce((a,r) => a + r.amountDue - r.billingCredits, 0).toLocaleString()}`, color: "var(--brand-primary)" },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      <div className="px-4 lg:px-6 space-y-2 mt-2">
        {filtered.length === 0 && (
          <div className="py-12 text-center rounded-2xl"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-check-circle text-4xl block mb-2" style={{ color: "#22c55e" }} />
            <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>All clear! No pending payments.</p>
          </div>
        )}
        {filtered.map(r => {
          const days = daysUntil(r.dueDate);
          const net = r.amountDue - r.billingCredits;
          const s = STATUS_COLORS[r.notificationStatus] || STATUS_COLORS.pending;
          const isUpdating = updating === r.id;
          return (
            <div key={r.id} className="rounded-2xl overflow-hidden"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <div className="flex items-start gap-3 p-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                  style={{ background: r.notificationStatus === "paid" ? "#22c55e" : "var(--brand-primary)" }}>
                  {r.clientName.split(" ").map(n => n[0]).join("").slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/clients/${r.clientId}`}
                        className="text-sm font-bold hover:underline"
                        style={{ color: "var(--brand-text)" }}>
                        {r.clientName}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs" style={{ color: days < 0 ? "#ef4444" : days <= 3 ? "#f59e0b" : "var(--brand-text-secondary)" }}>
                          {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today!" : `Due in ${days}d`}
                        </span>
                        <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>· {fmtDate(r.dueDate)}</span>
                      </div>
                      {r.notes && (
                        <p className="text-xs mt-1 italic" style={{ color: "var(--brand-text-secondary)" }}>{r.notes}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold" style={{ color: "var(--brand-text)" }}>${net.toLocaleString()}</p>
                      {r.billingCredits > 0 && (
                        <p className="text-xs" style={{ color: "#22c55e" }}>-${r.billingCredits} credit</p>
                      )}
                    </div>
                  </div>

                  {/* Status + actions */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: s.bg, color: s.color }}>
                      {s.label}
                    </span>
                    {r.emailSentAt && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "#22c55e20", color: "#22c55e" }}>
                        <i className="ti ti-mail text-[10px] mr-0.5" />Email sent
                      </span>
                    )}

                    {/* Action buttons */}
                    {r.notificationStatus !== "paid" && r.notificationStatus !== "cancelled" && (
                      <>
                        {!r.emailSentAt && r.notificationStatus !== "paused" && (
                          <button onClick={() => sendReminder(r)} disabled={isUpdating}
                            className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all"
                            style={{ background: "var(--brand-primary)", color: "white", opacity: isUpdating ? 0.5 : 1 }}>
                            {isUpdating ? "…" : "Send Email"}
                          </button>
                        )}
                        <button onClick={() => updateStatus(r.id, "paid")} disabled={isUpdating}
                          className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all"
                          style={{ background: "#22c55e20", color: "#22c55e", opacity: isUpdating ? 0.5 : 1 }}>
                          Mark Paid
                        </button>
                        {r.notificationStatus === "pending" && (
                          <button onClick={() => updateStatus(r.id, "paused")} disabled={isUpdating}
                            className="text-xs px-2.5 py-1 rounded-lg font-medium"
                            style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}>
                            Pause
                          </button>
                        )}
                        {r.notificationStatus === "paused" && (
                          <button onClick={() => updateStatus(r.id, "pending")} disabled={isUpdating}
                            className="text-xs px-2.5 py-1 rounded-lg font-medium"
                            style={{ background: "var(--brand-card)", color: "var(--brand-primary)" }}>
                            Resume
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
