// v2
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, gcalFetch } from '@/lib/gcal';
import { isCronRequest } from '@/lib/cron-auth';
import { isDbSchedulerRequest } from '@/lib/scheduler-key';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { TRAINER_EMAIL } from '@/lib/ai/scope';
import { trainerForAuthUser } from '@/lib/trainerResolve';
import { viewerIsTrainer } from "@/lib/auth/viewer";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COLOR_CANCELLED = '6';   // orange = full cancel (cancelled_client)
const COLOR_HALF = '3';        // grape/purple = half / vacation credit (cancelled_half) — ready, unused until Dustin uses it
const COLOR_PAYMENT = '11';

// Service-role client. This route drives every SECURITY DEFINER function the
// calendar sync owns, and it used to drive them with the ANON key — the key
// that ships in the JavaScript bundle of every client's app.
//
// That made the following callable by anyone on the internet, no login:
//   • gcal_clear_appointments()  — deletes every appointment in the table
//   • gcal_get_clients()         — returns the full client roster
//   • gcal_sync_appointments()   — writes arbitrary appointments
//   • gcal_reconcile_*()         — cancels appointments by id
//
// The route's own POST/GET guard never helped: the guard protects the HTTP
// endpoint, and the attack does not go through the endpoint. It goes straight
// to /rest/v1/rpc/gcal_clear_appointments with the public key. The only fix is
// to stop the public key from being able to execute them at all, which means
// this route has to hold the service role instead.
//
// Throws rather than falling back. A silent fallback to the anon key is how
// this survived the last hardening pass.
function getServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. The calendar sync RPCs are no ' +
      'longer executable with the anon key. Set the variable in Vercel ' +
      '(Production) and redeploy.'
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── ONE CALENDAR, ONE TRAINER ───────────────────────────────────────────────
//
// Everything below used to run exactly once, against "the" Google Calendar and
// "the" client roster, because there was only ever one of each. Stephanie ends
// that. The body is unchanged in what it does; it now does it for a named
// trainer, and the route runs it once per connected trainer.
//
// The three places where "there is only one trainer" was load-bearing:
//
//   getValidAccessToken()  picked an arbitrary trainer_settings row.
//   gcal_get_clients()     returned the WHOLE roster, so Dustin's calendar
//                          could match "Sarah" to one of Stephanie's clients
//                          and bill the session to the wrong trainer.
//   gcal_reconcile_*()     deletes future rows absent from p_seen_ids. Trainer
//                          A's event list does not contain trainer B's events,
//                          so unscoped, A's sync would delete B's entire future
//                          schedule on its first run.
//
// Each of those now takes a scope. With one connected trainer who owns every
// client row, the scoped result is identical to the unscoped one — verified
// against live data before this shipped (465 appointments and 698 payment rows
// in the window, both ways).
type ConnectedTrainer = {
  user_id: string;
  trainer_id: string | null;
  trainer_name: string;
  is_owner: boolean;
};

type TrainerSyncResult = {
  trainer: string;
  /** The auth user this pass belongs to, so a trainer can find their own row. */
  user_id: string;
  synced: number;
  payments: number;
  reconciled: number;
  reconciled_payments: number;
  unmatched: number;
  unmatched_samples: string[];
  total: number;
  dollar_events: number;
  client_dollar: number;
  errors: string[];
  skipped?: string;
};

function emptyResult(name: string, skipped: string, userId = ""): TrainerSyncResult {
  return {
    trainer: name, user_id: userId, synced: 0, payments: 0, reconciled: 0, reconciled_payments: 0,
    unmatched: 0, unmatched_samples: [], total: 0, dollar_events: 0,
    client_dollar: 0, errors: [], skipped,
  };
}

async function syncOneCalendar(
  supabase: ReturnType<typeof getServiceClient>,
  trainer: ConnectedTrainer,
  opts: { narrow: boolean; resetHappened: boolean },
): Promise<TrainerSyncResult> {
  const who = trainer.trainer_name || trainer.user_id;
  const { token } = await getValidAccessToken(trainer.user_id);

  const { data: clientRows, error: clientErr } = await supabase.rpc('gcal_get_clients', {
    p_trainer_id: trainer.trainer_id,
  });
  if (clientErr) throw new Error('clients: ' + clientErr.message);
  const clients = clientRows as Array<{ id: string; name: string }> | null;
  // No clients is not an error for a trainer who has not been given any yet —
  // it is Stephanie's state on day one. Skipping her leaves Dustin's run alone;
  // failing the request would have taken his sync down with her.
  if (!clients?.length) return emptyResult(who, 'no clients assigned', trainer.user_id);

  const clientMap = clients.map((c: { id: string; name: string }) => {
    const parts = (c.name || '').toLowerCase().split(/\s+/).filter(Boolean);
    return {
      id: c.id,
      name: (c.name || '').toLowerCase(),
      first: parts[0] || '',
      last: parts.length > 1 ? parts[parts.length - 1] : '',
    };
  });

  // Word-boundary test, regex-escaped (names can contain punctuation).
  const hasWord = (s: string, t: string) =>
    t.length > 1 && new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(s);

  // Match an event title to a client by the strongest, least-ambiguous signal:
  //   full name > first AND last both present > a UNIQUE last name > a UNIQUE first name.
  // Last name outranks a bare first-name match so "Robert Burns" resolves to
  // "Robby Burns" (shared last name) instead of "Robert Miller" (shared first name).
  // When a signal is ambiguous (matches >1 client), fall through rather than mis-guess.
  //
  // "Unique" now means unique WITHIN THIS TRAINER'S ROSTER, which is stricter in
  // the way that matters: two trainers can each have a Sarah without either
  // calendar becoming ambiguous, and neither can claim the other's.
  function matchClient(summary: string): string | null {
    const s = (summary || '').toLowerCase();
    const full = clientMap.find(c => c.name.length > 0 && s.includes(c.name));
    if (full) return full.id;
    const both = clientMap.filter(c => c.first && c.last && hasWord(s, c.first) && hasWord(s, c.last));
    if (both.length === 1) return both[0].id;
    const byLast = clientMap.filter(c => c.last.length > 2 && hasWord(s, c.last));
    if (byLast.length === 1) return byLast[0].id;
    const byFirst = clientMap.filter(c => c.first.length > 2 && hasWord(s, c.first));
    if (byFirst.length === 1) return byFirst[0].id;
    return null;
  }

  // ── WINDOW ────────────────────────────────────────────────────────────
  //
  // A full run pulls two years of events — ~6,500 of them, ~4,000 upserts,
  // up to 55 seconds. That cost is why the schedule was cut from every 15
  // minutes to twice a day on 1 Aug, and twice a day is what Dustin
  // experiences as "my manual sync isn't picking up everything": anything he
  // changes during the workday is invisible until 4am.
  //
  // Almost nothing that changes is two years out. A NARROW run covers the
  // month behind and the quarter ahead — the range where sessions actually
  // move, get cancelled, or get booked — and is small enough to run hourly.
  // The full window still runs twice a day so the far future stays correct.
  //
  // The behind-edge is 35 days, not 30. A monthly billing cycle opens at
  // due_date - 1 month - 7 days = up to 37 days back, so a 30-day floor left
  // a week at the start of every cycle that billing reads and the sync could
  // no longer correct.
  const now = new Date();
  const timeMin = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(
    now.getTime() + (opts.narrow ? 90 : 730) * 24 * 60 * 60 * 1000,
  ).toISOString();

  let allEvents: Array<Record<string, any>> = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', maxResults: '500', orderBy: 'startTime' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await gcalFetch(token, '/calendars/primary/events?' + params.toString());
    allEvents = allEvents.concat(data.items || []);
    pageToken = data.nextPageToken;
  } while (pageToken);

  const appointmentBatch: any[] = [];
  const paymentBatch: any[] = [];
  let unmatched = 0;
  const unmatchedSamples: string[] = [];

  for (const event of allEvents) {
    const colorId = event.colorId || null;
    const summary = event.summary || '';
    const isPayment = colorId === COLOR_PAYMENT || /\$\s?\d/.test(summary);
    // The colour filter that used to sit here dropped every event carrying an
    // explicit colour other than cancelled/half — Peacock, Blueberry, anything
    // Dustin had tinted for his own reasons. Under the sessions-trained rule a
    // dropped event is an UNBILLED SESSION, so the filter is gone entirely:
    // a session is a session whatever colour it happens to be.
    // COLOR_CANCELLED / COLOR_HALF still decide status below, untouched.

    const clientId = matchClient(summary);
    if (!clientId) {
      // ── WHAT GETS SILENTLY DROPPED ──────────────────────────────────────
      //
      // This was a bare `continue`. No counter, no log, no error. On today's
      // roster 1,975 of 6,545 events matched nothing and vanished — mostly
      // Dustin's own diary, which is fine, but a mistyped client name lands
      // in exactly the same bucket and is indistinguishable from it.
      //
      // Live examples from this week, all rescued only by luck: "Sarah
      // Prince" (client is Sara — matched on surname alone), "Chris Latham"
      // (Christine), "Krysta  Ruiz-Schnitzler" (double space defeats the
      // full-name test). A second Prince on the roster and the session is
      // gone with no error anywhere.
      //
      // Counting them is the cheap half. A sample of the titles is what makes
      // the count actionable — 1,975 is a number, "Sarah Prince" is a fix.
      unmatched += 1;
      if (unmatchedSamples.length < 40 && summary.trim()) {
        const t = summary.trim();
        if (!unmatchedSamples.includes(t)) unmatchedSamples.push(t);
      }
      continue;
    }

    // Business rules, and they are the OWNER's business rules: on Dustin's
    // calendar "paycheck" means Stephanie's wages going out, and Gerard and
    // Dustin are never billed. Applied to her calendar as well, "paycheck"
    // would silently drop one of HER clients' payments — a rule written about
    // one calendar quietly deciding what another one means.
    const PAYMENT_EXCLUDED_CLIENTS = ['d970da5e-9c46-45c4-be9c-e27e1893b575', '69021074-1708-4d73-9245-918862048709'];
    if (isPayment && trainer.is_owner && (/paycheck/i.test(summary) || PAYMENT_EXCLUDED_CLIENTS.includes(clientId))) continue;

    if (isPayment) {
      const payDate = event.start?.date || event.start?.dateTime?.split('T')[0];
      if (!payDate) continue;
      paymentBatch.push({ client_id: clientId, title: summary, payment_date: payDate, google_event_id: event.id, source: 'gcal_sync' });
      continue;
    }

    if (!event.start?.dateTime) continue;
    appointmentBatch.push({
      client_id: clientId,
      scheduled_at: event.start.dateTime,
      ends_at: event.end?.dateTime || '',
      status: colorId === COLOR_CANCELLED ? 'cancelled_client' : (colorId === COLOR_HALF ? 'cancelled_half' : 'scheduled'),
      // KEPT, not just read. Dustin's calendar is colour-coded - red is a bill,
      // green is income, blue with a client's name is a session - and the
      // colour was being consulted for cancelled/payment and then discarded,
      // so nothing downstream could ask which of these are the blue ones.
      // Empty string means the event carries no explicit colour (the calendar
      // default), which is NOT the same as a colour he chose; the RPC stores
      // that as NULL.
      gcal_color_id: colorId || '',
      gcal_event_id: event.id,
      gcal_recurring_id: event.recurringEventId || '',
      title: summary,
      source: 'gcal',
    });
  }

  let synced = 0;
  let payments = 0;
  const errors: string[] = [];

  if (appointmentBatch.length > 0) {
    const { data: r, error: e } = await supabase.rpc('gcal_sync_appointments', { p_appointments: appointmentBatch });
    if (e) errors.push('appts: ' + e.message);
    else { synced = (r as any)?.synced || 0; ((r as any)?.errors || []).forEach((x: string) => errors.push(x)); }
  }

  if (paymentBatch.length > 0) {
    const { data: r, error: e } = await supabase.rpc('gcal_sync_payments', { p_payments: paymentBatch });
    if (e) errors.push('pays: ' + e.message);
    else { payments = (r as any)?.synced || 0; }
  }

  // Reconcile: remove FUTURE app rows whose GCal event vanished (deleted event
  // or ended/shortened recurrence). Only on a full, healthy fetch (not a manual
  // reset, and enough events came back) so a transient auth blip can never wipe
  // the schedule. Deletes are self-healing — a still-live event re-inserts on the
  // next sync via the upsert above.
  //
  // p_trainer_id is what keeps this honest across two calendars: without it,
  // every row belonging to the OTHER trainer is "not in p_seen_ids" and gets
  // deleted. Passing null (a trainer with no trainers row) keeps the old
  // whole-table behaviour, which is only correct while there is one of them.
  let reconciled = 0;
  if (!opts.resetHappened && allEvents.length >= 50) {
    const seenIds = allEvents.map((e: any) => e.id).filter(Boolean);
    const { data: rc, error: rcErr } = await supabase.rpc('gcal_reconcile_appointments', {
      p_seen_ids: seenIds,
      p_time_min: timeMin,
      p_time_max: timeMax,
      p_trainer_id: trainer.trainer_id,
    });
    if (rcErr) errors.push('reconcile: ' + rcErr.message);
    else {
      reconciled = (rc as any)?.removed || 0;
      // The reconcile can now REFUSE — it returns a `skipped` reason rather
      // than deleting when more than half the window would disappear, which
      // is a bad fetch and not a bad calendar. A refusal that nobody sees is
      // the same as no guard at all.
      const skipped = (rc as any)?.skipped;
      if (skipped) errors.push('reconcile_skipped: ' + skipped);
    }
  }

  // Payments reconcile: same safe pattern as appointments — remove FUTURE
  // gcal-synced payment rows whose event vanished, so a deleted calendar
  // payment can't linger as a phantom upcoming charge. Self-healing.
  let reconciledPayments = 0;
  if (!opts.resetHappened && allEvents.length >= 50) {
    const seenPayIds = allEvents.map((e: any) => e.id).filter(Boolean);
    const { data: rcp, error: rcpErr } = await supabase.rpc('gcal_reconcile_payments', {
      p_seen_ids: seenPayIds,
      p_time_min: timeMin,
      p_time_max: timeMax,
      p_trainer_id: trainer.trainer_id,
    });
    if (rcpErr) errors.push('reconcile_payments: ' + rcpErr.message);
    else {
      reconciledPayments = (rcp as any)?.removed || 0;
      const skippedP = (rcp as any)?.skipped;
      if (skippedP) errors.push('reconcile_payments_skipped: ' + skippedP);
    }
  }

  const dollarEvents = allEvents.filter((e: any) => /\$\s?\d/.test(e.summary || ''));
  const clientDollar = dollarEvents.filter((e: any) => matchClient(e.summary || ''));

  return {
    trainer: who,
    user_id: trainer.user_id,
    synced,
    payments,
    reconciled,
    reconciled_payments: reconciledPayments,
    unmatched,
    unmatched_samples: unmatchedSamples,
    total: allEvents.length,
    dollar_events: dollarEvents.length,
    client_dollar: clientDollar.length,
    errors,
  };
}

export async function POST(req: NextRequest) {
  // POST had no auth of its own. GET was hardened in a691c73 while this sat
  // open: a route that writes appointments, payment rows AND now recalculates
  // reminder amounts was callable by anyone who knew the URL, and `?reset=true`
  // would clear the appointment table first. Same rule as GET now — a genuine
  // scheduler, or a signed-in trainer (which is how GcalSyncButton calls it).
  // Three ways in, all server-side: Vercel's own scheduler (unforgeable
  // x-vercel-cron), the pg_cron scheduler (database-held key — see
  // scheduler-key.ts for why the 15-minute sync moved there), or a signed-in
  // trainer tapping Sync Now.
  let callerIsOwner = true; // cron and the db scheduler are the owner's own automation
  if (!isCronRequest(req) && !(await isDbSchedulerRequest(req))) {
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user || !(await viewerIsTrainer(authClient, user))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const me = await trainerForAuthUser(authClient as never, user.id, user.email ?? null);
    callerIsOwner = !!me?.isOwner;
  }

  const body = await req.json().catch(() => ({}));
  // RESET IS OWNER-ONLY. gcal_clear_appointments() empties the whole table —
  // every trainer's appointments, not the caller's — and the auth check above
  // only asks whether the caller is A trainer. Any second trainer POSTing
  // { reset: true } would have deleted the owner's calendar out from under him.
  // A non-owner asking for it gets an ordinary sync, not an error, because the
  // reset is an optimisation and refusing the whole request would break Sync Now.
  const resetFirst = body.reset === true && callerIsOwner;
  const narrow = body.window === "narrow";

  try {
    const supabase = getServiceClient();

    const { data: trainerRows, error: trainerErr } = await supabase.rpc('gcal_list_connected_trainers');
    if (trainerErr) throw new Error('trainers: ' + trainerErr.message);
    const trainers = (trainerRows || []) as ConnectedTrainer[];
    if (!trainers.length) {
      return NextResponse.json({ skipped: true, reason: 'Google Calendar not connected, or sync is disabled.' });
    }

    // gcal_clear_appointments() empties the WHOLE table, both trainers' rows
    // included. It runs once, before the loop — inside it, trainer two would
    // wipe out everything trainer one had just written.
    if (resetFirst) {
      await supabase.rpc('gcal_clear_appointments');
    }

    // Sequential, not Promise.all. Each pass can pull thousands of events and
    // write thousands of rows inside a 60-second budget; running them at once
    // is how the function times out and leaves half a calendar synced.
    const results: TrainerSyncResult[] = [];
    for (const t of trainers) {
      try {
        results.push(await syncOneCalendar(supabase, t, { narrow, resetHappened: resetFirst }));
      } catch (e: any) {
        // One trainer's dead credential must not take the other's sync down —
        // that was the single-tenant behaviour and it is the wrong one now.
        const msg = e?.message || String(e);
        results.push(emptyResult(t.trainer_name || t.user_id, msg, t.user_id));
      }
    }

    const ran = results.filter(r => !r.skipped);
    if (!ran.length) {
      const reasons = results.map(r => (r.trainer || '?') + ': ' + r.skipped).join('; ');
      // Preserve the old contract for the two cases callers already handle:
      // nothing to sync reads as `skipped`, an empty roster as a 500.
      if (results.every(r => (r.skipped || '').includes('no clients'))) {
        return NextResponse.json({ error: 'No clients found', detail: reasons }, { status: 500 });
      }
      return NextResponse.json({ skipped: true, reason: reasons });
    }

    const errors: string[] = [];
    for (const r of results) {
      r.errors.forEach(x => errors.push(results.length > 1 ? r.trainer + ': ' + x : x));
      if (r.skipped) errors.push(r.trainer + ' skipped: ' + r.skipped);
    }

    // Appointments have just moved, so every pending payment reminder derived
    // from them is now stale. Recalculate here rather than leaving it to whenever
    // someone next opens the editor: amount = sessions_trained x session_rate is
    // only as true as the appointment rows behind it.
    //
    // The function is scoped to notification_status='pending' AND email_sent_at
    // IS NULL AND sms_sent_at IS NULL. Anything already sent to a client is a
    // statement of record and is never rewritten.
    //
    // These three run ONCE, after every calendar has landed — they are
    // roster-wide by design and running them per trainer would just do the same
    // work twice with a half-synced table underneath the first pass.
    let remindersRecalculated = 0;
    let remindersChanged = 0;
    let workoutsFollowed = 0;
    {
      // The calendar decides WHEN a supervised session happens, so supervised
      // workouts follow their linked appointment automatically -- no proposal,
      // no approval. It will not touch solo work, anything already logged,
      // anything in the past, anything moved by hand, or a day that is already
      // occupied. Runs BEFORE the billing recalc: the reminder counts read the
      // same rows this just corrected.
      const { data: mv, error: mvErr } = await supabase.rpc('sync_supervised_workouts_to_appointments', { p_dry_run: false });
      if (mvErr) errors.push('workout_follow: ' + mvErr.message);
      else workoutsFollowed = ((mv as any[]) || []).length;
    }
    {
      const { data: rr, error: rrErr } = await supabase.rpc('recalc_pending_payment_reminders');
      if (rrErr) errors.push('reminder_recalc: ' + rrErr.message);
      else {
        const list = (rr as any[]) || [];
        remindersRecalculated = list.length;
        remindersChanged = list.filter((x: any) => x.changed).length;
        list.filter((x: any) => x.blocked_reason)
          .forEach((x: any) => errors.push('reminder_blocked: ' + x.client_name + ' — ' + x.blocked_reason));
      }
    }

    await supabase.rpc('gcal_generate_payment_notifications');

    // THE SESSION MIRROR IS NOT HERE ANY MORE, AND MUST NOT COME BACK.
    //
    // It used to run at the tail of this request. On 25 Aug 2026 it created
    // Google events with PUT — which does not create — so every write 404'd,
    // nothing was ever marked published, and all 200 writes retried on the
    // next hour. Two hundred doomed calls an hour inside a request that was
    // already using 55 of its 60 seconds, and this sync timed out every hour
    // for a day and a half. Billing, appointments and payment reminders went
    // down for a read-only copy of the schedule.
    //
    // It lives at /api/cron/session-mirror on its own pg_cron schedule now,
    // with its own budget. Nothing that merely publishes a convenience copy
    // belongs on the critical path of the thing the business runs on.

    const sum = (pick: (r: TrainerSyncResult) => number) => results.reduce((a, r) => a + pick(r), 0);
    return NextResponse.json({
      ok: true,
      window: narrow ? 'narrow' : 'full',
      // PER-TRAINER, and carrying enough to BE a health card on its own.
      // my_gcal_sync_health() hands a trainer their own entry out of this
      // array; without user_id there is nothing to match on, and without
      // errors/unmatched_samples their slice cannot say what went wrong or what
      // was dropped — which is the whole point of the card.
      trainers: results.map(r => ({
        trainer: r.trainer, user_id: r.user_id, synced: r.synced, payments: r.payments,
        reconciled: r.reconciled, reconciled_payments: r.reconciled_payments,
        unmatched: r.unmatched, unmatched_samples: r.unmatched_samples.slice(0, 20),
        total: r.total, skipped: r.skipped, errors: r.errors.slice(0, 10),
      })),
      // Top-level totals stay exactly where they were: GcalSyncButton reads
      // `synced`, the Settings buttons read `synced` and `payments`.
      synced: sum(r => r.synced),
      payments: sum(r => r.payments),
      reconciled: sum(r => r.reconciled),
      reconciled_payments: sum(r => r.reconciled_payments),
      unmatched: sum(r => r.unmatched),
      unmatched_samples: results.flatMap(r => r.unmatched_samples).slice(0, 40),
      total: sum(r => r.total),
      dollar_events: sum(r => r.dollar_events),
      client_dollar: sum(r => r.client_dollar),
      workouts_followed: workoutsFollowed,
      reminders_recalculated: remindersRecalculated,
      reminders_changed: remindersChanged,
      errors: errors.slice(0, 10),
    });
  } catch (e: any) {
    const msg = e.message || String(e);
    if (msg.includes('disabled') || msg.includes('not connected')) {
      return NextResponse.json({ skipped: true, reason: msg });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // This guard used to be `if (CRON_SECRET && authHeader !== ...)`, which fails
  // OPEN: CRON_SECRET is unset on this project, so the check was skipped and the
  // whole sync — which writes appointments and payment rows — was callable by
  // anyone who knew the URL. isCronRequest fails closed instead.
  //
  // GcalSyncButton hits this with a plain browser GET and no secret, so a
  // signed-in trainer is accepted too. That is not a loosening: the button
  // already reaches the same code through POST, which has no auth of its own.
  if (!isCronRequest(req) && !(await isDbSchedulerRequest(req))) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !(await viewerIsTrainer(supabase, user))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return POST(new NextRequest(req.url, { method: 'POST', headers: req.headers }));
}
