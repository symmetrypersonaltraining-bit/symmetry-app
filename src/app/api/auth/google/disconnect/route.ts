import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { TRAINER_EMAIL } from '@/lib/ai/scope';
import { isTrainerEmail } from "@/lib/trainer";

// Revoke the Google grant and wipe the stored credentials.
//
// Why this exists: until 2026-07-31 there was no way to rotate the Google
// refresh token from inside the app. The only route was Google's own
// "Linked apps" screen, which lists third-party grants by the display name on
// the OAuth consent screen — a name this project never set, so the entry is
// effectively unfindable among two dozen other grants.
//
// It mattered because gcal_get_tokens() used to be callable with the ANON key,
// which ships in every client's browser bundle. The refresh token has to be
// treated as leaked, and a refresh token does not expire on its own: it is
// valid until something explicitly revokes it. Reconnecting is NOT enough —
// Google permits up to 50 concurrent refresh tokens per user per client, so a
// fresh authorization leaves the old one working.
//
// Hitting https://oauth2.googleapis.com/revoke kills the grant itself. No
// client_id or client_secret is required; possession of the token is the only
// credential the endpoint asks for. Google revokes the whole grant, so every
// token issued under it dies at once.
//
// POST only. A GET would be triggerable by any image tag on any page the
// trainer happens to be logged in on.

function service() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isTrainerEmail(user.email)) {
      return NextResponse.json({ ok: false, error: 'Trainer only' }, { status: 403 });
    }

    const sb = service();
    // THE CALLER'S OWN TOKENS, explicitly. This read used to take no argument,
    // which resolved to whichever trainer_settings row came back first. With a
    // second trainer on the roster that is a live footgun: Stephanie tapping
    // Disconnect would revoke DUSTIN's Google grant at Google, then clear her
    // own (empty) row — his calendar sync dead, the database still claiming he
    // is connected. Revoke and clear must name the same person.
    const { data: rows, error: rpcErr } = await sb.rpc('gcal_get_tokens', { p_user_id: user.id });
    if (rpcErr) {
      return NextResponse.json({ ok: false, error: 'Could not read tokens: ' + rpcErr.message }, { status: 500 });
    }
    const settings = Array.isArray(rows) ? rows[0] : null;

    // Revoke refresh first, then access. Revoking either one takes the whole
    // grant down, but if the refresh token is already dead we still want a shot
    // at the access token rather than silently leaving it live for an hour.
    const results: Record<string, number | string> = {};
    for (const [label, token] of [
      ['refresh', settings?.google_refresh_token],
      ['access', settings?.google_access_token],
    ] as const) {
      if (!token) { results[label] = 'none stored'; continue; }
      try {
        const res = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }).toString(),
        });
        // 200 = revoked. 400 = Google no longer recognises it, which for our
        // purposes is the same outcome: it cannot be used against the calendar.
        results[label] = res.status;
      } catch (e: unknown) {
        results[label] = e instanceof Error ? e.message : String(e);
      }
    }

    // Clear the row regardless of what Google said. Leaving a revoked token in
    // the database is strictly worse than an empty column: the sync would keep
    // presenting a dead credential and failing with a 401 that looks like a
    // configuration problem instead of a disconnected account.
    const { error: updErr } = await sb
      .from('trainer_settings')
      .update({
        google_refresh_token: null,
        google_access_token: null,
        google_token_expiry: null,
        google_sync_token: null,
        gcal_sync_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: 'Revoked at Google but failed to clear stored tokens: ' + updErr.message, revoke: results },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, revoke: results });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
