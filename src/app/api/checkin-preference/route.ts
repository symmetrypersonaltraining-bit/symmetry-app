// POST /api/checkin-preference
// Body: { action: "snooze" | "off" | "on" }
//
// What a client says back to the go-quiet check-in.
//
// Dustin, 2026-08-13: "we need to put a function on that screen for them to
// click don't show again... if it's not something that they should be seeing
// because they're not logging for a reason, they can click don't show again or
// maybe snooze for thirty days."
//
// The rule behind that screen can only ever infer from behaviour. The client is
// the one who actually knows whether the quiet means anything — travelling,
// injured, or simply not a logger and never pretended to be. So the screen asks,
// and this is the part that LISTENS. A check-in you cannot switch off is a nag.
//
// Written with the service-role client on purpose: client_app_settings is not
// something a browser should be able to rewrite freely, and the signed-in user
// is resolved here rather than trusted from the body.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SNOOZE_DAYS = 30;

export async function POST(req: NextRequest) {
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const action = body?.action;
  if (action !== "snooze" && action !== "off" && action !== "on") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Resolve THEIR client row from the session. Never from the request body —
  // otherwise one client could silence another's check-ins.
  const { data: byAuth } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
  let clientId = (byAuth as { id: string } | null)?.id ?? null;
  if (!clientId && user.email) {
    const { data: byEmail } = await supabase.from("clients").select("id").eq("email", user.email).maybeSingle();
    clientId = (byEmail as { id: string } | null)?.id ?? null;
  }
  if (!clientId) return NextResponse.json({ error: "No client record" }, { status: 404 });

  const until = new Date();
  until.setDate(until.getDate() + SNOOZE_DAYS);

  const patch =
    action === "off"
      ? { checkin_nudges_off: true }
      : action === "on"
        ? { checkin_nudges_off: false, checkin_snoozed_until: null }
        : { checkin_snoozed_until: until.toISOString().slice(0, 10) };

  const db = createAdminClient();
  const { error } = await db
    .from("client_app_settings")
    .upsert({ client_id: clientId, ...patch }, { onConflict: "client_id" });
  if (error) return NextResponse.json({ error: "Could not save that" }, { status: 500 });

  return NextResponse.json({ ok: true, ...patch });
}
