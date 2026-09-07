// POST /api/coach-escalate
// Body: { question: string, answer: string, surface?: string }
//
// "Send this to Dustin" — the client's own escape hatch out of the AI.
//
// Dustin, 2026-08-13, choosing how this works: the trigger is
// "Client taps 'Send this to Dustin'", and on what should never be escalated,
// "only what client approve to be escalated".
//
// That is the whole design and it is worth writing down why, because the
// obvious version is the other one. The coach could decide by itself when
// something needs a human — it already says "come ask Dustin" for anything
// needing a real decision, and making it actually SEND at that moment would
// catch the people who would never press a button. Dustin said no, and he is
// right about his own inbox: an AI that forwards whatever it feels unsure about
// produces a stream nobody reads within a week, and the messages that genuinely
// needed him are then buried under the ones that did not. A queue that is read
// is worth more than a queue that is complete.
//
// So: nothing reaches him that a client did not deliberately send. The coach
// may OFFER, it never sends. There are no automatic triggers in this file and
// there should never be one added — if that changes, it is a decision Dustin
// makes, not a convenience someone adds while touching this route.
//
// It lands in the Messages thread he already reads, as a message from the
// client, carrying both halves of the exchange. Not a new inbox, not a new
// badge, nothing extra to check.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inboxAuthUidForClient } from "@/lib/trainerResolve";
import { sendPushToUser } from "@/lib/push";
import { NOTIFICATION_EVENTS } from "@/lib/notificationEvents";
import { triageSymptoms } from "@/lib/ai/symptomTriage";

export const dynamic = "force-dynamic";

/** Long enough for a real question and the coach's answer; short of a novel. */
const MAX_PART = 4000;

function clip(s: unknown, max = MAX_PART): string {
  const t = String(s ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export async function POST(req: NextRequest) {
  let body: { question?: string; answer?: string; surface?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const question = clip(body.question);
  const answer = clip(body.answer);
  if (!question && !answer) {
    return NextResponse.json({ error: "Nothing to send" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Resolve the sender from the SESSION, never from the body. Otherwise one
  // client could post into another's thread with Dustin.
  const { data: byAuth } = await supabase
    .from("clients")
    .select("id, name, auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  let me = byAuth as { id: string; name: string | null; auth_user_id: string | null } | null;
  if (!me && user.email) {
    const { data: byEmail } = await supabase
      .from("clients")
      .select("id, name, auth_user_id")
      .eq("email", user.email)
      .maybeSingle();
    me = byEmail as typeof me;
  }
  if (!me) return NextResponse.json({ error: "No client record" }, { status: 404 });

  const db = createAdminClient();

  // THIS client's own coach. It used to read trainer_settings with
  // `.limit(1)` — "the same row the calendar sync reads" — which is one row
  // only while one trainer has a calendar connected. With two it picks
  // arbitrarily, and an escalation is exactly the message that must not land in
  // a stranger's inbox: the client is told it reached their coach.
  const trainerUid = await inboxAuthUidForClient(db, me.id);
  if (!trainerUid) {
    return NextResponse.json({ error: "Could not reach your coach right now" }, { status: 500 });
  }

  // ── IS THIS THE ONE HE NEEDS NOW? ──────────────────────────────────────
  //
  // Dustin, 5 Sep, choosing that a red flag OFFERS to send rather than sending
  // itself — and then, in the same breath: "make sure there is a route built in
  // for me to respond to them quickly."
  //
  // It was not built. This route wrote straight into `messages` and pushed
  // NOTHING, so an escalation landed in his thread and he found out when he
  // next looked. For "my hand went numb" that is the whole problem.
  //
  // Re-triaged HERE rather than trusted from the body. The client's app sends
  // this, and a flag a browser can set is a flag anything can set — either to
  // mark a routine question urgent, or to strip the mark off a real one.
  const triage = await triageSymptoms(`${question}\n${answer}`);
  const urgent = triage.tier === "red_flag";

  const where = body.surface ? ` · from ${clip(body.surface, 40)}` : "";
  // Marked as a forward rather than dressed up as the client's own words. He
  // needs to know at a glance that they had already been given an answer, and
  // WHAT that answer was — otherwise he repeats it, or worse, contradicts it.
  const text =
    (urgent ? `⚠️ POSSIBLE REFER-OUT — ${triage.matched.slice(0, 3).join(", ")}\n\n` : "") +
    `✦ Sent from the coach chat${where}\n\n` +
    (question ? `They asked:\n“${question}”\n\n` : "") +
    (answer ? `The app answered:\n${answer}` : "");

  const { error } = await db.from("messages").insert({
    from_id: me.auth_user_id ?? user.id,
    to_id: trainerUid,
    client_id: me.id,
    body: text,
    is_group: false,
    is_broadcast: false,
    urgent,
  });
  if (error) return NextResponse.json({ error: "Could not send that" }, { status: 500 });

  // THE FAST ROUTE BACK.
  //
  // Every OTHER client-to-trainer message already pushes — see
  // home/messageActions.ts. This one, the only kind that can carry a symptom
  // the coach refused to answer, was the one that did not.
  //
  // Awaited rather than fired off: a serverless function is frozen the moment
  // it returns, so a detached promise here would simply never run. Its failure
  // is swallowed on purpose — the message is already written, and a push that
  // could not be sent must not be reported to the client as a send that failed.
  const who = (me.name || "A client").split(" ")[0];
  try {
    await sendPushToUser(
      trainerUid,
      NOTIFICATION_EVENTS.MESSAGE_FROM_CLIENT,
      urgent ? `⚠️ ${who} — possible refer-out` : `${who} sent this from the coach`,
      clip(question || answer, 140),
      // Straight into their thread, not the inbox. One tap from the
      // notification to a reply box is the route he asked for.
      { url: `/messages?client=${me.id}` },
    );
  } catch (e) {
    console.error("escalation push failed (the message itself was sent)", e);
  }

  return NextResponse.json({ ok: true, urgent });
}
