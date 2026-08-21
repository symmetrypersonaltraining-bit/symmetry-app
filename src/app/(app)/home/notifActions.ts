'use server';
import { createClient } from '@/lib/supabase/server';

/**
 * Both return null on success, or the reason they failed.
 *
 * These were `Promise<void>` with the write unchecked. The dismiss one is the
 * one that mattered: the banner is removed from the client's screen on the
 * line before the await, so a refused write meant a payment notice they had
 * dismissed reappeared at the next refresh with no explanation. A notification
 * that will not stay dismissed reads as a broken app, and the client has no
 * way to tell that from being nagged on purpose.
 *
 * `.select('id')` as well as the error check: an update matching zero rows —
 * somebody else's notification, or one already gone — is not an error here.
 */
export async function dismissClientNotification(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_notifications')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) return `Could not dismiss that: ${error.message}`;
  if (!data || data.length === 0) return 'That notice could not be dismissed. Refresh and try again.';
  return null;
}

export async function markClientNotificationRead(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_notifications')
    .update({ is_read: true })
    .eq('id', id)
    .select('id');
  if (error) return `Could not mark that read: ${error.message}`;
  if (!data || data.length === 0) return 'That notice could not be marked read.';
  return null;
}
