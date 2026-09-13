/**
 * WHAT IS LEFT ON THE ACCOUNT, AND WHETHER IT HAS ALREADY RUN OUT.
 *
 * Dustin, 13 Sep 2026, mid-test: *"photo didn't work, says credit balance
 * issue"* … *"same issue with creating a plan with ai"* … *"wtf are we doing??
 * everything im testing is getting worse"*.
 *
 * Every AI call in the app had been failing for an hour, and the first signal
 * was features breaking in his hands. The app meters its OWN spend against a
 * $95/month cap, but that cap has never known anything about the account's
 * actual balance, so a healthy meter and an empty account look identical from
 * inside. *"Nothing warns you when the balance runs low."*
 *
 * ── TWO SIGNALS, AND ONLY ONE OF THEM IS A GUESS ───────────────────────────
 *
 * 1. THE OUTAGE is exact. `ai_usage_log.error` already records the provider's
 *    own words on every failure. A billing or auth refusal in the recent past
 *    means every AI feature is down right now — no bookkeeping, no estimate,
 *    no way for it to be wrong.
 *
 * 2. THE BALANCE is an estimate, and says so. The Messages API has no balance
 *    endpoint to read, so this is a ledger: he records what he puts on, the
 *    app counts what it has spent since, and the difference is good enough to
 *    warn on. It is a floor rather than a figure — the app can only count its
 *    OWN calls, so anything else drawing on the same key makes the real
 *    balance lower than this says, never higher.
 *
 * Keeping them apart matters. An estimate that silently becomes the outage
 * warning would cry wolf every time the ledger drifted; an outage warning that
 * waited for the estimate would arrive after the fact, which is what happened.
 */

import { PRICES_PER_MTOK, type PricedModel } from "./modelPricing";

export interface SpendRow {
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
}

export interface TopUp {
  amount_usd: number;
  added_on: string;
}

export type CreditState = "out" | "low" | "ok" | "untracked";

export interface CreditHealth {
  state: CreditState;
  /** Dollars added, across every recorded top-up. */
  added: number;
  /** Dollars the app has spent since the earliest top-up. */
  spent: number;
  /** added − spent. Null when nothing has been recorded to count against. */
  remaining: number | null;
  /** Spend per day over the window, for the runway estimate. */
  perDay: number;
  /** Whole days left at that rate. Null when unknown or not burning. */
  daysLeft: number | null;
  /** The provider's own refusal, when one has happened recently. */
  outage: { at: string; feature: string | null } | null;
}

/** Below this share of what was added, it is worth saying something. */
export const LOW_FRACTION = 0.2;
/** …or below this many dollars, whichever bites first on a small top-up. */
export const LOW_DOLLARS = 5;
/** A refusal older than this is history, not a live outage. */
export const OUTAGE_WINDOW_MS = 6 * 60 * 60 * 1000;

/** What one call cost, at first-party rates. Unknown models count as zero. */
export function costOf(row: SpendRow): number {
  const key = Object.keys(PRICES_PER_MTOK).find((m) => (row.model || "").includes(m)) as
    | PricedModel
    | undefined;
  if (!key) return 0;
  const p = PRICES_PER_MTOK[key];
  return ((row.tokens_in || 0) / 1e6) * p.in + ((row.tokens_out || 0) / 1e6) * p.out;
}

export function isBillingFailure(error: string | null | undefined): boolean {
  const raw = (error || "").toLowerCase();
  if (!raw) return false;
  return /credit balance|billing|quota|insufficient[_ ]funds|invalid[_ ]?api[_ ]?key|authentication/.test(raw);
}

/**
 * `spend` must already be filtered to rows on or after the earliest top-up —
 * that is a query concern, and doing it here would mean loading the whole
 * table into memory to throw most of it away.
 */
export function creditHealth(input: {
  topUps: TopUp[];
  spend: SpendRow[];
  /** Days the spend rows cover, for the burn rate. */
  windowDays: number;
  lastFailure?: { at: string; feature: string | null; error: string | null } | null;
  now?: number;
}): CreditHealth {
  const now = input.now ?? Date.now();
  const spent = input.spend.reduce((a, r) => a + costOf(r), 0);
  const added = input.topUps.reduce((a, t) => a + (Number(t.amount_usd) || 0), 0);
  const perDay = input.windowDays > 0 ? spent / input.windowDays : 0;

  const outage =
    input.lastFailure && isBillingFailure(input.lastFailure.error) &&
    now - Date.parse(input.lastFailure.at) <= OUTAGE_WINDOW_MS
      ? { at: input.lastFailure.at, feature: input.lastFailure.feature }
      : null;

  // THE OUTAGE OUTRANKS THE LEDGER, ALWAYS. If the provider has refused, the
  // account is empty whatever the arithmetic says — and the arithmetic being
  // wrong is precisely the situation that let this happen unannounced.
  if (outage) {
    const rem = input.topUps.length ? round2(added - spent) : null;
    return { state: "out", added: round2(added), spent: round2(spent), remaining: rem, perDay: round2(perDay), daysLeft: 0, outage };
  }

  if (!input.topUps.length) {
    return { state: "untracked", added: 0, spent: round2(spent), remaining: null, perDay: round2(perDay), daysLeft: null, outage: null };
  }

  const remaining = added - spent;
  const daysLeft = perDay > 0 ? Math.max(0, Math.floor(remaining / perDay)) : null;
  const low = remaining <= Math.max(LOW_DOLLARS, added * LOW_FRACTION);

  return {
    state: remaining <= 0 ? "out" : low ? "low" : "ok",
    added: round2(added),
    spent: round2(spent),
    remaining: round2(remaining),
    perDay: round2(perDay),
    daysLeft,
    outage: null,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
