// AI usage metering — PURE logic (no Supabase, no network, no Next.js imports).
// Everything here is unit-testable in plain node; the DB glue lives in meter.ts.
//
// Tables this supports (created in prod by the overnight schema workstream):
//   ai_usage_log(client_id, feature, model, tokens_in, tokens_out, cost_usd, created_at)
//   client_app_settings.ai_daily_*_limit int columns (per-client overrides).

export type AiFeature = "chat" | "parse" | "photo" | "plan_build" | "verify";

/** client_app_settings column that overrides the daily cap for each feature. */
export const LIMIT_COLUMNS: Record<AiFeature, string> = {
  chat: "ai_daily_chat_limit",
  parse: "ai_daily_parse_limit",
  photo: "ai_daily_photo_limit",
  plan_build: "ai_daily_plan_build_limit",
  verify: "ai_daily_verify_limit",
};

/** Per-client per-day defaults when the settings column is null/missing. */
export const DEFAULT_LIMITS: Record<AiFeature, number> = {
  chat: 15,
  parse: 15,
  photo: 20,
  plan_build: 1,
  verify: 20,
};

/** Global kill switch: month-to-date spend at/over this pauses ALL AI features. */
export const MONTHLY_COST_CAP_USD = 95;

// USD per million tokens (input / output). Matched by substring so dated model
// ids ("claude-haiku-4-5-20251001") and future minor bumps still price correctly.
const PRICING: Array<{ match: RegExp; inPerMTok: number; outPerMTok: number }> = [
  { match: /haiku/i, inPerMTok: 1, outPerMTok: 5 },
  { match: /sonnet/i, inPerMTok: 3, outPerMTok: 15 },
  { match: /opus/i, inPerMTok: 15, outPerMTok: 75 },
];

// Unknown model → price as Sonnet (the most expensive model we actually call)
// so a typo can never under-count spend against the kill switch.
const FALLBACK_PRICING = { inPerMTok: 3, outPerMTok: 15 };

export function computeCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICING.find((x) => x.match.test(model || "")) || FALLBACK_PRICING;
  const cost = (Math.max(0, tokensIn) / 1_000_000) * p.inPerMTok + (Math.max(0, tokensOut) / 1_000_000) * p.outPerMTok;
  return Math.round(cost * 1e6) / 1e6; // 6 dp — plenty for numeric(10,6)
}

/** Thrown when a client is over their daily cap for a feature. */
export class CapExceeded extends Error {
  readonly code = "CAP_EXCEEDED";
  constructor(
    public readonly feature: AiFeature,
    public readonly limit: number,
    public readonly used: number
  ) {
    super(`Daily AI limit reached for ${feature} (${used}/${limit})`);
    this.name = "CapExceeded";
  }
}

/** Thrown when the global monthly cost kill switch has tripped. */
export class AiPaused extends Error {
  readonly code = "AI_PAUSED";
  constructor(public readonly monthToDateUsd: number) {
    super("AI features are paused (monthly budget reached)");
    this.name = "AiPaused";
  }
}

/** Resolve the effective daily limit from a client_app_settings row (or null). */
export function resolveDailyLimit(
  settings: Record<string, unknown> | null | undefined,
  feature: AiFeature
): number {
  const raw = settings ? settings[LIMIT_COLUMNS[feature]] : undefined;
  const n = typeof raw === "number" ? raw : raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LIMITS[feature];
}

/** Throws CapExceeded when used >= limit. */
export function assertUnderCap(feature: AiFeature, used: number, limit: number): void {
  if (used >= limit) throw new CapExceeded(feature, limit, used);
}

export function killSwitchTripped(monthToDateUsd: number): boolean {
  return monthToDateUsd >= MONTHLY_COST_CAP_USD;
}

// ---------------------------------------------------------------------------
// America/Chicago day math. The logical "day" (and month) for all caps is the
// Chicago calendar day, NOT the UTC day of created_at.
// ---------------------------------------------------------------------------

const CHI_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD of the given instant in America/Chicago. */
export function chicagoDateOf(d: Date): string {
  return CHI_DATE_FMT.format(d);
}

export function chicagoToday(now: Date = new Date()): string {
  return chicagoDateOf(now);
}

/**
 * UTC instant of midnight (00:00) America/Chicago on the given YYYY-MM-DD.
 * Chicago is UTC-5 (CDT) or UTC-6 (CST); DST switches at 2am local, so local
 * midnight is never skipped/ambiguous — one of the two candidates always checks out.
 */
export function chicagoMidnightUtc(dateStr: string): Date {
  const hourFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  for (const offsetHours of [5, 6]) {
    const candidate = new Date(`${dateStr}T${String(offsetHours).padStart(2, "0")}:00:00Z`);
    const parts = hourFmt.formatToParts(candidate);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
    const localDate = `${get("year")}-${get("month")}-${get("day")}`;
    if (localDate === dateStr && get("hour") === "00") return candidate;
  }
  // Unreachable for America/Chicago; safe fallback (CST).
  return new Date(`${dateStr}T06:00:00Z`);
}

/** UTC instant when "today" (Chicago) began. */
export function chicagoDayStartUtc(now: Date = new Date()): Date {
  return chicagoMidnightUtc(chicagoToday(now));
}

/** UTC instant when the current Chicago month began. */
export function chicagoMonthStartUtc(now: Date = new Date()): Date {
  const today = chicagoToday(now); // YYYY-MM-DD
  return chicagoMidnightUtc(`${today.slice(0, 7)}-01`);
}
