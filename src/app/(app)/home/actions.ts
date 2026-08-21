'use server';
import { createClient } from '@/lib/supabase/server';

/**
 * Returns null on success, or the reason it failed.
 *
 * It was `Promise<void>` with the write unchecked, and the caller removed the
 * reminder from the screen on the line BEFORE awaiting it. So an RLS refusal
 * looked exactly like a pause: the payment vanished off Home and came back at
 * the next refresh, by which point the trainer had stopped thinking about it.
 *
 * `.select('id')` matters as much as the error check. supabase-js does not
 * treat "updated zero rows" as an error, so a pause aimed at a reminder that
 * belongs to another trainer — or one that has already been deleted — returns
 * no error at all and changes nothing.
 */
export async function pausePaymentReminder(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('payment_reminders')
    .update({ notification_status: 'paused' })
    .eq('id', id)
    .select('id');
  if (error) return `Could not pause that reminder: ${error.message}`;
  if (!data || data.length === 0) {
    return 'That reminder is not yours to pause, or it is already gone. Refresh and try again.';
  }
  return null;
}
