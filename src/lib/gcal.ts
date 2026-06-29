import { createClient } from '@supabase/supabase-js';

// Use anon key + SECURITY DEFINER RPCs — service role key in Vercel is misconfigured
function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function getValidAccessToken(): Promise<{ token: string; userId: string }> {
  const supabase = getAnonClient();

  const { data: rows, error: rpcErr } = await supabase.rpc('gcal_get_tokens');
  const settings = Array.isArray(rows) ? rows[0] : null;

  if (rpcErr) throw new Error('Failed to load tokens: ' + rpcErr.message);
  if (!settings?.google_refresh_token) {
    throw new Error('Google Calendar not connected. Go to Settings to connect.');
  }
  if (!settings.gcal_sync_enabled) {
    throw new Error('GCal sync is disabled.');
  }

  const expiry = settings.google_token_expiry ? new Date(settings.google_token_expiry) : null;
  const BUFFER_MS = 5 * 60 * 1000;

  if (settings.google_access_token && expiry && expiry.getTime() - Date.now() > BUFFER_MS) {
    return { token: settings.google_access_token, userId: settings.user_id };
  }

  // Refresh access token
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

  const newExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await supabase.rpc('gcal_update_access_token', {
    p_user_id: settings.user_id,
    p_access_token: data.access_token,
    p_token_expiry: newExpiry,
  });

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
