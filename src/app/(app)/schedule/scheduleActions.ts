'use server';
import { createClient } from '@/lib/supabase/server';
import { getValidAccessToken, gcalFetch } from '@/lib/gcal';

export async function updateGCalEvent(params: {
  appointmentId: string;
  gcalEventId: string;
  title?: string;
  startIso?: string;
  endIso?: string;
  updateSeries?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { token } = await getValidAccessToken();

    const patch: Record<string, unknown> = {};
    if (params.title !== undefined) patch.summary = params.title;
    if (params.startIso && params.endIso) {
      patch.start = { dateTime: params.startIso, timeZone: 'America/Chicago' };
      patch.end = { dateTime: params.endIso, timeZone: 'America/Chicago' };
    }

    const eventId = params.updateSeries
      ? params.gcalEventId.split('_')[0]
      : params.gcalEventId;

    await gcalFetch(token, `/calendars/primary/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });

    const updates: Record<string, unknown> = {};
    if (params.title !== undefined) updates.title = params.title;
    if (params.startIso) updates.scheduled_at = params.startIso;
    if (params.endIso) updates.ends_at = params.endIso;

    if (Object.keys(updates).length > 0) {
      await supabase.from('appointments').update(updates).eq('id', params.appointmentId);
    }

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteGCalEvent(params: {
  appointmentId: string;
  gcalEventId: string;
  deleteSeries?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { token } = await getValidAccessToken();

    const eventId = params.deleteSeries
      ? params.gcalEventId.split('_')[0]
      : params.gcalEventId;

    await gcalFetch(token, `/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
    });

    if (params.deleteSeries) {
      const baseId = params.gcalEventId.split('_')[0];
      await supabase
        .from('appointments')
        .delete()
        .like('gcal_event_id', `${baseId}%`);
    } else {
      await supabase.from('appointments').delete().eq('id', params.appointmentId);
    }

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
