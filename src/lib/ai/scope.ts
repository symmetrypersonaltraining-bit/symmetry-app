// Shared auth + client-scoping + metering guard for the nutrition AI routes.
// Pattern matches the rest of the app: trainer is identified by email, clients
// map to a `clients` row via auth_user_id (email fallback).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiFeature, AiPaused, CapExceeded } from "@/lib/ai/meter-core";
import { assertNotPaused, capBody, checkAndLog, pausedBody } from "@/lib/ai/meter";

export const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const isTrainer = user.email === TRAINER_EMAIL;

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
    { error: "AI is not configured yet. Ask Dustin to add ANTHROPIC_API_KEY to Vercel." },
    { status: 503 }
  );
}
