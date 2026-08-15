// Shared auth + client-scoping + metering guard for the nutrition AI routes.
// Trainer identity comes from @/lib/trainer (a setting, not a literal); clients
// map to a `clients` row via auth_user_id (email fallback).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiFeature, AiPaused, CapExceeded } from "@/lib/ai/meter-core";
import { assertNotPaused, capBody, checkAndLog, pausedBody } from "@/lib/ai/meter";
// Re-exported so the many routes that already import TRAINER_EMAIL from here
// keep working. The single source of truth is @/lib/trainer.
export { TRAINER_EMAIL, TRAINER_EMAILS, isTrainerEmail, isTrainerUser } from "@/lib/trainer";
import { isTrainerEmail, COACH_FIRST_NAME } from "@/lib/trainer";
import { getServerUser } from "@/lib/auth/serverUser";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;

export interface AiScope {
  supabase: Db;
  userId: string;
  email: string | null;
  isTrainer: boolean;
  /** The client this request operates on (trainer may have none selected). */
  clientId: string | null;
}

export type ScopeResult = { ok: true; scope: AiScope } | { ok: false; response: NextResponse };

/**
 * Authenticates the caller and resolves the client the request is scoped to.
 * - No session → 401.
 * - Clients may only act as themselves (a mismatched clientId → 403).
 * - The trainer may pass any clientId; without one we fall back to the
 *   trainer's own client row (client-mode) or null.
 */
export async function resolveAiScope(requestedClientId?: string | null): Promise<ScopeResult> {
  const supabase = await createClient();

  // THIS IS THE GATE FOR EVERY AI ROUTE IN THE APP, and until 15 Aug it awaited
  // Supabase Auth with no time limit. During that morning's outage the auth
  // service was taking 10–65 seconds, so every AI feature — the coach, food
  // parsing, photo analysis, the workout builder, the trainer agent — simply
  // hung. Confirmed live: a /api/nutrition-ai/coach call was still waiting at
  // 28 seconds while the app's own pages were serving in 150ms, because the
  // page path had already been fixed and this had not.
  //
  // getServerUser verifies the session token locally when it can and falls back
  // to a capped getUser when it cannot. See src/lib/auth/verifyJwt.ts.
  //
  // IT FAILS CLOSED, and that is the difference between here and the
  // middleware. When auth cannot be resolved at all, `user` is null and the
  // line below returns 401 — an API route has nothing downstream to defer to,
  // so 'I could not establish who you are' must mean no. Only the middleware
  // passes through, and only because the page re-checks.
  const {
    data: { user },
  } = await getServerUser(supabase);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const isTrainer = isTrainerEmail(user.email);

  let ownClientId: string | null = null;
  const { data: byAuth } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  ownClientId = byAuth?.id ?? null;
  if (!ownClientId && user.email) {
    const { data: byEmail } = await supabase
      .from("clients")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();
    ownClientId = byEmail?.id ?? null;
  }

  let clientId: string | null;
  if (requestedClientId) {
    if (!isTrainer && requestedClientId !== ownClientId) {
      return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    clientId = requestedClientId;
  } else {
    if (!isTrainer && !ownClientId) {
      return {
        ok: false,
        response: NextResponse.json({ error: "No client profile found for this account" }, { status: 403 }),
      };
    }
    clientId = ownClientId;
  }

  return {
    ok: true,
    scope: { supabase, userId: user.id, email: user.email ?? null, isTrainer, clientId },
  };
}

/**
 * Enforce the global kill switch + the per-client daily cap. Returns a ready
 * NextResponse when the request must stop, null when it may proceed.
 */
export async function enforceMeter(clientId: string | null, feature: AiFeature): Promise<NextResponse | null> {
  try {
    if (clientId) await checkAndLog(clientId, feature);
    else await assertNotPaused(); // no client to cap (e.g. trainer) — kill switch still applies
    return null;
  } catch (e) {
    if (e instanceof AiPaused) return NextResponse.json(pausedBody(), { status: 200 });
    if (e instanceof CapExceeded) return NextResponse.json(capBody(e), { status: 429 });
    console.error("enforceMeter: unexpected error (failing open)", e);
    return null;
  }
}

/** 503 body used by every route when the Anthropic key is missing. */
export function missingKeyResponse(): NextResponse {
  return NextResponse.json(
    { error: `AI is not configured yet. Ask ${COACH_FIRST_NAME} to add ANTHROPIC_API_KEY to Vercel.` },
    { status: 503 }
  );
}
