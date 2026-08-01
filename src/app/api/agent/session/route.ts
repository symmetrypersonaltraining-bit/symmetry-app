// GET/DELETE /api/agent/session — the trainer agent's memory.
//
// The AI drawer kept its conversation in React state, so it was gone the moment
// Dustin navigated or the app reloaded. For a tool used BETWEEN clients — look
// something up, walk to the floor, come back to ask the follow-up — that is the
// difference between a chat and a series of unrelated questions.
//
// Stored server-side rather than in localStorage on purpose: he moves between
// his phone and a laptop, and a conversation that only exists on the device it
// started on is half a memory. It also means the history the model receives and
// the history he can see are the same object.
//
// One rolling session, not a list of them. He has never asked for a transcript
// archive, and a session picker is a feature nobody wants in a drawer you open
// with one thumb between sets. Old turns fall off the front.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAiScope } from "@/lib/ai/scope";

export const dynamic = "force-dynamic";

export const CONTEXT_TYPE = "trainer_agent";

/** Keep the tail. Long enough to hold a real thread, short enough to stay cheap. */
export const MAX_TURNS = 40;

/**
 * Conversations go stale. Coming back the next morning to yesterday's
 * half-finished thought about a different client is worse than a clean start —
 * the model would carry that context into an unrelated question.
 */
const MAX_AGE_HOURS = 12;

export async function GET() {
  const scoped = await resolveAiScope(null);
  if (!scoped.ok) return scoped.response;
  if (!scoped.scope.isTrainer) return NextResponse.json({ error: "Trainer only" }, { status: 403 });

  const db = createAdminClient();
  const { data } = await db
    .from("ai_chat_sessions")
    .select("id, messages, updated_at")
    .eq("context_type", CONTEXT_TYPE)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { id: string; messages: unknown; updated_at: string } | null;
  if (!row) return NextResponse.json({ messages: [] });

  const ageHours = (Date.now() - Date.parse(row.updated_at)) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours > MAX_AGE_HOURS) {
    return NextResponse.json({ messages: [], stale: true });
  }

  const messages = Array.isArray(row.messages) ? row.messages : [];
  return NextResponse.json({ messages, updated_at: row.updated_at });
}

export async function DELETE() {
  const scoped = await resolveAiScope(null);
  if (!scoped.ok) return scoped.response;
  if (!scoped.scope.isTrainer) return NextResponse.json({ error: "Trainer only" }, { status: 403 });

  const db = createAdminClient();
  await db.from("ai_chat_sessions").delete().eq("context_type", CONTEXT_TYPE);
  return NextResponse.json({ ok: true });
}
