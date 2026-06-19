"use client";

import Link from "next/link";
import { useState } from "react";

interface Reminder {
  id: string;
  clientName: string;
  clientId: string;
  dueDate: string;
  amountDue: number;
  billingCredits: number;
  notificationStatus: string;
  smsSentAt: string | null;
}

interface Props {
  reminders: Reminder[];
}

export default function PendingRemindersPanel({ reminders }: Props) {
  const [expanded, setExpanded] = useState(false);
  const display = expanded ? reminders : reminders.slice(0, 4);

  function daysUntil(dateStr: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + "T00:00:00");
    return Math.round((due.getTime() - today.getTime()) / 86400000);
  }

  function fmtDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function urgencyColor(days: number) {
    if (days <= 2) return "#ef4444";
    if (days <= 7) return "#f59e0b";
    return "var(--brand-text-secondary)";
  }

  const totalDue = reminders.reduce((a, r) => a + r.amountDue - r.billingCredits, 0);
  const overdue = reminders.filter(r => daysUntil(r.dueDate) < 0);
  const dueSoon = reminders.filter(r => { const d = daysUntil(r.dueDate); return d >= 0 && d <= 7; });

  if (reminders.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden mb-6"
      style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--brand-border)", background: "var(--brand-card)" }}>
        <div className="flex items-center gap-2.5">
          <i className="ti ti-credit-card text-lg" style={{ color: "var(--brand-primary)" }} />
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>Upcoming Payments</p>
            <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
              {reminders.length} due · ${totalDue.toLocaleString()} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {overdue.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: "#ef444420", color: "#ef4444" }}>
              {overdue.length} overdue
            </span>
          )}
          {dueSoon.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: "#f59e0b20", color: "#f59e0b" }}>
              {dueSoon.length} this week
            </span>
          )}
          <Link href="/payments"
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
            style={{ background: "var(--brand-primary)", color: "white" }}>
            Manage
          </Link>
        </div>
      </div>

      {/* Reminder rows */}
      <div>
        {display.map((r, i) => {
          const days = daysUntil(r.dueDate);
          const net = r.amountDue - r.billingCredits;
          const color = urgencyColor(days);
          const isPaused = r.notificationStatus === "paused";
          return (
            <div key={r.id}
              className={`flex items-center gap-3 px-4 py-3 ${i < display.length - 1 ? "border-b" : ""}`}
              style={{ borderColor: "var(--brand-border)" }}>
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                style={{ background: isPaused ? "#6b7280" : days <= 2 ? "#ef4444" : "var(--brand-primary)" }}>
                {r.clientName.split(" ").map(n => n[0]).join("").slice(0,2)}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <Link href={`/clients/${r.clientId}`}
                  className="text-sm font-semibold truncate hover:underline"
                  style={{ color: "var(--brand-text)" }}>
                  {r.clientName}
                </Link>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs" style={{ color }}>
                    {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d`}
                  </span>
                  <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>· {fmtDate(r.dueDate)}</span>
                  {r.smsSentAt && (
                    <span className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: "#22c55e20", color: "#22c55e" }}>
                      SMS sent
                    </span>
                  )}
                  {isPaused && (
                    <span className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}>
                      Paused
                    </span>
                  )}
                </div>
              </div>
              {/* Amount */}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>
                  ${net.toLocaleString()}
                </p>
                {r.billingCredits > 0 && (
                  <p className="text-xs" style={{ color: "#22c55e" }}>-${r.billingCredits} credit</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more */}
      {reminders.length > 4 && (
        <button onClick={() => setExpanded(e => !e)}
          className="w-full py-2.5 text-xs font-semibold transition-colors"
          style={{ borderTop: "1px solid var(--brand-border)", color: "var(--brand-primary)", background: "var(--brand-card)" }}>
          {expanded ? "Show less ↑" : `Show ${reminders.length - 4} more ↓`}
        </button>
      )}
    </div>
  );
}
