import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // 1. Get all client names for matching
    const { data: clients } = await supabase.from('clients').select('id, name, full_name');
    if (!clients) return NextResponse.json({ error: 'No clients' }, { status: 500 });

    // 2. Fetch GCal events
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 84 * 24 * 60 * 60 * 1000).toISOString();

    const gcalRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${future}&singleEvents=true&maxResults=500&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${process.env.GOOGLE_OAUTH_TOKEN}` } }
    );

    if (!gcalRes.ok) {
      return NextResponse.json({ error: 'GCal fetch failed', status: gcalRes.status }, { status: 502 });
    }

    const gcalData = await gcalRes.json();
    const events = gcalData.items || [];

    // 3. Filter and match to clients
    const EXCLUDED_COLORS = ['2', '11'];
    let synced = 0;
    const errors: string[] = [];

    for (const event of events) {
      if (EXCLUDED_COLORS.includes(event.colorId)) continue;
      if (!event.start?.dateTime) continue; // skip all-day events

      const summary = (event.summary || '').toLowerCase();
      const matchedClient = clients.find((c: any) => {
        const clientName = (c.full_name || c.name || '').toLowerCase();
        const firstName = clientName.split(' ')[0];
        return summary.includes(firstName) || summary.includes(clientName);
      });

      if (!matchedClient) continue;

      const status = event.colorId === '6' ? 'cancelled_client' : 'scheduled';

      const appointment = {
        client_id: matchedClient.id,
        scheduled_at: event.start.dateTime,
        ends_at: event.end?.dateTime || null,
        status,
        gcal_event_id: event.id,
        title: event.summary || null,
        source: 'gcal',
      };

      const { error } = await supabase
        .from('appointments')
        .upsert(appointment, { onConflict: 'gcal_event_id' });

      if (error) errors.push(`${event.summary}: ${error.message}`);
      else synced++;
    }

    return NextResponse.json({ synced, errors });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return POST(new NextRequest('http://localhost/api/gcal-sync', { method: 'POST' }));
}
