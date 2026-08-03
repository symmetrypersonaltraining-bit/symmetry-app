// One way to file feedback, used by every surface that files it.
//
// There were four independent inserts into app_feedback — HeaderAssist,
// FloatingDock, FeedbackButton and the workout logger — each building the row
// slightly differently. None of them recorded WHO was reporting, so working out
// that ten screenshots were Jennifer Day's meant resolving workout ids out of a
// URL path by hand. And nothing ever read the images, so five of hers sat
// unopened for two days while three of them said a version of "this field is
// wrong" without saying which field, because the picture was carrying that.
//
// Both gaps are the same shape: information that existed at the moment of
// submission and was thrown away. This captures it there instead.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface FeedbackInput {
  /** Where it came from: "app", "client-app", "trainer-app", or an email. */
  source: string;
  transcript: string;
  /** Public URL of an already-uploaded screenshot, if there is one. */
  imageUrl?: string | null;
  /** Overrides window.location.pathname when the caller knows better. */
  context?: string | null;
}

/**
 * Who is filing this. Resolved from the session, never typed.
 *
 * Returns null for the trainer and for anyone without a client row, and a null
 * here must never block the report — an unattributed bug report still beats a
 * lost one.
 */
async function resolveClientId(sb: SupabaseClient): Promise<string | null> {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data: byAuth } = await sb.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (byAuth?.id) return byAuth.id as string;
    if (user.email) {
      const { data: byEmail } = await sb.from("clients").select("id").eq("email", user.email).maybeSingle();
      if (byEmail?.id) return byEmail.id as string;
    }
    return null;
  } catch {
    return null;
  }
}

export async function submitFeedback(sb: SupabaseClient, input: FeedbackInput): Promise<string | null> {
  const clientId = await resolveClientId(sb);
  const { data, error } = await sb
    .from("app_feedback")
    .insert({
      source: input.source,
      client_context: input.context ?? (typeof window !== "undefined" ? window.location.pathname : null),
      transcript: input.transcript,
      status: "new",
      photo_url: input.imageUrl ?? null,
      client_id: clientId,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  const id = (data as { id: string }).id;

  // Read the screenshot now, while we know it exists and somebody cares. Fire
  // and forget on purpose: the report is already saved, and the client should
  // never wait on — or be shown a failure from — a description they will never
  // see. If it fails the row simply has no summary.
  if (input.imageUrl) {
    void fetch("/api/feedback/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedbackId: id, imageUrl: input.imageUrl }),
    }).catch(() => { /* the report stands on its own */ });
  }

  return id;
}
