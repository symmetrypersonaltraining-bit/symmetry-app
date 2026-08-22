"use server";

// Marking a client's movement note as dealt with.
//
// `exercise_notes.resolved` has existed since the table did and NOTHING has
// ever written it. On 21 Aug there were 63 rows and all 63 were false — 59 of
// them client-authored, the oldest from 19 July.
//
// That is not the same bug as "he never saw them". `routeTrainingNote` does
// deliver the ones worth interrupting him for, so most of these did arrive as
// messages at the time. The gap is that a message scrolls away and a note has
// no state, so there has never been a way to answer "which of these have I
// actually done something about?" — and the answer, for a month, was that
// nobody could tell.

import { createClient } from "@/lib/supabase/server";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { revalidatePath } from "next/cache";

/**
 * Mark one note resolved. Returns null on success, or a sentence to show.
 *
 * Scoped by RLS: `trainer_all_exercise_notes` is
 * `trainer_can_see_client(client_id)`, so a trainer can only ever resolve a
 * note belonging to one of their own clients — the update simply matches zero
 * rows otherwise.
 */
export async function resolveExerciseNote(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await viewerIsTrainer(supabase, user))) return "Trainer only.";

  // `.select("id")` is the guard, not decoration. PostgREST returns its error
  // rather than throwing, and an update matching ZERO rows is not an error at
  // all — so without asking which rows actually changed, a note blocked by RLS
  // or already gone would disappear from the list and come back on the next
  // load. That exact shape has cost this app a workout log and a payment
  // reminder already.
  const { data, error } = await supabase
    .from("exercise_notes")
    .update({ resolved: true })
    .eq("id", id)
    .select("id");

  if (error) return "Could not mark that done: " + error.message;
  if (!data || data.length === 0) {
    return "That note is not yours to close, or it is already gone. Refresh and try again.";
  }
  revalidatePath("/home");
  return null;
}

/** Put one back, for a misplaced tap. */
export async function unresolveExerciseNote(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await viewerIsTrainer(supabase, user))) return "Trainer only.";

  const { data, error } = await supabase
    .from("exercise_notes")
    .update({ resolved: false })
    .eq("id", id)
    .select("id");

  if (error) return "Could not undo that: " + error.message;
  if (!data || data.length === 0) return "Could not undo that — refresh and try again.";
  revalidatePath("/home");
  return null;
}
