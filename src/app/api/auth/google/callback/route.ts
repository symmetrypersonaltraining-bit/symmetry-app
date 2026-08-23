import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { verifyState } from '@/lib/auth/oauthState';

// Per instance: an OAuth callback pinned to one deployment sends another
// instance's trainer to that deployment when they connect their calendar.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://symmetry-app-omega.vercel.app';
const REDIRECT_URI = `${APP_ORIGIN}/api/auth/google/callback`;
const APP_URL = APP_ORIGIN;

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const rawState = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  console.log('[gcal-cb] start code:', !!code, 'state:', !!rawState, 'error:', error);
  if (error || !code || !rawState) {
    return NextResponse.redirect(APP_URL + '/settings?gcal=error&reason=missing_params');
  }

  // WHO THIS IS FOR, PROVEN. The id below is written straight into
  // save_google_tokens on the service role, so an unsigned `state` let anyone
  // who completed Google's consent screen replace ANY trainer's stored
  // credentials — pointing their calendar sync at an attacker's calendar, which
  // invents sessions and payments on a roster they bill from.
  const checked = verifyState(rawState);
  if (!checked.ok) {
    console.warn('[gcal-cb] refused state:', checked.reason);
    return NextResponse.redirect(APP_URL + '/settings?gcal=error&reason=bad_state');
  }
  const userId = checked.userId;

  // Belt as well as braces. This is a top-level redirect, so the browser sends
  // its cookies: when there IS a session it must be the same person the state
  // was issued to. A missing session is not a failure — Safari's ITP and a
  // cross-site return can both drop it — so absence is allowed and only a
  // MISMATCH is refused.
  try {
    const sessionClient = await createServerClient();
    const { data: { user: signedIn } } = await sessionClient.auth.getUser();
    if (signedIn && signedIn.id !== userId) {
      console.warn('[gcal-cb] state/session mismatch');
      return NextResponse.redirect(APP_URL + '/settings?gcal=error&reason=bad_state');
    }
  } catch {
    /* no readable session — the signature above is the check that matters */
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
