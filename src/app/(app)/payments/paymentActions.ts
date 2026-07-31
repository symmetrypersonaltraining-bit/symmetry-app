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

  // Next month's due date, clamped to that month's last day. Date.setMonth(+1)
  // overflows — a 31st due date rolled to Mar 3 instead of Feb 28.
  const [y, m, d] = String(reminder.due_date).split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nextDueStr = `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;

  // Insert BEFORE deleting, and only delete if the insert actually landed.
  // payment_reminders has no client_name column, so this insert was failing with
  // PGRST204 — unchecked — right after the current reminder had been deleted.
  // Marking a client paid quietly wiped their billing schedule.
  // Seed amount_due at 0, NOT the previous cycle's amount. Under the
  // sessions-trained rule (amount = sessions_trained x session_rate) next
  // cycle's amount is not knowable at roll-forward time — it is whatever they
  // actually train. Copying the old amount forward is how a stale number
  // survived from cycle to cycle. The editor computes it at send time.
  const { error: insErr } = await supabase.from('payment_reminders').insert({
    client_id: reminder.client_id,
    amount_due: 0,
    billing_credits: 0,
    due_date: nextDueStr,
    notification_status: 'pending',
  });
  if (insErr) {
    console.error('markClientPaid: could not roll the reminder forward', insErr.message);
    return; // leave the current reminder in place rather than lose the schedule
  }

  await supabase.from('payment_reminders').delete().eq('id', reminderId);
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
