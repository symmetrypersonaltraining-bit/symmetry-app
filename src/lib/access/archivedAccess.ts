/**
 * WHEN AN ARCHIVED CLIENT LOSES THE APP — the rule, in one place.
 *
 * Dustin, 2026-09-09: an archived client keeps full app access until 30 days
 * after their LAST PAID invoice, then loses it automatically. No manual step,
 * no remembering.
 *
 *     access_ends_on = last PAID payment_reminders.due_date + 30 days
 *
 * WHY THIS FILE EXISTS AT ALL, RATHER THAN THE SQL DOING IT
 *
 * Three things have to agree about whether someone still has access: the
 * nightly job that revokes it, the middleware that turns a live session away,
 * and anything that ever shows Dustin a date. The food unit map was two
 * separate implementations of one rule and they drifted over accents
 * (`89d991fa`); the SQL and TypeScript serving parsers were two readings of one
 * format and they drifted over a leading zero (`612874a`). Both cost a day.
 * So the rule is a pure function, here, and the job and the gate both call it.
 *
 * ARCHIVING IS NOT REVOKING, AND THE TWO COLUMNS STAY SEPARATE
 *
 * `archived_at` is a roster state — it decides who shows up in his lists.
 * `access_revoked_at` is an access state — it decides who can open the app.
 * Conflating them is exactly what caused the confusion this rule came out of:
 * Bobbie Page was archived on 31 Aug and still had full access on 9 Sep,
 * because `archived_at` never gated sign-in and nobody had noticed.
 */

import { centralDateOf, centralToday, shiftDate } from "@/lib/central-time";

/** Thirty days, and it is his number. Named so it is never inlined twice. */
export const GRACE_DAYS = 30;

export interface AccessFacts {
  /** `clients.archived_at` — a timestamptz, or null for an active client. */
  archivedAt: string | null;
  /** due_date of the most recent `payment_reminders` row with status 'paid'. */
  lastPaidDueDate: string | null;
  /** `clients.access_override_until` — his manual extension. */
  overrideUntil: string | null;
}

export type AccessBasis =
  /** Not archived. Access is not in question and the job must not touch them. */
  | "active"
  /** `archived_at` could not be read as a date. Fails safe — see below. */
  | "unreadable"
  /** last paid due_date + 30. The normal path. */
  | "last-paid"
  /** No paid invoice on file, ever. archived_at + 30 instead. */
  | "archived-fallback"
  /** His override is later than the rule, so his date wins. */
  | "override";

export interface AccessDecision {
  /** "YYYY-MM-DD", the last day they can still open the app. Null when active. */
  endsOn: string | null;
  basis: AccessBasis;
  /** True when `asOf` is past `endsOn` — i.e. the job should revoke today. */
  shouldRevoke: boolean;
}

/**
 * Decide where a client stands, as of a given Central date.
 *
 * `asOf` is a parameter rather than read from the clock so the tests can stand
 * on a fixed day and so the job's dry run can be asked about any date.
 */
export function accessDecision(facts: AccessFacts, asOf: string = centralToday()): AccessDecision {
  // An active client is not in this rule's scope at all. Returning "never ends"
  // rather than a far-future date keeps the job's filter honest: it revokes on
  // `shouldRevoke`, and this can never make that true.
  if (!facts.archivedAt) return { endsOn: null, basis: "active", shouldRevoke: false };

  // A DATE THIS FUNCTION CANNOT READ NEVER COSTS ANYONE THEIR ACCESS.
  //
  // Found by the tests, not by reasoning: `new Date("2026-08-13T18:56:30+00")`
  // is Invalid Date in Node — the offset has to be "+00:00" or "Z" once there
  // is a "T" in the string — and `shiftDate` then threw RangeError out of the
  // middle of the nightly loop. PostgREST returns the long form, so this should
  // not happen; "should not happen" is exactly the kind of thing that decides
  // whether a real client can open the app tomorrow morning, so it is handled
  // rather than assumed. Unreadable means NOT revoked, and it is visible in the
  // basis so the job can report it instead of swallowing it.
  const archivedOn = readableDate(facts.archivedAt);
  const lastPaidOn = readableDate(facts.lastPaidDueDate);
  if (!archivedOn && !lastPaidOn) return { endsOn: null, basis: "unreadable", shouldRevoke: false };

  const ruleEndsOn = lastPaidOn
    ? shiftDate(lastPaidOn, GRACE_DAYS)
    : shiftDate(archivedOn as string, GRACE_DAYS);

  const ruleBasis: AccessBasis = lastPaidOn ? "last-paid" : "archived-fallback";

  // THE OVERRIDE ONLY EVER EXTENDS.
  //
  // He is using it right now to give Bobbie Page until 1 Oct, where the rule
  // would have cut her off on 31 Aug. An override EARLIER than the rule is
  // ignored rather than honoured: the spec calls this "extend someone past the
  // 30 days", and a stale date left in that column must never be able to end
  // somebody's access sooner than the rule already would.
  if (facts.overrideUntil && facts.overrideUntil > ruleEndsOn) {
    return { endsOn: facts.overrideUntil, basis: "override", shouldRevoke: asOf > facts.overrideUntil };
  }

  return { endsOn: ruleEndsOn, basis: ruleBasis, shouldRevoke: asOf > ruleEndsOn };
}

/**
 * "YYYY-MM-DD" for anything this rule can actually read, or null.
 *
 * A `due_date` is already a plain date and comes back as one; `archived_at` is
 * an instant and has to be read in Central (CLAUDE.md: after 7pm Central the
 * UTC date is already tomorrow, and thirty days is counted in whole days).
 */
function readableDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) return null;
  return centralDateOf(asDate);
}

/**
 * `endsOn` is the last day they still have the app, so revocation happens the
 * day AFTER it — `asOf > endsOn`, never `>=`.
 *
 * Bobbie's override is 2026-10-01: she can open the app on 1 Oct and not on
 * 2 Oct. Reading that as ">=" would take a day off every client's grace period,
 * and it would take his override literally one day early.
 */
export function accessHasEnded(facts: AccessFacts, asOf: string = centralToday()): boolean {
  return accessDecision(facts, asOf).shouldRevoke;
}
