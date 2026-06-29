import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, gcalFetch } from '@/lib/gcal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GCal color IDs
const COLOR_SESSION = null;    // default blue = client session
const COLOR_CANCELLED = '6';  // tangerine orange = cancelled
const COLOR_PAYMENT = '11';   // tomato red = payment

const CRON_SECRET = process.env.CRON_SECRET;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  // Auth: allow cron or authenticated trainer
  const authHeader = req.headers.get('authorization');
  const isCron = CRON_SECRET && authHeader === 'Bearer ' + CRON_SECRET;
  if (!isCron) {
    // Check if request is from the app itself (internal)
    const host = req.headers.get('host') || '';
    const referer = req.headers.get('referer') || '';
    if (!referer.includes('symmetry-app-omega.vercel.app') && !host.includes('vercel.app')) {
      // Allow for now in dev
    }
  }

  const body = await req.json().catch(() => ({}));
  const resetFirst = body.reset === true;

  try {
    const { token } = await getValidAccessToken();
    const supabase = getServiceClient();

    // Load clients for name matching
    const { data: clients } = await supabase.from('clients').select('id, name');
    if (!clients?.length) return NextResponse.json({ error: 'No clients found' }, { status: 500 });

    // Build client name lookup (first name + full name)
    const clientMap: Array<{ id: string; name: string; first: string }> = clients.map((c: any) => ({
      id: c.id,
      name: (c.name || '').toLowerCase(),
      first: (c.name || '').split(' ')[0].toLowerCase(),
    }));

    function matchClient(summary: string): string | null {
      const s = (summary || '').toLowerCase();
      // Full name match first (more specific)
      const full = clientMap.find(c => c.name.length > 0 && s.includes(c.name));
      if (full) return full.id;
      // First name match
      const first = clientMap.find(c => c.first.length > 2 && s.includes(c.first));
      if (first) return first.id;
      return null;
    }

    // Date range: 6 weeks back, 6 weeks forward
    const now = new Date();
    const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 730 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch from GCal with pagination
    let allEvents: any[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        maxResults: '500',
        orderBy: 'startTime',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const data = await gcalFetch(token, '/calendars/primary/events?' + params.toString());
      allEvents = allEvents.concat(data.items || []);
      pageToken = data.nextPageToken;
    } while (pageToken);

    // Clear existing appointments if reset requested
    if (resetFirst) {
      await supabase.from('appointments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    let synced = 0;
    let payments = 0;
    const errors: string[] = [];

    for (const event of allEvents) {
      const colorId = event.colorId || null;
      const summary = event.summary || '';

      // Only handle our three colors
      if (colorId !== null && colorId !== COLOR_CANCELLED && colorId !== COLOR_PAYMENT) continue;

      // Match to a client
      const clientId = matchClient(summary);
      if (!clientId) continue; // personal event

      if (colorId === COLOR_PAYMENT) {
        // Red = payment event -> calendar_payments table
        const payDate = event.start?.date || event.start?.dateTime?.split('T')[0];
        if (!payDate) continue;
        const { error } = await supabase.from('calendar_payments').upsert({
          client_id: clientId,
          title: summary,
          payment_date: payDate,
          google_event_id: event.id,
          source: 'gcal_sync',
        }, { onConflict: 'google_event_id' });
        if (error) errors.push('payment ' + summary + ': ' + error.message);
        else payments++;
        continue;
      }

      // Blue (null) or Orange (6) = session appointment
      if (!event.start?.dateTime) continue; // skip all-day session events

      const status = colorId === COLOR_CANCELLED ? 'cancelled_client' : 'scheduled';
      const appt = {
        client_id: clientId,
        scheduled_at: event.start.dateTime,
        ends_at: event.end?.dateTime || null,
        status,
        gcal_event_id: event.id,
        gcal_recurring_id: event.recurringEventId || null,
        title: summary,
        source: 'gcal',
      };

      const { error } = await supabase.from('appointments').upsert(appt, { onConflict: 'gcal_event_id' });
      if (error) errors.push(summary + ': ' + error.message);
      else synced++;
    }

    // Generate client payment notifications for reminders due in 7 days
    await generatePaymentNotifications(supabase);

    return NextResponse.json({
      ok: true,
      synced,
      payments,
      total: allEvents.length,
      errors: errors.slice(0, 10),
    });
  } catch (e: any) {
    const msg = e.message || String(e);
    if (msg.includes('disabled') || msg.includes('not connected')) {
      return NextResponse.json({ skipped: true, reason: msg });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function generatePaymentNotifications(supabase: any) {
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split('T')[0];
  const sevenStr = sevenDays.toISOString().split('T')[0];

  // Find pending reminders due in next 7 days
  const { data: reminders } = await supabase
    .from('payment_reminders')
    .select('id, client_id, due_date, amount_due, billing_credits, clients(id, name)')
    .gte('due_date', todayStr)
    .lte('due_date', sevenStr)
    .eq('notification_status', 'pending');

  if (!reminders?.length) return;

  for (const r of reminders) {
    const client = r.clients;
    if (!client) continue;

    const net = Number(r.amount_due) - Number(r.billing_credits || 0);
    const due = new Date(r.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Check if notification already exists for this reminder
    const { data: existing } = await supabase
      .from('client_notifications')
      .select('id')
      .eq('payment_reminder_id', r.id)
      .is('dismissed_at', null)
      .single();

    if (existing) continue; // already notified

    await supabase.from('client_notifications').insert({
      client_id: r.client_id,
      type: 'payment_due',
      title: 'Payment Due ' + due,
      body: 'Your payment of $' + net.toFixed(0) + ' is due on ' + due + '.',
      amount_due: net,
      due_date: r.due_date,
      payment_reminder_id: r.id,
    });
  }
}

export async function GET(req: NextRequest) {
  // Cron endpoint
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== 'Bearer ' + CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return POST(new NextRequest(req.url, { method: 'POST', headers: req.headers }));
}
