'use server';
import { createClient } from '@/lib/supabase/server';

// ── These return an error STRING instead of void, and that is the whole point ─
//
// Every one of them was `Promise<void>` with the write unchecked, and every
// caller in PaymentsClient.tsx applies its optimistic state update on the very
// next line, unconditionally. So an RLS refusal, a dropped connection or a
// column that does not exist produced exactly the same thing on screen as
// success: the row moved, the amount changed, the reminder vanished — until the
// next refresh put it all back. On a money screen that is the worst possible
// failure, because the trainer has already moved on believing it took.
//
// null means it worked. A string is the reason it did not, and the caller shows
// it and skips the optimistic update.

export async function markClientPaid(reminderId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: reminder } = await supabase
    .from('payment_reminders')
    .select('*')
    .eq('id', reminderId)
    .single();
  if (!reminder) return 'That reminder no longer exists — refresh the page.';

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
    // Leave the current reminder in place rather than lose the schedule.
    return `Could not create next cycle's reminder: ${insErr.message}`;
  }

  // Checked too. An unchecked delete here leaves the client with BOTH the old
  // reminder and the new one, and the screen says paid.
  const { error: delErr } = await supabase.from('payment_reminders').delete().eq('id', reminderId);
  if (delErr) {
    return `Next cycle was created, but the paid reminder is still showing: ${delErr.message}`;
  }
  return null;
}

export async function setPaymentStatus(
  reminderId: string,
  status: 'pending' | 'paused' | 'disabled'
): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('payment_reminders')
    .update({ notification_status: status })
    .eq('id', reminderId);
  return error ? `Could not change that reminder to ${status}: ${error.message}` : null;
}

export async function updateAmountDue(reminderId: string, amount: number): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('payment_reminders')
    .update({ amount_due: amount })
    .eq('id', reminderId);
  return error ? `Could not save that amount: ${error.message}` : null;
}
