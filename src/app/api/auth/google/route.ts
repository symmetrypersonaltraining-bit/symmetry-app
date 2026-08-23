import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { signState } from '@/lib/auth/oauthState';

// Per instance: an OAuth callback pinned to one deployment sends another
// instance's trainer to that deployment when they connect their calendar.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://symmetry-app-omega.vercel.app';
const REDIRECT_URI = `${APP_ORIGIN}/api/auth/google/callback`;
const SCOPES = 'https://www.googleapis.com/auth/calendar';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', APP_ORIGIN));

  // SIGNED. `state: user.id` was a bare, guessable claim the callback then
  // trusted enough to write Google refresh tokens against, on the service role.
  // See src/lib/auth/oauthState.ts for what that bought an attacker.
  const state = signState(user.id);
  if (!state) {
    return NextResponse.redirect(APP_ORIGIN + '/settings?gcal=error&reason=state_not_configured');
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return NextResponse.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
}
