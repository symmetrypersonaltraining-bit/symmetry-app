import { createClient } from '@supabase/supabase-js';

// Google OAuth tokens are read and written through SECURITY DEFINER RPCs. Those
// used to be called with the ANON key, on the note that "service role key in
// Vercel is misconfigured".
//
// That combination is the problem, not a workaround for it. The anon key is
// published — it ships in the JavaScript bundle of every client's app. So
// `gcal_get_tokens()`, which returns the trainer's Google ACCESS AND REFRESH
// TOKENS in plaintext, was callable by anyone who opened devtools. A refresh
// token does not expire on its own; whoever held it had read and write access
// to the trainer's entire Google Calendar until it was manually revoked.
//
// There is no way to fix this at the database layer alone: a request from our
// own server carrying the anon key is indistinguishable from an attacker's.
// The credential has to change. These calls now use the service-role key, which
// is server-only and never reaches a browser, and EXECUTE on the token RPCs is
// revoked from PUBLIC and anon.
//
// If SUPABASE_SERVICE_ROLE_KEY really is missing or wrong, this throws with a
// message that says exactly that, rather than falling back to the anon key and
// quietly leaving the hole open.
function getServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Google Calendar tokens are only ' +
      'readable with the service role — the anon key is public and its access ' +
      'to these RPCs has been revoked. Set the variable in Vercel (Production) ' +
      'and redeploy.'
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function getValidAccessToken(): Promise<{ token: string; userId: string }> {
  const supabase = getServiceClient();

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
