import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const REDIRECT_URI = 'https://symmetry-app-omega.vercel.app/api/auth/google/callback';
const APP_URL = 'https://symmetry-app-omega.vercel.app';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const userId = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');
  console.log('[gcal-cb] code:', !!code, 'userId:', userId, 'error:', error);
  if (error || !code || !userId) return NextResponse.redirect(APP_URL + '/settings?gcal=error');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
  });
  const tokens = await tokenRes.json();
  console.log('[gcal-cb] status:', tokenRes.status, 'access:', !!tokens.access_token, 'refresh:', !!tokens.refresh_token, 'err:', tokens.error);
  if (!tokenRes.ok || !tokens.access_token) return NextResponse.redirect(APP_URL + '/settings?gcal=error');

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const expiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
  const upsertData: any = { user_id: userId, google_access_token: tokens.access_token, google_token_expiry: expiry.toISOString(), gcal_sync_enabled: true };
  if (tokens.refresh_token) upsertData.google_refresh_token = tokens.refresh_token;
  const { error: dbErr } = await supabase.from('trainer_settings').upsert(upsertData, { onConflict: 'user_id' });
  console.log('[gcal-cb] db error:', dbErr);

  return NextResponse.redirect(APP_URL + '/settings?gcal=connected');
}
