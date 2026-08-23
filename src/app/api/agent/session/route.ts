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
 * How old a thread can be before the drawer treats it as yesterday's.
 *
 * This used to DISCARD the thread past 12 hours: walk in on Monday morning and
 * Sunday evening's conversation was simply gone, with nothing to say it had
 * ever existed. Dustin asked for the opposite — a rolling thread he clears
 * himself, that can tell him when it is old instead of silently starting over.
 *
 * So the thread is always returned now. `stale` is a flag ON it rather than a
 * reason to throw it away, and the drawer can say "this was yesterday, still on
 * Bobbie?" and let him decide.
 */
const STALE_AFTER_HOURS = 12;

export async function GET() {
  const scoped = await resolveAiScope(null);
  if (!scoped.ok) return scoped.response;
  if (!scoped.scope.isTrainer) return NextResponse.json({ error: "Trainer only" }, { status: 403 });

  const db = createAdminClient();
  const { data } = await db
    .from("ai_chat_sessions")
    .select("id, messages, updated_at")
    .eq("context_type", CONTEXT_TYPE)
    // WHOSE thread. Without this the newest 'trainer_agent' row on the whole
    // instance came back, so a second trainer opened the first one's
    // conversation — client names, injuries, money — and then overwrote it.
    .eq("owner_user_id", scoped.scope.userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { id: string; messages: unknown; updated_at: string } | null;
  if (!row) return NextResponse.json({ messages: [] });

  const ageHours = (Date.now() - Date.parse(row.updated_at)) / 3_600_000;
  const stale = !Number.isFinite(ageHours) || ageHours > STALE_AFTER_HOURS;

  const messages = Array.isArray(row.messages) ? row.messages : [];
  // The thread comes back either way. Losing a conversation without saying so
  // is the behaviour this route existed to fix in the first place.
  return NextResponse.json({ messages, updated_at: row.updated_at, stale, ageHours: Math.round(ageHours) });
}

export async function DELETE() {
  const scoped = await resolveAiScope(null);
  if (!scoped.ok) return scoped.response;
  if (!scoped.scope.isTrainer) return NextResponse.json({ error: "Trainer only" }, { status: 403 });

  const db = createAdminClient();
  // Clear MY thread. This used to delete every trainer_agent row there was.
  await db
    .from("ai_chat_sessions")
    .delete()
    .eq("context_type", CONTEXT_TYPE)
    .eq("owner_user_id", scoped.scope.userId);
  return NextResponse.json({ ok: true });
}
