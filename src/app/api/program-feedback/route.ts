// /api/program-feedback
//
// GET  — the client's open programming question, if there is one.
// POST — their answer.
//
// Dustin asked for two things that sound like one: the answer goes to his
// INBOX, and it goes onto the client's RECORD. They are not the same job. A
// message is how he finds out today; the note is how he still has it in front
// of him three weeks later when he actually writes their next block. An answer
// that only exists as a chat message is an answer he will not have then.
//
// "Only substantive answers to inbox" was explicit. Thirty-five clients each
// replying "all good" every fortnight would train him to ignore the whole
// channel, and then the one person who wrote something real gets ignored with
// them. Non-substantive answers are still SAVED — they are just not delivered.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inboxAuthUidForClient } from "@/lib/trainerResolve";

export const dynamic = "force-dynamic";
/**
 * Is this answer worth putting in front of Dustin?
 *
 * Deliberately generous — the cost of delivering a shrug is one line he
 * skims; the cost of swallowing a real answer is a client who said something
 * important and got no response, and never bothers again. So this only filters
 * what is unambiguously a non-answer.
 */
export function isSubstantive(answer: string): boolean {
  const a = (answer || "").trim().toLowerCase().replace(/[.!]+$/, "");
  if (a.length < 8) return false;
  const dismissals = [
    "no", "nope", "nah", "n/a", "na", "none", "nothing", "all good", "im good",
    "i'm good", "all g", "good", "great", "fine", "ok", "okay", "yes", "yep",
    "yeah", "sure", "nothing really", "not really", "no changes", "no change",
    "keep it the same", "same", "all good thanks", "nothing right now",
    "nope all good", "no im good", "no i'm good", "everything is good",
    "everything's good", "its all good", "it's all good",
  ];
  return !dismissals.includes(a);
}

async function myClientId(): Promise<{ cid: string | null; email: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { cid: null, email: null };
  const { data } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
  return { cid: (data as { id: string } | null)?.id ?? null, email: user.email ?? null };
}

export async function GET() {
  const { cid } = await myClientId();
  if (!cid) return NextResponse.json({ question: null });

  const db = createAdminClient();
  const { data } = await db
    .from("client_program_feedback")
    .select("id, question, week_start")
    .eq("client_id", cid)
    .is("answered_at", null)
    .order("week_start", { ascending: false })
    .limit(1);

  const row = ((data as { id: string; question: string; week_start: string }[]) || [])[0] || null;
  return NextResponse.json({ question: row });
}

export async function POST(req: NextRequest) {
  const { cid } = await myClientId();
  if (!cid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string; answer?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const answer = (body.answer || "").trim().slice(0, 2000);
  if (!body.id || !answer) return NextResponse.json({ error: "Missing answer" }, { status: 400 });

  const db = createAdminClient();

  // Scoped to this client's own row. Without the client_id filter a guessed id
  // would let anyone answer anyone's question.
  const { data: rows } = await db
    .from("client_program_feedback")
    .select("id, question, week_start, answered_at")
    .eq("id", body.id)
    .eq("client_id", cid)
    .limit(1);
  const row = ((data_first(rows)) as { id: string; question: string; week_start: string; answered_at: string | null } | null);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.answered_at) return NextResponse.json({ ok: true, alreadyAnswered: true });

  const substantive = isSubstantive(answer);

  // Checked. This is the write that IS the answer; everything below it is a
  // copy. Unchecked, a refused update returned `{ ok: true }` and the client
  // watched their answer disappear from the screen, having gone nowhere.
  const { error: saveErr } = await db
    .from("client_program_feedback")
    .update({
      answer,
      answered_at: new Date().toISOString(),
      delivered_at: substantive ? new Date().toISOString() : null,
    })
    .eq("id", row.id);
  if (saveErr) {
    return NextResponse.json(
      { error: "That didn't send — give it another go in a moment." },
      { status: 500 },
    );
  }

  // ── The record ───────────────────────────────────────────────────────────
  // Every answer, substantive or not, appended to the client's notes with the
  // question attached. Stripped of its question an answer is unreadable in six
  // weeks: "more upper body" means nothing without what was asked.
  try {
    const { data: c } = await db.from("clients").select("name, notes").eq("id", cid).maybeSingle();
    const client = c as { name: string | null; notes: string | null } | null;
    const stamp = new Date().toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const entry = `[${stamp}] Programming check-in\nQ: ${row.question}\nA: ${answer}`;
    const notes = client?.notes ? `${client.notes}\n\n${entry}` : entry;
    // Captured, not just wrapped. A PostgREST failure RETURNS an error, it does
    // not throw — so the catch around this block never saw a failed note append
    // and the console line it was written to produce could not fire. The answer
    // itself is already saved, so this stays best-effort; it just has to be
    // capable of saying it went wrong.
    const { error: noteErr } = await db.from("clients").update({ notes }).eq("id", cid);
    if (noteErr) console.error("program-feedback: note append failed", noteErr.message);
  } catch (e) {
    console.error("program-feedback: note append threw", e);
  }

  // ── The inbox ────────────────────────────────────────────────────────────
  //
  // `delivered` is what the client is TOLD. It must mean the message landed in
  // Dustin's inbox, not that we intended to put it there — the insert was
  // unchecked and the response said `delivered: true` regardless, so a client
  // could be told their coach had their answer when nothing had been written.
  let delivered = false;
  if (substantive) {
    try {
      const [trainerUid, { data: c }] = await Promise.all([
        // THIS client's coach. It used to read trainer_settings with
        // `.limit(1)` on the note that the table "holds the single trainer auth
        // user id". It holds one row per trainer with a connected calendar, and
        // there are two trainers now — so `.limit(1)` would have decided, per
        // request, which coach receives a client's programming answer. The
        // client is told `delivered: true` either way.
        inboxAuthUidForClient(db, cid),
        db.from("clients").select("name, auth_user_id").eq("id", cid).maybeSingle(),
      ]);
      const from = (c as { auth_user_id: string | null } | null)?.auth_user_id ?? null;

      if (trainerUid && from) {
        const { error: msgErr } = await db.from("messages").insert({
          from_id: from,
          to_id: trainerUid,
          client_id: cid,
          body: `📋 Programming check-in\n\n“${row.question}”\n\n${answer}`,
          is_group: false,
          is_broadcast: false,
        });
        if (msgErr) console.error("program-feedback: inbox delivery failed", msgErr.message);
        else delivered = true;
      } else {
        console.error("program-feedback: no trainer or client auth user — nothing delivered");
      }
    } catch (e) {
      console.error("program-feedback: inbox delivery threw", e);
    }
  }

  // The answer is saved either way — `ok` says so. `delivered` says only
  // whether it also reached the inbox.
  return NextResponse.json({ ok: true, delivered });
}

function data_first<T>(rows: T[] | null | undefined): T | null {
  return (rows || [])[0] ?? null;
}
