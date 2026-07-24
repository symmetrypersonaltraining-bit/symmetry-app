// AI usage metering — DB glue around meter-core.ts (which holds the pure,
// unit-tested logic). Server-side only: uses the service-role client so caps
// are enforced regardless of RLS, and inserts into ai_usage_log.
//
// checkAndLog(clientId, feature)  → throws CapExceeded / AiPaused
// logUsage(clientId, feature, tokensIn, tokensOut, model) → inserts row, returns cost
//
// GLOBAL KILL SWITCH: when month-to-date summed cost_usd >= $95 every AI
// feature throws AiPaused (routes turn that into a friendly "paused" JSON),
// and the trainer is emailed once per Chicago day via Resend.

import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AiFeature,
  AiPaused,
  CapExceeded,
  assertUnderCap,
  chicagoDayStartUtc,
  chicagoMonthStartUtc,
  chicagoToday,
  computeCostUsd,
  killSwitchTripped,
  resolveDailyLimit,
} from "@/lib/ai/meter-core";

export { AiPaused, CapExceeded } from "@/lib/ai/meter-core";
export type { AiFeature } from "@/lib/ai/meter-core";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";
const RESEND_API_URL = "https://api.resend.com/emails";
// Marker "feature" for the once-per-day pause notification (cost 0, no client).
const PAUSE_NOTICE_FEATURE = "kill_switch_notice";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

function admin(): Db | null {
  try {
    return createAdminClient();
  } catch (e) {
    console.error("meter: admin client unavailable", e);
    return null;
  }
}

/** Month-to-date (Chicago month) summed cost_usd across ALL clients/features. */
async function monthToDateCostUsd(db: Db): Promise<number> {
  const monthStart = chicagoMonthStartUtc().toISOString();
  let sum = 0;
  const page = 1000;
  for (let from = 0; from < 100_000; from += page) {
    const { data, error } = await db
      .from("ai_usage_log")
      .select("cost_usd")
      .gte("created_at", monthStart)
      .range(from, from + page - 1);
    if (error || !data) {
      // Table missing / transient error → fail open on the kill switch (caps
      // below still apply); never brick every AI feature over a read error.
      if (error) console.error("meter: month-to-date cost query failed", error.message);
      break;
    }
    for (const r of data as { cost_usd: number | string | null }[]) sum += Number(r.cost_usd) || 0;
    if (data.length < page) break;
  }
  return sum;
}

// Per-instance backstop so a failing insert can't cause an email storm.
let pauseNoticeSentForDay: string | null = null;

async function notifyTrainerPaused(db: Db, monthToDateUsd: number): Promise<void> {
  const today = chicagoToday();
  if (pauseNoticeSentForDay === today) return;
  pauseNoticeSentForDay = today;

  // Durable once-per-day guard: a zero-cost marker row in ai_usage_log.
  const dayStart = chicagoDayStartUtc().toISOString();
  const { data: existing, error: readErr } = await db
    .from("ai_usage_log")
    .select("id")
    .eq("feature", PAUSE_NOTICE_FEATURE)
    .gte("created_at", dayStart)
    .limit(1);
  if (readErr) return; // can't verify → skip rather than risk spamming
  if (existing && existing.length > 0) return;

  const { error: insErr } = await db.from("ai_usage_log").insert({
    client_id: null,
    feature: PAUSE_NOTICE_FEATURE,
    model: "none",
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
  });
  if (insErr) return; // couldn't record the marker → don't email (avoids repeats)

  if (!process.env.RESEND_API_KEY) return;
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#E53935;border-radius:12px 12px 0 0;padding:20px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">Symmetry — AI paused</h1>
  </div>
  <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:24px">
    <p style="color:#333;font-size:15px;margin:0 0 12px">
      The app's AI features (photo analysis, food parsing, coach chat, plan builder) have been
      <strong>paused automatically</strong> — this month's Anthropic spend hit
      <strong>$${monthToDateUsd.toFixed(2)}</strong> (cap: $95).
    </p>
    <p style="color:#555;font-size:14px;margin:0 0 12px">
      Clients see a friendly "taking a break" message and can still log everything manually.
      AI resumes automatically on the 1st, or raise the cap / clear usage in Supabase to resume sooner.
    </p>
    <p style="color:#999;font-size:12px;margin:0">Sent once per day while the cap is exceeded.</p>
  </div>
</div>`.trim();
  try {
    await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Symmetry Corrective <noreply@symmetrypersonaltraining.com>",
        to: [TRAINER_EMAIL],
        subject: `AI features paused — $${monthToDateUsd.toFixed(2)} month-to-date (cap $95)`,
        html,
      }),
    });
  } catch (e) {
    console.error("meter: pause-notice email failed", e);
  }
}

/** Throws AiPaused when the global monthly kill switch has tripped. */
export async function assertNotPaused(db?: Db): Promise<void> {
  const d = db ?? admin();
  if (!d) return; // no admin key configured → fail open
  const mtd = await monthToDateCostUsd(d);
  if (killSwitchTripped(mtd)) {
    await notifyTrainerPaused(d, mtd).catch((e) => console.error("meter: notify failed", e));
    throw new AiPaused(mtd);
  }
}

/**
 * Gate an AI request: global kill switch first, then the client's daily cap
 * for this feature (client_app_settings override, defaults 15/15/20/1/20;
 * "today" = America/Chicago). Throws AiPaused or CapExceeded; infra errors
 * fail open so a metering hiccup never blocks logging food.
 */
export async function checkAndLog(clientId: string, feature: AiFeature): Promise<void> {
  const db = admin();
  if (!db) return;

  await assertNotPaused(db);

  let limit: number;
  let used: number;
  try {
    const { data: settings } = await db
      .from("client_app_settings")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();
    limit = resolveDailyLimit(settings as Record<string, unknown> | null, feature);

    const dayStart = chicagoDayStartUtc().toISOString();
    const { count, error } = await db
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("feature", feature)
      .gte("created_at", dayStart);
    if (error) {
      console.error("meter: usage count failed", error.message);
      return; // fail open
    }
    used = count ?? 0;
  } catch (e) {
    console.error("meter: checkAndLog infra error", e);
    return; // fail open
  }

  assertUnderCap(feature, used, limit); // throws CapExceeded when used >= limit
}

/**
 * Record a completed AI call. Cost: Haiku $1/$5 per MTok in/out, Sonnet $3/$15.
 * Never throws — a logging failure must not fail the user's request.
 * Returns the computed cost in USD.
 */
export async function logUsage(
  clientId: string | null,
  feature: AiFeature,
  tokensIn: number,
  tokensOut: number,
  model: string
): Promise<number> {
  const cost = computeCostUsd(model, tokensIn, tokensOut);
  try {
    const db = admin();
    if (!db) return cost;
    const { error } = await db.from("ai_usage_log").insert({
      client_id: clientId,
      feature,
      model,
      tokens_in: Math.max(0, Math.round(tokensIn)),
      tokens_out: Math.max(0, Math.round(tokensOut)),
      cost_usd: cost,
    });
    if (error) console.error("meter: logUsage insert failed", error.message);
  } catch (e) {
    console.error("meter: logUsage failed", e);
  }
  return cost;
}

/** Friendly body for the global-pause state (HTTP 200 so UIs render the message). */
export function pausedBody() {
  return {
    paused: true,
    error: "AI features are taking a short break this month — you can still log everything manually, and Dustin has been notified.",
    message: "AI features are taking a short break this month — you can still log everything manually, and Dustin has been notified.",
  };
}

/** Body for a per-client daily cap (HTTP 429). */
export function capBody(e: CapExceeded) {
  return {
    capExceeded: true,
    feature: e.feature,
    limit: e.limit,
    error: `You've hit today's limit for this AI feature (${e.limit}/day). It resets at midnight — manual logging still works.`,
  };
}
