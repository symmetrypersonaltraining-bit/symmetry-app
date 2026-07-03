import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PaymentsClient from "./PaymentsClient";
import ReminderEditor from "@/components/ReminderEditor";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.email !== TRAINER_EMAIL) redirect("/home");

  // All clients with fee/frequency info
  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, name, email, current_fees, training_frequency")
    .order("name");

  // All payment reminders (newest first per client for history)
  const { data: reminderRows } = await supabase
    .from("payment_reminders")
    .select("id, client_id, due_date, amount_due, billing_credits, notification_status, sms_sent_at, approved_at, notes")
    .order("due_date", { ascending: false });

  // Cancelled sessions per client in last 35 days (one billing cycle)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 35);
  const { data: cancelledRows } = await supabase
    .from("appointments")
    .select("client_id")
    .eq("status", "cancelled_client")
    .gte("scheduled_at", cutoff.toISOString());

  const cancelledCount: Record<string, number> = {};
  for (const apt of (cancelledRows || [])) {
    cancelledCount[apt.client_id] = (cancelledCount[apt.client_id] || 0) + 1;
  }

  // Group reminders by client_id (newest first)
  const byClient: Record<string, any[]> = {};
  for (const r of (reminderRows || [])) {
    if (!byClient[r.client_id]) byClient[r.client_id] = [];
    byClient[r.client_id].push(r);
  }

  const clients = (clientRows || []).map((c: any) => {
    const reminders = byClient[c.id] || [];
    // Current = most recent non-paid, else most recent overall
    const cur = reminders.find(r => r.notification_status !== "paid") ?? reminders[0] ?? null;
    return {
      clientId: c.id,
      clientName: c.name,
      clientEmail: c.email ?? null,
      currentFees: c.current_fees != null ? Number(c.current_fees) : null,
      trainingFrequency: c.training_frequency != null ? Number(c.training_frequency) : null,
      missedSessions: cancelledCount[c.id] ?? 0,
      reminderId: cur?.id ?? null,
      dueDate: cur?.due_date ?? null,
      amountDue: cur ? Number(cur.amount_due) : (c.current_fees ? Number(c.current_fees) : 0),
      billingCredits: cur ? Number(cur.billing_credits ?? 0) : 0,
      notificationStatus: cur?.notification_status ?? "no_reminder",
      emailSentAt: cur?.sms_sent_at ?? null,
      approvedAt: cur?.approved_at ?? null,
      notes: cur?.notes ?? null,
      hasReminder: !!cur,
      allReminders: reminders.map(r => ({
        id: r.id,
        dueDate: r.due_date,
        amountDue: Number(r.amount_due),
        notificationStatus: r.notification_status,
        emailSentAt: r.sms_sent_at ?? null,
      })),
    };
  });

  return (
    <>
      <ReminderEditor />
      <PaymentsClient clients={clients} />
    </>
  );
}
