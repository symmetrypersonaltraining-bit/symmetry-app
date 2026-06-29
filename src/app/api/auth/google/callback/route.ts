import { NextRequest, NextResponse } from 'next/server';

const REDIRECT_URI = 'https://symmetry-app-omega.vercel.app/api/auth/google/callback';
const APP_URL = 'https://symmetry-app-omega.vercel.app';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const userId = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  console.log('[gcal-cb] start code:', !!code, 'userId:', userId, 'error:', error);
  if (error || !code || !userId) return NextResponse.redirect(APP_URL + '/settings?gcal=error&reason=missing_params');

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
  });
  const tokens = await tokenRes.json();
  console.log('[gcal-cb] token status:', tokenRes.status, 'access:', !!tokens.access_token, 'refresh:', !!tokens.refresh_token, 'error:', tokens.error);

  if (!tokenRes.ok || !tokens.access_token) {
    return NextResponse.redirect(APP_URL + '/settings?gcal=error&reason=token_exchange');
  }

  // Use Supabase REST API directly (bypass JS client issues)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  console.log('[gcal-cb] supabaseUrl set:', !!supabaseUrl, 'serviceKey set:', !!serviceKey, 'keyLen:', serviceKey?.length);

  const expiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  const body: any = { google_access_token: tokens.access_token, google_token_expiry: expiry, gcal_sync_enabled: true };
  if (tokens.refresh_token) body.google_refresh_token = tokens.refresh_token;

  const dbRes = await fetch(`${supabaseUrl}/rest/v1/trainer_settings?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const dbText = await dbRes.text();
  console.log('[gcal-cb] db PATCH status:', dbRes.status, 'body:', dbText.slice(0, 200));

  if (!dbRes.ok) {
    return NextResponse.redirect(APP_URL + '/settings?gcal=error&reason=db_write');
  }

  return NextResponse.redirect(APP_URL + '/settings?gcal=connected');
}
