import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Per instance: an OAuth callback pinned to one deployment sends another
// instance's trainer to that deployment when they connect their calendar.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://symmetry-app-omega.vercel.app';
const REDIRECT_URI = `${APP_ORIGIN}/api/auth/google/callback`;
const APP_URL = APP_ORIGIN;

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const userId = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  console.log('[gcal-cb] start code:', !!code, 'userId:', userId, 'error:', error);
  if (error || !code || !userId) {
    return NextResponse.redirect(APP_URL + '/settings?gcal=error&reason=missing_params');
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json();
  console.log('[gcal-cb] token status:', tokenRes.status, 'access:', !!tokens.access_token, 'refresh:', !!tokens.refresh_token, 'error:', tokens.error);

  if (!tokenRes.ok || !tokens.access_token) {
    return NextResponse.redirect(APP_URL + '/settings?gcal=error&reason=token_exchange');
  }

  // Service role, not the anon key. save_google_tokens WRITES the trainer's
  // Google refresh token, and the anon key is published in every client's
  // browser bundle — anyone could have called this and replaced the stored
  // credentials with their own, pointing the whole sync at a calendar they
  // control. EXECUTE is now revoked from PUBLIC and anon.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error('[gcal-cb] SUPABASE_SERVICE_ROLE_KEY is not set');
    return NextResponse.redirect(APP_URL + '/settings?gcal=error&reason=missing_service_key');
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const expiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  const { error: rpcErr } = await supabase.rpc('save_google_tokens', {
    p_user_id: userId,
    p_access_token: tokens.access_token,
    p_refresh_token: tokens.refresh_token ?? '',
    p_token_expiry: expiry,
    p_gcal_enabled: true,
  });

  console.log('[gcal-cb] rpc error:', rpcErr);
  if (rpcErr) {
    return NextResponse.redirect(APP_URL + '/settings?gcal=error&reason=rpc_failed');
  }

  return NextResponse.redirect(APP_URL + '/settings?gcal=connected');
}
