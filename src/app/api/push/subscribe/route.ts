// POST   /api/push/subscribe  { subscription, replaces? }  → store this browser
// DELETE /api/push/subscribe  { endpoint }                  → forget this browser
//
// One row per BROWSER, not per user: the same person on a phone and a laptop has
// two subscriptions and should be reached on both. The endpoint is the natural
// key — the browser mints it, and re-subscribing on the same browser returns the
// same endpoint — so upsert-on-endpoint keeps the table tidy without any
// housekeeping.
//
// Every write here is checked. The whole reason this feature exists is that a
// notification path failed silently for a month, so a subscribe that quietly
// does nothing would be the same bug with a new name: the client would tap
// "turn on notifications", see it succeed, and still hear nothing.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { configured, vapidPublicKey } from "@/lib/webPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The browser needs the public key before it can subscribe. */
export async function GET() {
  return NextResponse.json({ configured: configured(), publicKey: vapidPublicKey() });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sub = body?.subscription;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";

  // All three or none. A row missing a key cannot be encrypted to, and would
  // sit in the table looking like working push forever.
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Incomplete subscription" }, { status: 400 });
  }

  const admin = createAdminClient();

  // A rotated subscription: retire the old endpoint so it stops being pushed to.
  if (typeof body?.replaces === "string" && body.replaces && body.replaces !== endpoint) {
    // Checked. If retiring the old endpoint fails, the device ends up
    // subscribed twice and the client gets every notification in duplicate —
    // which reads as the app being broken, not as a stale row.
    const { error: retireErr } = await admin
      .from("push_subscriptions")
      .update({ failed_at: new Date().toISOString(), last_error: "rotated" })
      .eq("endpoint", body.replaces)
      .eq("user_id", user.id);
    if (retireErr) {
      console.error("push rotate: old endpoint not retired, duplicates likely:", retireErr.message);
    }
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) || null,
      updated_at: new Date().toISOString(),
      // Re-subscribing revives a row previously marked dead — the person is
      // plainly here and permitting it again.
      failed_at: null,
      last_error: null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json(
      { error: `Could not save this device for notifications: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });

  const admin = createAdminClient();
  // Scoped to this user: an endpoint is a capability to push to a device, and
  // one person must never be able to delete another's by guessing it.
  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: `Could not turn notifications off: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
