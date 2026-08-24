// GET /api/calendar/sessions?token=… → text/calendar
//
// One trainer's booked client sessions, as a calendar anyone can subscribe to.
// See src/lib/sessionFeed.ts for why this is a feed rather than a push into
// PushPress (short version: PushPress's API cannot be written to).
//
// AUTH IS THE TOKEN, and that is a deliberate choice rather than a shortcut.
// Calendar clients — Google's "from URL", Apple, Outlook — send no cookies and
// cannot be made to log in, so a subscribable feed is a bearer secret by
// construction. What follows from that:
//
//  - The feed is OFF until a trainer turns it on. `session_feed_rows` returns
//    nothing at all for a disabled trainer, so the switch is enforced in the
//    database and not merely in the UI that draws it.
//  - The token is 32 random bytes. Rotating it revokes every subscription that
//    exists, immediately, with no coordination.
//  - It carries clients' names and nothing else. No ids, no email, no notes, no
//    body composition, no programme — a subscriber learns that someone by that
//    name has a slot, which is precisely the thing the other trainers need and
//    the least that answers it.
//  - A wrong token gets 404, not 403. 403 confirms the token space is real and
//    invites guessing at it.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { buildSessionFeed, FeedEvent } from "@/lib/sessionFeed";
import { fetchAllRows } from "@/lib/fetchAllRows";

export const dynamic = "force-dynamic";

const NOT_FOUND = new NextResponse("Not found", {
  status: 404,
  headers: { "Cache-Control": "no-store" },
});

export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") || "").trim();
  // Shape-checked before it reaches the database. A token is 64 hex characters;
  // anything else is a probe, and answering probes cheaply keeps them cheap.
  if (!/^[0-9a-f]{64}$/.test(token)) return NOT_FOUND;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    return new NextResponse("Feed unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const db = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Paged. An RPC is still a PostgREST response and is capped at 1,000 rows
  // like everything else, and this one is at 721 today over a four-month
  // window — a trainer who books further out crosses it, and a truncated
  // calendar does not error, it just stops having sessions in it after some
  // date nobody chose. The function already returns them ordered.
  let rows: (FeedEvent & { trainer_name: string | null })[];
  try {
    rows = await fetchAllRows<FeedEvent & { trainer_name: string | null }>(
      () => db.rpc("session_feed_rows", { p_token: token }),
      { label: "sessionFeed", orderedBy: "session_feed_rows() ORDER BY scheduled_at, id" },
    );
  } catch {
    return new NextResponse("Feed unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  // No rows is ambiguous — a bad token, a switched-off feed, or a genuinely
  // empty diary all land here — so it cannot be distinguished from the outside
  // without leaking which. An empty VCALENDAR is the honest answer to all three
  // and is what a subscriber's client expects; 404 on a valid-but-quiet feed
  // would make a subscription silently break the week a trainer took off.
  const calendarName = rows[0]?.trainer_name
    ? `${rows[0].trainer_name} — Client Sessions`
    : "Client Sessions";

  const body = buildSessionFeed({
    events: rows,
    calendarName,
    now: new Date(),
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="symmetry-sessions.ics"',
      // Short, and revalidated. Google decides its own polling interval no
      // matter what we say, but nothing downstream should serve a stale copy
      // of a cancellation for longer than we asked it to.
      "Cache-Control": "public, max-age=300, must-revalidate",
    },
  });
}
