// v2
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, gcalFetch } from '@/lib/gcal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COLOR_CANCELLED = '6';
const COLOR_PAYMENT = '11';
const CRON_SECRET = process.env.CRON_SECRET;

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const resetFirst = body.reset === true;

  try {
    const { token } = await getValidAccessToken();
    const supabase = getAnonClient();

    const { data: clientRows } = await supabase.rpc('gcal_get_clients');
    const clients = clientRows as Array<{id: string; name: string}> | null;
    if (!clients?.length) return NextResponse.json({ error: 'No clients found' }, { status: 500 });

    const clientMap = clients.map((c: any) => ({
      id: c.id,
      name: (c.name || '').toLowerCase(),
      first: (c.name || '').split(' ')[0].toLowerCase(),
    }));

    function matchClient(summary: string): string | null {
      const s = (summary || '').toLowerCase();
      const full = clientMap.find(c => c.name.length > 0 && s.includes(c.name));
      if (full) return full.id;
      const first = clientMap.find(c => c.first.length > 2 && s.includes(c.first));
      if (first) return first.id;
      return null;
    }

    const now = new Date();
    const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 730 * 24 * 60 * 60 * 1000).toISOString();

    let allEvents: any[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', maxResults: '500', orderBy: 'startTime' });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await gcalFetch(token, '/calendars/primary/events?' + params.toString());
      allEvents = allEvents.concat(data.items || []);
      pageToken = data.nextPageToken;
    } while (pageToken);

    if (resetFirst) {
      await supabase.rpc('gcal_clear_appointments');
    }

    const appointmentBatch: any[] = [];
    const paymentBatch: any[] = [];

    for (const event of allEvents) {
      const colorId = event.colorId || null;
      const summary = event.summary || '';
      const isPayment = colorId === COLOR_PAYMENT || /\$\s?\d/.test(summary);
      if (!isPayment && colorId !== null && colorId !== COLOR_CANCELLED) continue;

      const clientId = matchClient(summary);
      if (!clientId) continue;

      if (isPayment) {
        const payDate = event.start?.date || event.start?.dateTime?.split('T')[0];
        if (!payDate) continue;
        paymentBatch.push({ client_id: clientId, title: summary, payment_date: payDate, google_event_id: event.id, source: 'gcal_sync' });
        continue;
      }

      if (!event.start?.dateTime) continue;
      appointmentBatch.push({
        client_id: clientId,
        scheduled_at: event.start.dateTime,
        ends_at: event.end?.dateTime || '',
        status: colorId === COLOR_CANCELLED ? 'cancelled_client' : 'scheduled',
        gcal_event_id: event.id,
        gcal_recurring_id: event.recurringEventId || '',
        title: summary,
        source: 'gcal',
      });
    }

    let synced = 0;
    let payments = 0;
    const errors: string[] = [];

    if (appointmentBatch.length > 0) {
      const { data: r, error: e } = await supabase.rpc('gcal_sync_appointments', { p_appointments: appointmentBatch });
      if (e) errors.push('appts: ' + e.message);
      else { synced = (r as any)?.synced || 0; ((r as any)?.errors || []).forEach((x: string) => errors.push(x)); }
    }

    if (paymentBatch.length > 0) {
      const { data: r, error: e } = await supabase.rpc('gcal_sync_payments', { p_payments: paymentBatch });
      if (e) errors.push('pays: ' + e.message);
      else { payments = (r as any)?.synced || 0; }
    }

    await supabase.rpc('gcal_generate_payment_notifications');

    const dollarEvents = allEvents.filter((e: any) => /\$\s?\d/.test(e.summary || ''));
    return NextResponse.json({ ok: true, synced, payments, total: allEvents.length, dollar_events: dollarEvents.length, dollar_samples: dollarEvents.slice(0, 3).map((e: any) => (e.summary || '') + ' | color:' + (e.colorId || 'none') + ' | start:' + JSON.stringify(e.start || {})), errors: errors.slice(0, 10) });
  } catch (e: any) {
    const msg = e.message || String(e);
    if (msg.includes('disabled') || msg.includes('not connected')) {
      return NextResponse.json({ skipped: true, reason: msg });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== 'Bearer ' + CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return POST(new NextRequest(req.url, { method: 'POST', headers: req.headers }));
}
