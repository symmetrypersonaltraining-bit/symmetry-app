// POST /api/log-error — the one way a BROWSER error becomes a row.
//
// The grouping itself lives in lib/errorLog.ts, shared with logServerError.
// What this route owns is the part only it can do: deciding who the report is
// actually from.
//
// WHY THE SERVER WRITES THIS AND NOT THE BROWSER
//
// Two reasons, and the second was a live bug for a fortnight.
//
// 1. GROUPING NEEDS A READ BEFORE THE WRITE. One row per distinct fault, with a
//    count and the last ten occurrences, means reading the existing row first.
//    The client has no read grant on this table by design — `detail` carries
//    ids — and two tabs failing at once would race.
//
// 2. RLS REFUSED THE CASE MOST LIKELY TO BE REPORTED. The old insert policy was
//    `client_id = my_client_id()`, which resolves the LOGGED-IN user's client
//    row. When Dustin logs a client's session at /workout?forClient=<id> he has
//    no client row, so the insert was refused and logClientError's own catch —
//    correctly, it must never throw — swallowed the refusal. A failed set
//    during a session HE logged left no trace anywhere.
//
// WHAT THIS ROUTE WILL NOT DO
//
// It will not take a client_id from the browser on trust. A client's own id is
// resolved from their session; a trainer may name a client, but the lookup runs
// under THEIR session, so RLS decides — a client they cannot see comes back
// empty and the row is filed with none. A log that can be written into someone
// else's name is worse than no log.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

interface Body {
  scope?: string;
  message?: string;
  detail?: Record<string, unknown>;
  path?: string;
  clientId?: string | null;
}

export async function POST(req: Request) {
  // NOTHING HERE MAY THROW. This is the error path: a 500 from the error
  // reporter is a second fault reported nowhere, and behind a crash screen that
  // retries it is a loop.
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // WHO IS THIS, ACCORDING TO THE SESSION — never according to the payload.
    let clientId: string | null = null;
    let userId: string | null = null;
    try {
      const sb = await createClient();
      const { data: { user } } = await sb.auth.getUser();
      userId = user?.id ?? null;
      if (user) {
        const { data: own } = await sb
          .from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
        if (own?.id) {
          clientId = own.id;
        } else if (body.clientId) {
          const { data: seen } = await sb
            .from("clients").select("id").eq("id", String(body.clientId)).maybeSingle();
          clientId = seen?.id ?? null;
        }
      }
    } catch {
      /* an unauthenticated or broken session still gets its error recorded */
    }

    const result = await recordError({
      scope: String(body.scope || "unknown"),
      message: String(body.message || "unknown"),
      detail: body.detail ?? null,
      path: body.path ?? null,
      clientId,
      userId,
      userAgent: (req.headers.get("user-agent") || "").slice(0, 300) || null,
      source: "client",
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false });
  }
}
