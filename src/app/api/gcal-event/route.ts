import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { action, event } = await req.json();
  // action: 'create' | 'update' | 'delete'
  // event: { gcal_event_id?, title, start, end, client_name }

  const baseUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${process.env.GOOGLE_OAUTH_TOKEN}`,
    'Content-Type': 'application/json',
  };

  const gcalEvent = {
    summary: event.title || event.client_name,
    start: { dateTime: event.start, timeZone: 'America/Chicago' },
    end: { dateTime: event.end, timeZone: 'America/Chicago' },
  };

  let res: Response;
  if (action === 'create') {
    res = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(gcalEvent) });
  } else if (action === 'update' && event.gcal_event_id) {
    res = await fetch(`${baseUrl}/${event.gcal_event_id}`, { method: 'PATCH', headers, body: JSON.stringify(gcalEvent) });
  } else if (action === 'delete' && event.gcal_event_id) {
    res = await fetch(`${baseUrl}/${event.gcal_event_id}`, { method: 'DELETE', headers });
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  if (!res || !res.ok) {
    const text = await res?.text();
    return NextResponse.json({ error: text }, { status: 502 });
  }

  const data = action === 'delete' ? {} : await res.json();
  return NextResponse.json({ success: true, gcal_event_id: data.id });
}
