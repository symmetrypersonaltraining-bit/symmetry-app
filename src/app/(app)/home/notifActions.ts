'use server';
import { createClient } from '@/lib/supabase/server';

export async function dismissClientNotification(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('client_notifications')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id);
}

export async function markClientNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('client_notifications')
    .update({ is_read: true })
    .eq('id', id);
}
