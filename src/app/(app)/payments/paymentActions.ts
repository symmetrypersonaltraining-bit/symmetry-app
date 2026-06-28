'use server';
import { createClient } from '@/lib/supabase/server';

export async function markClientPaid(reminderId: string): Promise<void> {
  const supabase = await createClient();
  const { data: reminder } = await supabase
    .from('payment_reminders')
    .select('*')
    .eq('id', reminderId)
    .single();
  if (!reminder) return;
  // Compute next month's due date (Central time)
  const nextDue = new Date(reminder.due_date + 'T12:00:00-05:00');
  nextDue.setMonth(nextDue.getMonth() + 1);
  const nextDueStr = nextDue.toISOString().split('T')[0];
  // Delete current reminder
  await supabase.from('payment_reminders').delete().eq('id', reminderId);
  // Insert next month's reminder
  await supabase.from('payment_reminders').insert({
    client_id: reminder.client_id,
    client_name: reminder.client_name,
    amount_due: reminder.amount_due,
    billing_credits: 0,
    due_date: nextDueStr,
    notification_status: 'pending',
  });
}

export async function setPaymentStatus(
  reminderId: string,
  status: 'pending' | 'paused' | 'disabled'
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('payment_reminders')
    .update({ notification_status: status })
    .eq('id', reminderId);
}

export async function updateAmountDue(reminderId: string, amount: number): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('payment_reminders')
    .update({ amount_due: amount })
    .eq('id', reminderId);
}
