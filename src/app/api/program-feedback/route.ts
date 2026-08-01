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

export const dynamic = "force-dynamic";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

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

  await db
    .from("client_program_feedback")
    .update({
      answer,
      answered_at: new Date().toISOString(),
      delivered_at: substantive ? new Date().toISOString() : null,
    })
    .eq("id", row.id);

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
    await db.from("clients").update({ notes }).eq("id", cid);
  } catch (e) {
    console.error("program-feedback: note append failed", e);
  }

  // ── The inbox ────────────────────────────────────────────────────────────
  if (substantive) {
    try {
      const [{ data: ts }, { data: c }] = await Promise.all([
        db.from("trainer_settings").select("user_id").limit(1).maybeSingle(),
        db.from("clients").select("name, auth_user_id").eq("id", cid).maybeSingle(),
      ]);
      // trainer_settings holds the single trainer auth user id — the same row
      // the calendar sync reads. Looking the trainer up as a *client* would
      // work today only because Dustin also trains himself.
      const trainerUid = (ts as { user_id: string } | null)?.user_id ?? null;
      const from = (c as { auth_user_id: string | null } | null)?.auth_user_id ?? null;

      if (trainerUid && from) {
        await db.from("messages").insert({
          from_id: from,
          to_id: trainerUid,
          client_id: cid,
          body: `📋 Programming check-in\n\n“${row.question}”\n\n${answer}`,
          is_group: false,
          is_broadcast: false,
        });
      }
    } catch (e) {
      console.error("program-feedback: inbox delivery failed", e);
    }
  }

  return NextResponse.json({ ok: true, delivered: substantive });
}

function data_first<T>(rows: T[] | null | undefined): T | null {
  return (rows || [])[0] ?? null;
}
