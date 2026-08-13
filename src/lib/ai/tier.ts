// WHICH TIER A CLIENT'S AI RUNS ON. One answer, in one place.
//
// Dustin, 2026-08-13, about his parents Gerard (71) and Sharon:
//
//   "I need their AI to be able to do anything they need to do in that app for
//    them so they don't have to figure it out... That AI bot for them across the
//    entire app needs to be a lot higher model so that it can do exactly what
//    they tell it to do."
//
// WHY THIS IS ONE FUNCTION AND NOT AN `if` AT EACH CALL SITE.
//
// The requirement is "across the entire app". There are two dozen routes that
// call a model, and a client cannot be expected to know which screens got the
// good one — from their side it is one assistant that is sometimes clever. So
// the tier has to be read the same way everywhere, which means it has to be
// read from one function.
//
// It also has to FAIL TO STANDARD, loudly-never. A lookup failure returning
// 'advanced' would quietly raise everyone's cost; returning 'standard' gives an
// advanced client one ordinary answer. The first is a bill, the second is a
// blip, so every unhappy path returns 'standard'.
//
// The cache is not an optimisation for its own sake: /api/nutrition-ai/act
// resolves the tier twice in one request (extraction, then the coach answer),
// and several cron sweeps resolve it once per client in a loop.

import type { AiTier } from "@/lib/ai/anthropic";
import type { Db } from "@/lib/ai/scope";

const TTL_MS = 60_000;
const cache = new Map<string, { tier: AiTier; at: number }>();

/**
 * The tier for one client. 'standard' for anyone without a row, without the
 * column, or when the lookup fails.
 */
export async function aiTierFor(db: Db, clientId: string | null | undefined): Promise<AiTier> {
  if (!clientId) return "standard";

  const hit = cache.get(clientId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.tier;

  try {
    const { data, error } = await db
      .from("client_app_settings")
      .select("ai_tier")
      .eq("client_id", clientId)
      .maybeSingle();
    // A missing column (not deployed yet) errors here. Standard is correct.
    if (error) return "standard";
    const tier = (data as { ai_tier?: string | null } | null)?.ai_tier === "advanced"
      ? "advanced"
      : "standard";
    cache.set(clientId, { tier, at: Date.now() });
    return tier;
  } catch {
    return "standard";
  }
}

/**
 * Forget a cached tier. Called when the setting changes so a trainer flipping it
 * does not have to wait out the TTL wondering whether it took.
 */
export function forgetAiTier(clientId: string): void {
  cache.delete(clientId);
}
