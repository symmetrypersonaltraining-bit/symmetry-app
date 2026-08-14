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
  warnThresholdCrossed,
  projectedMonthEndUsd,
  MONTHLY_COST_CAP_USD,
  resolveDailyLimit,
} from "@/lib/ai/meter-core";
import { TRAINER_EMAIL, COACH_FIRST_NAME } from "@/lib/trainer";

export { AiPaused, CapExceeded } from "@/lib/ai/meter-core";
export type { AiFeature } from "@/lib/ai/meter-core";
const RESEND_API_URL = "https://api.resend.com/emails";
// Marker "feature" for the once-per-day pause notification (cost 0, no client).
const PAUSE_NOTICE_FEATURE = "kill_switch_notice";
// Marker "feature" for the once-per-MONTH $60 heads-up (cost 0, no client).
const WARN_NOTICE_FEATURE = "budget_warning_notice";

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
    used_on: today,
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

/**
 * "You're at $60 of $95" — once for the month, nothing paused.
 *
 * The cap used to have exactly one notification and it was the one that says
 * AI is ALREADY off for all 35 clients. This is the warning shot.
 *
 * ONCE PER MONTH, not per day. The pause notice repeats daily because the
 * situation is live and unresolved; this one is a heads-up, and a heads-up that
 * arrives every morning for two weeks is something you filter.
 *
 * Same durable-marker trick as the pause notice: a zero-cost row in
 * ai_usage_log is the lock, because Vercel runs many instances and a
 * module-level boolean dedupes nothing across them.
 */
async function notifyTrainerApproaching(db: Db, monthToDateUsd: number): Promise<void> {
  const monthStart = chicagoMonthStartUtc().toISOString();
  const { data: existing, error: readErr } = await db
    .from("ai_usage_log")
    .select("id")
    .eq("feature", WARN_NOTICE_FEATURE)
    .gte("created_at", monthStart)
    .limit(1);
  if (readErr) return; // can't verify → skip rather than risk spamming
  if (existing && existing.length > 0) return;

  const { error: insErr } = await db.from("ai_usage_log").insert({
    client_id: null,
    used_on: chicagoToday(),
    feature: WARN_NOTICE_FEATURE,
    model: "none",
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
  });
  // Marker first, email second. If the marker fails we send nothing — a missed
  // warning is recoverable, thirty identical emails is not.
  if (insErr) return;

  if (!process.env.RESEND_API_KEY) return;

  const now = new Date();
  const chicago = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const dayOfMonth = chicago.getDate();
  const daysInMonth = new Date(chicago.getFullYear(), chicago.getMonth() + 1, 0).getDate();
  const projected = projectedMonthEndUsd(monthToDateUsd, dayOfMonth, daysInMonth);
  const willTrip = projected >= MONTHLY_COST_CAP_USD;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#F5B34A;border-radius:12px 12px 0 0;padding:20px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">Symmetry — AI spend heads-up</h1>
  </div>
  <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:24px">
    <p style="color:#333;font-size:15px;margin:0 0 12px">
      This month's Anthropic spend is at <strong>$${monthToDateUsd.toFixed(2)}</strong>
      of the <strong>$95</strong> cap, on day ${dayOfMonth} of ${daysInMonth}.
      <strong>Nothing is paused</strong> — everything is working normally.
    </p>
    <p style="color:#333;font-size:15px;margin:0 0 12px">
      At this rate the month lands around <strong>$${projected.toFixed(2)}</strong>.
      ${willTrip
        ? `That would hit the cap before month end, which pauses AI for all clients until the 1st.`
        : `That stays under the cap, so this is a heads-up rather than something to act on.`}
    </p>
    <p style="color:#555;font-size:14px;margin:0 0 12px">
      If it does hit $95, clients see a friendly "taking a break" message and can still log
      everything by hand — but the coach, photo analysis and food parsing all stop.
      You can raise the cap in <code>meter-core.ts</code> (MONTHLY_COST_CAP_USD), or lower
      the per-client daily limits in client_app_settings to slow the burn.
    </p>
    <p style="color:#999;font-size:12px;margin:0">Sent once per month, the first time spend crosses $60.</p>
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
        subject: `AI spend at $${monthToDateUsd.toFixed(2)} of $95 — heads-up, nothing paused`,
        html,
      }),
    });
  } catch (e) {
    console.error("meter: warn email failed", e);
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
  // The warning rides on the month-to-date figure that was just computed for
  // the kill switch, so it costs no extra query on a path that runs before
  // every AI call. It never throws and never blocks: a failure to warn must
  // not be a failure to answer a client.
  if (warnThresholdCrossed(mtd)) {
    await notifyTrainerApproaching(d, mtd).catch((e) => console.error("meter: warn failed", e));
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

  // null = this surface carries no per-client cap (trainer tools, unattended
  // jobs). assertUnderCap treats null as "no cap" rather than "cap of zero" —
  // getting that backwards would brick the surface entirely.
  let limit: number | null;
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
 *
 * `opts.latencyMs` is optional; pass it when the caller timed the call, so the
 * health page can show which surfaces are slow as well as which are broken.
 */
export async function logUsage(
  clientId: string | null,
  feature: AiFeature,
  tokensIn: number,
  tokensOut: number,
  model: string,
  opts?: { latencyMs?: number; startedAt?: Date }
): Promise<number> {
  const cost = computeCostUsd(model, tokensIn, tokensOut);
  try {
    const db = admin();
    if (!db) return cost;
    // used_on is what the ai_usage_daily / ai_usage_monthly rollup views group
    // by, and it has no meaningful default for a Chicago day — set it here so
    // the spend reports aren't one big NULL bucket.
    const { error } = await db.from("ai_usage_log").insert({
      client_id: clientId,
      used_on: chicagoToday(),
      feature,
      model,
      tokens_in: Math.max(0, Math.round(tokensIn)),
      tokens_out: Math.max(0, Math.round(tokensOut)),
      cost_usd: cost,
      status: "ok",
      latency_ms: opts?.latencyMs != null ? Math.max(0, Math.round(opts.latencyMs)) : null,
      started_at: (opts?.startedAt ?? new Date()).toISOString(),
    });
    if (error) console.error("meter: logUsage insert failed", error.message);
  } catch (e) {
    console.error("meter: logUsage failed", e);
  }
  return cost;
}

/**
 * Record an AI call that FAILED.
 *
 * Until 13 Aug this had no equivalent: `logUsage` ran only after a successful
 * call, so a route broken for a week was indistinguishable from a route nobody
 * used. That is precisely how the 8 Aug outage ran unnoticed for two days, and
 * it is why the movement screen could discard every result it produced without
 * anything surfacing it.
 *
 * Costs nothing (a failed call bills no tokens) so it never moves the kill
 * switch — it exists purely so the failure is a row rather than a silence.
 * Never throws.
 */
export async function logFailure(
  clientId: string | null,
  feature: AiFeature,
  model: string,
  err: unknown,
  opts?: { latencyMs?: number; startedAt?: Date; tokensIn?: number; tokensOut?: number }
): Promise<void> {
  try {
    const db = admin();
    if (!db) return;
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    // A call that reached the model and then failed validation still SPENT
    // those tokens. Recording them as zero would under-count the kill switch,
    // which is the one thing meant to stop a runaway bill — and a retry loop
    // that fails validation every time is exactly the shape of a runaway bill.
    const tokensIn = Math.max(0, Math.round(opts?.tokensIn ?? 0));
    const tokensOut = Math.max(0, Math.round(opts?.tokensOut ?? 0));
    const { error } = await db.from("ai_usage_log").insert({
      client_id: clientId,
      used_on: chicagoToday(),
      feature,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: computeCostUsd(model, tokensIn, tokensOut),
      status: "error",
      // Bounded: some provider errors carry an entire request body, and a
      // multi-megabyte string in a log row helps nobody.
      error: message.slice(0, 500),
      latency_ms: opts?.latencyMs != null ? Math.max(0, Math.round(opts.latencyMs)) : null,
      started_at: (opts?.startedAt ?? new Date()).toISOString(),
    });
    if (error) console.error("meter: logFailure insert failed", error.message);
  } catch (e) {
    console.error("meter: logFailure failed", e);
  }
}

/**
 * Time an AI call and record it either way.
 *
 * The shape most routes want: run the model call, log a success with real
 * latency, or log the failure and rethrow so the route's own error handling is
 * unchanged. A route that adopts this can never again fail silently.
 */
export async function withUsage<T>(
  clientId: string | null,
  feature: AiFeature,
  model: string,
  fn: () => Promise<{ value: T; tokensIn: number; tokensOut: number }>
): Promise<T> {
  const startedAt = new Date();
  const t0 = Date.now();
  try {
    const { value, tokensIn, tokensOut } = await fn();
    await logUsage(clientId, feature, tokensIn, tokensOut, model, {
      latencyMs: Date.now() - t0,
      startedAt,
    });
    return value;
  } catch (e) {
    await logFailure(clientId, feature, model, e, { latencyMs: Date.now() - t0, startedAt });
    throw e;
  }
}

/** Friendly body for the global-pause state (HTTP 200 so UIs render the message). */
export function pausedBody() {
  return {
    paused: true,
    error: `AI features are taking a short break this month — you can still log everything manually, and ${COACH_FIRST_NAME} has been notified.`,
    message: `AI features are taking a short break this month — you can still log everything manually, and ${COACH_FIRST_NAME} has been notified.`,
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
