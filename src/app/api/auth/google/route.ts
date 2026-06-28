import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

const REDIRECT_URI = 'https://symmetry-app-omega.vercel.app/api/auth/google/callback';
const SCOPES = 'https://www.googleapis.com/auth/calendar';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', 'https://symmetry-app-omega.vercel.app'));

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: user.id,
  });

  return NextResponse.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
}
