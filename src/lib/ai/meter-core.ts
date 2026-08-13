// AI usage metering — PURE logic (no Supabase, no network, no Next.js imports).
// Everything here is unit-testable in plain node; the DB glue lives in meter.ts.
//
// Tables this supports (created in prod by the overnight schema workstream):
//   ai_usage_log(client_id, feature, model, tokens_in, tokens_out, cost_usd, created_at)
//   client_app_settings.ai_daily_*_limit int columns (per-client overrides).

// ---------------------------------------------------------------------------
// THE FEATURE REGISTRY — one entry per AI surface in the app.
//
// Until 13 Aug this was seven labels for twenty-three routes, and FOURTEEN of
// them logged as the single word "chat". That made the question "is the AI
// working everywhere?" unanswerable from the data: 487 `chat` rows told you
// nothing about which surface produced them, so spend could not be attributed
// and a broken surface could not be spotted.
//
// One name per route. Adding a surface means adding a row here — the health
// page, the caps and the spend report all read from this and nothing else.
//
// IMPORTANT: every entry below inherits the EXACT cap column and default that
// its old label carried, so this rename changes no behaviour whatsoever. The
// per-client caps that applied yesterday apply identically today.
// ---------------------------------------------------------------------------

/** Which app a surface belongs to. Drives grouping on the health page. */
export type AiSurface = "client" | "trainer" | "scheduled";

export interface AiFeatureSpec {
  /** Human label for the health page. */
  label: string;
  /** Which app it lives in. */
  surface: AiSurface;
  /** client_app_settings column overriding the daily cap. "" = no override. */
  limitColumn: string;
  /**
   * Per-client per-day default. `null` means no per-client cap at all — the
   * global kill switch is the only ceiling. Used for trainer-only surfaces and
   * unattended jobs, which have no client to charge.
   */
  defaultLimit: number | null;
  /**
   * The route exists and is metered, but nothing in the app calls it yet.
   *
   * Without this, the health page shouts NEVER USED at a surface that is
   * never-used ON PURPOSE, forever. One permanent false alarm is all it takes
   * for the page to stop being read, and the page only earns its place by
   * being believed.
   */
  dormant?: true;
}

export const AI_FEATURES = {
  // ── Client app ───────────────────────────────────────────────────────────
  coach_action:    { label: "Coach chat (action)",     surface: "client",    limitColumn: "ai_daily_chat_limit",       defaultLimit: 15 },
  coach_card:      { label: "Coach card",              surface: "client",    limitColumn: "ai_daily_chat_limit",       defaultLimit: 15 },
  coach_read:      { label: "Coach's read",            surface: "client",    limitColumn: "ai_daily_chat_limit",       defaultLimit: 15 },
  client_assistant:{ label: "Client assistant",        surface: "client",    limitColumn: "ai_daily_chat_limit",       defaultLimit: 15 },
  celebration:     { label: "Session celebration",     surface: "client",    limitColumn: "ai_daily_chat_limit",       defaultLimit: 15 },
  food_parse:      { label: "Food parse",              surface: "client",    limitColumn: "ai_daily_parse_limit",      defaultLimit: 15 },
  food_photo:      { label: "Meal photo",              surface: "client",    limitColumn: "ai_daily_photo_limit",      defaultLimit: 20 },
  plan_build:      { label: "Meal plan builder",       surface: "client",    limitColumn: "ai_daily_plan_build_limit", defaultLimit: 1  },
  // Audited 2026-08-13: the route works and is metered, but NOTHING calls it —
  // no button, no cron, no other route. Marked dormant rather than deleted
  // because the food catalog still wants an auditor; wire it and drop the flag.
  verify_food:     { label: "Food catalog auditor",    surface: "client",    limitColumn: "ai_daily_verify_limit",     defaultLimit: 20, dormant: true },
  workout_build:   { label: "Create / replace workout",surface: "client",    limitColumn: "workout_build_daily_limit", defaultLimit: 8  },
  recipe_ai:       { label: "Recipe builder",          surface: "client",    limitColumn: "ai_daily_parse_limit",      defaultLimit: 15 },
  movement_explain:{ label: "Movement explanation",    surface: "client",    limitColumn: "ai_daily_chat_limit",       defaultLimit: 15 },

  // ── Trainer app ──────────────────────────────────────────────────────────
  trainer_agent:   { label: "Trainer assistant",       surface: "trainer",   limitColumn: "", defaultLimit: null },
  workout_assist:  { label: "Workout assist",          surface: "trainer",   limitColumn: "ai_daily_chat_limit",       defaultLimit: 15 },
  session_brief:   { label: "Session brief",           surface: "trainer",   limitColumn: "ai_daily_chat_limit",       defaultLimit: 15 },
  focus_suggest:   { label: "Focus suggestions",       surface: "trainer",   limitColumn: "ai_daily_chat_limit",       defaultLimit: 15 },
  assessment_rec:  { label: "Assessment recommendation",surface: "trainer",  limitColumn: "ai_daily_chat_limit",       defaultLimit: 15 },
  outbox_draft:    { label: "Outbox drafts",           surface: "trainer",   limitColumn: "ai_daily_chat_limit",       defaultLimit: 15 },
  // Not a feature a client chooses to spend — a side effect of reporting a bug.
  // Generous, so nobody rations bug reports, but finite so a retry loop on the
  // feedback form cannot quietly spend the month's budget.
  feedback_image:  { label: "Screenshot reader",       surface: "trainer",   limitColumn: "", defaultLimit: 30 },

  // ── Unattended / scheduled ───────────────────────────────────────────────
  // No client to charge, so no per-client cap. The kill switch is the ceiling,
  // and as of 13 Aug these actually check it.
  weekly_sweep:    { label: "Saturday sweep",          surface: "scheduled", limitColumn: "", defaultLimit: null },
  nudge_sweep:     { label: "Nudge sweep",             surface: "scheduled", limitColumn: "", defaultLimit: null },
  birthday_post:   { label: "Birthday bot",            surface: "scheduled", limitColumn: "", defaultLimit: null },
  coachbot_post:   { label: "Coach bot",               surface: "scheduled", limitColumn: "", defaultLimit: null },
  // smoke_test removed 2026-08-13: reserved for a harness that was never
  // built, so nothing could ever emit it and it sat in NEVER USED as noise.
} as const satisfies Record<string, AiFeatureSpec>;

export type AiFeature = keyof typeof AI_FEATURES;

/** Every feature key, for the health page and the guard tests. */
export const AI_FEATURE_KEYS = Object.keys(AI_FEATURES) as AiFeature[];

/** client_app_settings column that overrides the daily cap for each feature. */
export const LIMIT_COLUMNS: Record<AiFeature, string> = Object.fromEntries(
  AI_FEATURE_KEYS.map((k) => [k, AI_FEATURES[k].limitColumn])
) as Record<AiFeature, string>;

/** Per-client per-day defaults when the settings column is null/missing. */
export const DEFAULT_LIMITS: Record<AiFeature, number | null> = Object.fromEntries(
  AI_FEATURE_KEYS.map((k) => [k, AI_FEATURES[k].defaultLimit])
) as Record<AiFeature, number | null>;

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

/**
 * Resolve the effective daily limit from a client_app_settings row (or null).
 *
 * Returns `null` for surfaces that carry no per-client cap — trainer-only tools
 * and unattended jobs, which have no client to charge. Those are bounded by the
 * global kill switch alone.
 */
export function resolveDailyLimit(
  settings: Record<string, unknown> | null | undefined,
  feature: AiFeature
): number | null {
  const col = LIMIT_COLUMNS[feature];
  const raw = settings && col ? settings[col] : undefined;
  const n = typeof raw === "number" ? raw : raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LIMITS[feature];
}

/**
 * Throws CapExceeded when used >= limit.
 *
 * A `null` limit means "no per-client cap" and never throws. Note this is NOT
 * the same as a limit of 0, which blocks everything — the distinction matters
 * because getting it backwards would either brick a surface or uncap it.
 */
export function assertUnderCap(feature: AiFeature, used: number, limit: number | null): void {
  if (limit == null) return;
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
