import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function getValidAccessToken(): Promise<{ token: string; userId: string }> {
  const supabase = getServiceClient();

  const { data: settings } = await supabase
    .from('trainer_settings')
    .select('user_id, google_access_token, google_token_expiry, google_refresh_token, gcal_sync_enabled')
    .not('google_refresh_token', 'is', null)
    .single();

  if (!settings?.google_refresh_token) {
    throw new Error('Google Calendar not connected. Go to Settings to connect.');
  }

  if (!settings.gcal_sync_enabled) {
    throw new Error('GCal sync is disabled.');
  }

  const expiry = settings.google_token_expiry ? new Date(settings.google_token_expiry) : null;
  const now = new Date();
  const BUFFER_MS = 5 * 60 * 1000;

  if (settings.google_access_token && expiry && expiry.getTime() - now.getTime() > BUFFER_MS) {
    return { token: settings.google_access_token, userId: settings.user_id };
  }

  // Refresh
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: settings.google_refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to refresh Google token: ' + JSON.stringify(data));

  const newExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000);

  await supabase.from('trainer_settings').update({
    google_access_token: data.access_token,
    google_token_expiry: newExpiry.toISOString(),
  }).eq('user_id', settings.user_id);

  return { token: data.access_token, userId: settings.user_id };
}

export async function gcalFetch(token: string, path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch('https://www.googleapis.com/calendar/v3' + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error('GCal API error ' + res.status + ': ' + text);
  return text ? JSON.parse(text) : null;
}
