"use client";

// Billing records — every past bill, with what it was made of.
//
// Dustin, 20 Aug: "billing records where they or I can pull up past invoices w
// details."
//
// Before this, there was no past-invoice view in the app at all — not for a
// client, not for the trainer beyond a strip of date-and-amount chips on the
// payments screen. A client asking "what was July?" had no answer except the
// trainer screenshotting his own tooling.
//
// Reads the reminder's stored `credit_details`, which is what the amount was
// calculated from. Nothing here recomputes anything: a records view that
// recalculates is a records view that can disagree with the bill it is
// supposedly recording.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseInvoiceDetail, invoiceLines, shortDate, type InvoiceDetail } from "@/lib/invoiceDetail";

interface Row {
  id: string;
  due_date: string;
  amount: number;
  status: string;
  paidAt: string | null;
  note: string | null;
  detail: InvoiceDetail;
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  sent: "Due",
  pending: "Draft",
  paused: "Paused",
  disabled: "Off",
};

export default function BillingHistory({ clientId }: { clientId?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const sup = createClient() as any;
        let cid = clientId;
        if (!cid) {
          const { data: u } = await sup.auth.getUser();
          if (!u?.user?.id) return;
          const { data: me } = await sup.from("clients").select("id").eq("auth_user_id", u.user.id).limit(1);
          cid = me?.[0]?.id;
        }
        if (!cid) return;
        const { data } = await sup
          .from("payment_reminders")
          .select("id, due_date, amount_due, notification_status, paid_confirmed_at, sms_message, credit_details, half_price_sessions")
          .eq("client_id", cid)
          // Drafts are not records. A pending row is still being recalculated on
          // every calendar sync and showing it as history would show a number
          // that changes by itself.
          .in("notification_status", ["sent", "paid"])
          .order("due_date", { ascending: false })
          .limit(24);
        setRows(
          (data || []).map((r: any) => ({
            id: r.id,
            due_date: r.due_date,
            amount: Number(r.amount_due),
            status: r.notification_status,
            paidAt: r.paid_confirmed_at,
            note: r.sms_message,
            detail: parseInvoiceDetail(r.credit_details, r.half_price_sessions),
          })),
        );
      } catch {
        /* never break the page this sits on */
      } finally {
        setLoaded(true);
      }
    })();
  }, [clientId]);

  if (!loaded || rows.length === 0) return null;

  const fmtDue = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return Number.isNaN(dt.getTime())
      ? d
      : dt.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="rounded-3xl p-4" style={{ background: "var(--brand-card)", border: "1px solid var(--brand-border)" }}>
      <div className="text-sm font-bold mb-1" style={{ color: "var(--brand-text)" }}>Billing records</div>
      <div className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
        Tap any line to see what it was made of.
      </div>

      <div className="space-y-1.5">
        {rows.map((r) => {
          const isOpen = open === r.id;
          const sum = invoiceLines(r.detail, r.amount);
          return (
            <div key={r.id} className="rounded-2xl overflow-hidden"
              style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
              <button onClick={() => setOpen(isOpen ? null : r.id)}
                className="w-full flex items-center justify-between gap-2 p-3 text-left"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <span className="min-w-0">
                  <span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>
                    {"$" + r.amount}
                  </span>
                  <span className="block text-xs truncate" style={{ color: "var(--brand-text-secondary)" }}>
                    {(r.detail.cycleStart && r.detail.cycleEnd
                      ? shortDate(r.detail.cycleStart) + " – " + shortDate(r.detail.cycleEnd)
                      : "Due " + fmtDue(r.due_date))}
                  </span>
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full"
                    style={r.status === "paid"
                      ? { background: "#16A34A22", color: "#16A34A" }
                      : { background: "#f59e0b22", color: "#f59e0b" }}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                  <i className={`ti ti-chevron-${isOpen ? "up" : "down"} text-base`}
                    style={{ color: "var(--brand-text-secondary)" }} />
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 text-xs space-y-1" style={{ color: "var(--brand-text-secondary)" }}>
                  <div style={{ height: 1, background: "var(--brand-border)", margin: "2px 0 8px" }} />
                  {sum.map((l, li) => (
                    <div key={li} className="flex items-baseline gap-2"
                      style={{
                        fontWeight: l.tone === "muted" ? 400 : 700,
                        color: l.tone === "credit" ? "#22c55e"
                             : l.tone === "muted" ? "var(--brand-text-secondary)"
                             : "var(--brand-text)",
                        borderTop: l.tone === "total" ? "1px solid var(--brand-border)" : undefined,
                        paddingTop: l.tone === "total" ? 4 : undefined,
                        marginTop: l.tone === "total" ? 2 : undefined,
                      }}>
                      <span>{l.label}</span>
                      <span className="ml-auto tabular-nums">{l.value}</span>
                    </div>
                  ))}
                  <div>{"Due " + fmtDue(r.due_date)}</div>
                  {r.detail.datesTrained.length > 0 && (
                    <div>{"Trained (" + r.detail.datesTrained.length + "): " +
                      r.detail.datesTrained.map(shortDate).join(", ")}</div>
                  )}
                  {r.detail.datesCancelled.length > 0 && (
                    <div>{"Cancelled (" + r.detail.datesCancelled.length + "): " +
                      r.detail.datesCancelled.map(shortDate).join(", ") +
                      (r.detail.cancelDeduction > 0 ? " — taken off" : "")}</div>
                  )}
                  {r.detail.halfPriceSessions > 0 && (
                    <div>{r.detail.halfPriceSessions + " remote at half rate — $" + r.detail.halfPriceDeduction + " off"}</div>
                  )}
                  {r.note && <div style={{ fontStyle: "italic" }}>{r.note}</div>}
                  {r.status === "paid" && r.paidAt && (
                    <div style={{ color: "#16A34A" }}>
                      {"Paid " + new Date(r.paidAt).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" })}
                    </div>
                  )}
                  {sum.length === 0 && r.detail.datesTrained.length === 0 && r.detail.datesCancelled.length === 0 && (
                    <div style={{ opacity: 0.7 }}>No session detail was recorded for this one.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
