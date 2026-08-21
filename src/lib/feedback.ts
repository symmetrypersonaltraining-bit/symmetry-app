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
 * WHOSE BOARD THIS BELONGS ON.
 *
 * `client_id` was already captured. `reported_by`, `trainer_email` and
 * `app_instance` were not: on 21 Aug 2026 all three were empty on all 106 rows,
 * while only 40 carried a client id at all. So a report recorded WHAT was said
 * and, most of the time, not who said it — which is survivable with one trainer
 * and one roster, and stops being survivable the moment there are two.
 *
 * `reported_by` is a name to read. `trainer_email` is the coach whose book the
 * report belongs to — the reporter themselves if a trainer filed it, otherwise
 * the trainer of the client who did. `app_instance` tags the deployment.
 *
 * Every field is best-effort and a failure anywhere returns what it has. An
 * unattributed bug report still beats a lost one, and that has not changed.
 */
interface Reporter {
  clientId: string | null;
  reportedBy: string | null;
  trainerEmail: string | null;
}

async function resolveReporter(sb: SupabaseClient): Promise<Reporter> {
  const out: Reporter = { clientId: null, reportedBy: null, trainerEmail: null };
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return out;
    out.reportedBy = user.email ?? null;

    // A trainer first: they are their own attribution, and a trainer who also
    // has a client row must not be filed under whoever trains THEM.
    const { data: tRows } = await sb
      .from("trainers").select("name, email").eq("auth_user_id", user.id).limit(1);
    const t = (tRows as { name?: string; email?: string }[] | null)?.[0];
    if (t) {
      out.reportedBy = t.name || t.email || out.reportedBy;
      out.trainerEmail = t.email ?? null;
      return out;
    }

    const { data: byAuth } = await sb
      .from("clients").select("id, name, trainers(email)").eq("auth_user_id", user.id).maybeSingle();
    let c = byAuth as { id?: string; name?: string; trainers?: { email?: string } | { email?: string }[] } | null;
    if (!c?.id && user.email) {
      const { data: byEmail } = await sb
        .from("clients").select("id, name, trainers(email)").eq("email", user.email).maybeSingle();
      c = byEmail as typeof c;
    }
    if (c?.id) {
      out.clientId = c.id;
      out.reportedBy = c.name || out.reportedBy;
      const tj = Array.isArray(c.trainers) ? c.trainers[0] : c.trainers;
      out.trainerEmail = tj?.email ?? null;
    }
    return out;
  } catch {
    return out;
  }
}

/**
 * Which deployment. `live` unless something says otherwise.
 *
 * There was a second instance for a second trainer to test on; it is being
 * retired in favour of running test trainers on the live app, so this will
 * read `live` for everything for the foreseeable future. It is recorded anyway
 * because a column that is populated is a column you can trust later, and one
 * that is silently NULL is the state this whole change exists to fix.
 */
function appInstance(): string {
  return process.env.NEXT_PUBLIC_APP_INSTANCE || "live";
}

export async function submitFeedback(sb: SupabaseClient, input: FeedbackInput): Promise<string | null> {
  const who = await resolveReporter(sb);
  const { data, error } = await sb
    .from("app_feedback")
    .insert({
      source: input.source,
      client_context: input.context ?? (typeof window !== "undefined" ? window.location.pathname : null),
      transcript: input.transcript,
      status: "new",
      photo_url: input.imageUrl ?? null,
      client_id: who.clientId,
      reported_by: who.reportedBy,
      trainer_email: who.trainerEmail,
      app_instance: appInstance(),
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
