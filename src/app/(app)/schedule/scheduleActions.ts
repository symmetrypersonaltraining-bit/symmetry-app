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
      // Checked, because Google has ALREADY been patched by the time we get
      // here. Unchecked, a refused write left the calendar showing the new time
      // and the app showing the old one, while this function returned
      // success — two systems disagreeing about when a client is training, and
      // nothing anywhere saying so.
      const { error } = await supabase.from('appointments').update(updates).eq('id', params.appointmentId);
      if (error) {
        return {
          success: false,
          error: `Google Calendar was updated but the app was not: ${error.message}. They now disagree — refresh and try again.`,
        };
      }
    }

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Two-way cancel sync (Dustin, 2026-07-09): reflect an in-app cancel onto the
// linked Google Calendar event by setting its color. '6' = orange (full cancel),
// '3' = grape/purple (half / vacation credit), null = clear back to default.
// Safe no-op for app-only sessions that have no gcal_event_id.
export async function setGCalEventColor(params: {
  appointmentId: string;
  colorId: string | null;
}): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: appt } = await supabase
      .from('appointments')
      .select('gcal_event_id')
      .eq('id', params.appointmentId)
      .maybeSingle();
    const eventId = (appt as { gcal_event_id?: string } | null)?.gcal_event_id;
    if (!eventId) return { success: true, skipped: true };
    const { token } = await getValidAccessToken();
    await gcalFetch(token, `/calendars/primary/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify({ colorId: params.colorId }),
    });
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

    // Same again, and worse on this path: the Google event is already gone, so
    // an unchecked failure here leaves a ghost appointment in the app that no
    // longer exists on the calendar — and says it was deleted.
    const { error } = params.deleteSeries
      ? await supabase
          .from('appointments')
          .delete()
          .like('gcal_event_id', `${params.gcalEventId.split('_')[0]}%`)
      : await supabase.from('appointments').delete().eq('id', params.appointmentId);
    if (error) {
      return {
        success: false,
        error: `The calendar event was deleted but the app session was not: ${error.message}. It will still show until this is retried.`,
      };
    }

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
