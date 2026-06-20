import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PaymentsClient from "./PaymentsClient";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== TRAINER_EMAIL) redirect("/home");

  // Fetch all active clients (non-self-coached) with their current_fees
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, email, current_fees, training_frequency")
    .eq("is_self_coached", false)
    .order("name");

  // Fetch all payment reminders (upcoming + recent)
  const { data: reminders } = await supabase
    .from("payment_reminders")
    .select("id, client_id, due_date, amount_due, billing_credits, notification_status, email_sent_at, reminder_sent_at, notes, approved_at")
    .order("due_date", { ascending: true });

  // Build a map of clientId -> most recent reminder
  const remindersByClient: Record<string, any[]> = {};
  for (const r of reminders || []) {
    if (!remindersByClient[r.client_id]) remindersByClient[r.client_id] = [];
    remindersByClient[r.client_id].push(r);
  }

  // Merge: clients with reminders get their reminder data; clients without get a stub
  const mapped = (clients || []).map((c: any) => {
    const clientReminders = remindersByClient[c.id] || [];
    // Sort: pending first, then by due_date asc
    const sorted = [...clientReminders].sort((a, b) => {
      const aIsPaid = a.notification_status === "paid" || a.notification_status === "cancelled";
      const bIsPaid = b.notification_status === "paid" || b.notification_status === "cancelled";
      if (aIsPaid !== bIsPaid) return aIsPaid ? 1 : -1;
      return a.due_date < b.due_date ? -1 : 1;
    });
    const active = sorted[0] || null;
    return {
      clientId: c.id,
      clientName: c.name,
      clientEmail: c.email || null,
      currentFees: c.current_fees ? Number(c.current_fees) : null,
      trainingFrequency: c.training_frequency || null,
      // Reminder fields (null if no reminder row)
      reminderId: active?.id || null,
      dueDate: active?.due_date || null,
      amountDue: active ? Number(active.amount_due) : (c.current_fees ? Number(c.current_fees) : 0),
      billingCredits: active ? Number(active.billing_credits || 0) : 0,
      notificationStatus: active?.notification_status || "no_reminder",
      emailSentAt: active?.email_sent_at || null,
      approvedAt: active?.approved_at || null,
      notes: active?.notes || null,
      hasReminder: !!active,
      allReminders: sorted.slice(0, 5).map((r: any) => ({
        id: r.id,
        dueDate: r.due_date,
        amountDue: Number(r.amount_due),
        notificationStatus: r.notification_status,
        emailSentAt: r.email_sent_at,
      })),
    };
  });

  return <PaymentsClient clients={mapped} />;
}
