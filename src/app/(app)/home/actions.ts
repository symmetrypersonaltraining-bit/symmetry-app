'use server';
import { createClient } from '@/lib/supabase/server';

export async function pausePaymentReminder(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('payment_reminders')
    .update({ notification_status: 'paused' })
    .eq('id', id);
}