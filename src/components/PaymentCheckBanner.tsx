"use client";

// Trainer-home payment notifications. Persistent until actioned (no dismiss):
// - amber: reminder due within 7 days, still pending -> review & approve on /payments
// - red: reminder due today/past, published to client, not yet confirmed paid
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Item { id: string; name: string; due: string; amount: number; kind: "review" | "confirm"; }

export default function PaymentCheckBanner() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const sup = createClient() as any;
        const todayCT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        const soon = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        const { data: rems } = await sup
          .from("payment_reminders")
          .select("id, client_id, due_date, amount_due, notification_status")
          .in("notification_status", ["pending", "sent"])
          .lte("due_date", soon)
          .order("due_date");
        if (!rems || rems.length === 0) return;
        const ids = Array.from(new Set(rems.map((r: any) => r.client_id)));
        const { data: cls } = await sup.from("clients").select("id, name").in("id", ids);
        const nameOf: Record<string, string> = {};
        (cls || []).forEach((c: any) => { nameOf[c.id] = (c.name || "").split(" ")[0]; });
        const out: Item[] = [];
        rems.forEach((r: any) => {
          if (r.notification_status === "sent" && r.due_date <= todayCT) {
            out.push({ id: r.id, name: nameOf[r.client_id] || "?", due: r.due_date, amount: Number(r.amount_due), kind: "confirm" });
          } else if (r.notification_status === "pending") {
            out.push({ id: r.id, name: nameOf[r.client_id] || "?", due: r.due_date, amount: Number(r.amount_due), kind: "review" });
          }
        });
        setItems(out);
      } catch {
        // banner must never break the home page
      }
    })();
  }, []);

  if (items.length === 0) return null;
  const confirms = items.filter((i) => i.kind === "confirm");
  const reviews = items.filter((i) => i.kind === "review");

  return (
    <div className="space-y-2">
      {confirms.length > 0 && (
        <Link href="/payments" className="block rounded-3xl p-3"
          style={{ background: "#ef444418", border: "1px solid #ef4444" }}>
          <div className="text-sm font-bold" style={{ color: "#ef4444" }}>
            {"💰 Confirm payment" + (confirms.length > 1 ? "s" : "") + ": " + confirms.map((i) => i.name + " $" + i.amount + " (due " + i.due.slice(5) + ")").join(" · ")}
          </div>
          <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Tap to confirm they paid — stays here until you do</div>
        </Link>
      )}
      {reviews.length > 0 && (
        <Link href="/payments" className="block rounded-3xl p-3"
          style={{ background: "#f59e0b18", border: "1px solid #f59e0b" }}>
          <div className="text-sm font-bold" style={{ color: "#b45309" }}>
            {"🧾 Review & approve: " + reviews.map((i) => i.name + " $" + i.amount + " (due " + i.due.slice(5) + ")").join(" · ")}
          </div>
          <div className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Due within 7 days — check, edit, approve to notify the client</div>
        </Link>
      )}
    </div>
  );
}
