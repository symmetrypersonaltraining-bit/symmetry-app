// POST /api/push-test — trainer-only push self-test. Sends a test notification
// to the trainer's own registered devices and RETURNS the FCM diagnostics
// (per-token status/error, or the reason nothing was sent) so delivery failures
// are visible from the device. Does not write anything except pruning dead tokens.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushDiagnostics } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.email !== TRAINER_EMAIL) return NextResponse.json({ error: "Trainer only." }, { status: 403 });

  const result = await sendPushDiagnostics(user.id, "Symmetry test", "Push test ✓", { url: "/messages" });
  return NextResponse.json(result);
}

// Convenience GET so it can be triggered from a browser too.
export async function GET() {
  return POST();
}
