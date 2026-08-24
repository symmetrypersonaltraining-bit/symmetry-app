// GET  /api/calendar/feed-settings  → this trainer's feed state and URL
// POST /api/calendar/feed-settings  → { action: "on" | "off" | "rotate" | "names", nameStyle? }
//
// The switch behind the published session feed (see src/lib/sessionFeed.ts).
//
// EVERY TRAINER GETS THIS. It is not an owner feature: any coach at Sevens has
// the same reason to let the others see where they are booked, and gating it
// would mean the person who most needs it is the one who cannot turn it on.
//
// The trainer is resolved from the SESSION, never from the request. A body that
// named a trainer would let any signed-in account switch on somebody else's
// feed — which is to say, publish another coach's client list.

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://symmetry-app-omega.vercel.app";

type Row = {
  id: string;
  session_feed_token: string | null;
  session_feed_enabled: boolean;
  session_feed_name_style: string;
};

async function currentTrainer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("trainers")
    .select("id, session_feed_token, session_feed_enabled, session_feed_name_style")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

function payload(row: Row) {
  return {
    enabled: row.session_feed_enabled,
    nameStyle: row.session_feed_name_style,
    // The URL is only returned once a token exists, and a token is only minted
    // when the feed is switched on. Nothing hands out a live secret to a screen
    // that was merely opened.
    url: row.session_feed_token
      ? `${APP_ORIGIN}/api/calendar/sessions?token=${row.session_feed_token}`
      : null,
  };
}

export async function GET() {
  const row = await currentTrainer();
  if (!row) return NextResponse.json({ error: "Not a trainer" }, { status: 403 });
  return NextResponse.json(payload(row));
}

export async function POST(req: NextRequest) {
  let body: { action?: string; nameStyle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const row = await currentTrainer();
  if (!row) return NextResponse.json({ error: "Not a trainer" }, { status: 403 });

  const db = createAdminClient();
  let patch: Record<string, unknown>;

  switch (body.action) {
    case "on":
      patch = {
        session_feed_enabled: true,
        // Minted on first use, and kept on later switch-ons so that turning the
        // feed off for a week does not silently break every subscription.
        // Rotate is the deliberate way to break them.
        session_feed_token: row.session_feed_token || randomBytes(32).toString("hex"),
      };
      break;
    case "off":
      // The token stays. `session_feed_rows` refuses a disabled trainer, so the
      // URL is already dead — keeping it means switching back on does not ask
      // six people to re-subscribe.
      patch = { session_feed_enabled: false };
      break;
    case "rotate":
      patch = { session_feed_token: randomBytes(32).toString("hex") };
      break;
    case "names":
      if (body.nameStyle !== "full" && body.nameStyle !== "initial") {
        return NextResponse.json({ error: "Unknown name style" }, { status: 400 });
      }
      patch = { session_feed_name_style: body.nameStyle };
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { data, error } = await db
    .from("trainers")
    .update(patch)
    .eq("id", row.id)
    .select("id, session_feed_token, session_feed_enabled, session_feed_name_style")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Could not save that" }, { status: 500 });
  }
  return NextResponse.json(payload(data as Row));
}
