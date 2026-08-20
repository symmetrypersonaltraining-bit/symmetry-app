// Validation for the Billing & Schedule fields, kept pure so it can be tested
// without a database and reused by any caller that writes them.
//
// WHY THIS EXISTS. `billing_type` was not on the PATCH allow-list at all, so it
// could only be set by editing the database by hand — which is why every client
// sat on whatever they were created with and Madeleine Coker's $75 SESSION rate
// spent weeks in the monthly fee field billing her $75 a month.
//
// The rest of these fields have no database constraint. A negative rate, a
// 400-session cycle, or a due date on the 47th would be stored without
// complaint and then used in an invoice. The CHECK on billing_type would refuse
// a bad value, but as a 500 carrying raw Postgres text on a screen about
// somebody's money.

export const BILLING_TYPES = [
  "monthly_adjusted",
  "flat",
  "per_session",
  "paid_by_other",
  "none",
] as const;

export const CADENCES = [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "quarterly",
] as const;

/** Human labels. The stored value is never shown to anyone. */
export const BILLING_TYPE_LABEL: Record<string, string> = {
  monthly_adjusted: "Monthly rate, less cancellations",
  flat: "Flat rate",
  per_session: "Sessions trained only",
  paid_by_other: "Someone else pays",
  none: "Not billed",
};

export const CADENCE_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

const isBlank = (v: unknown) => v === null || v === undefined || v === "";

function num(v: unknown): number | null {
  if (isBlank(v)) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Returns null when the patch is fine, or a sentence to show the trainer.
 *
 * Only validates the keys PRESENT in the patch — this is a partial update and a
 * screen that saves one field must not be told about another it did not touch.
 */
export function validateBillingFields(patch: Record<string, unknown>): string | null {
  if ("billing_type" in patch && !isBlank(patch.billing_type)) {
    if (!BILLING_TYPES.includes(patch.billing_type as (typeof BILLING_TYPES)[number])) {
      return "That billing type isn't one the app knows about.";
    }
  }
  if ("billing_cadence" in patch && !isBlank(patch.billing_cadence)) {
    if (!CADENCES.includes(patch.billing_cadence as (typeof CADENCES)[number])) {
      return "That payment cadence isn't one the app knows about.";
    }
  }

  for (const [key, label] of [
    ["current_fees", "The rate"],
    ["session_rate", "The session rate"],
  ] as const) {
    if (key in patch) {
      const n = num(patch[key]);
      if (n !== null && (Number.isNaN(n) || n < 0)) return label + " has to be a number, and not a negative one.";
    }
  }

  if ("expected_sessions_per_cycle" in patch) {
    const n = num(patch.expected_sessions_per_cycle);
    // Upper bound is not fussiness: this number is the divisor Dustin reads off
    // the screen to sanity-check a rate, and a typo'd 80 makes $640 look like
    // $8 a session.
    if (n !== null && (Number.isNaN(n) || n < 1 || n > 60 || !Number.isInteger(n))) {
      return "Sessions per payment has to be a whole number between 1 and 60.";
    }
  }

  if ("training_frequency" in patch) {
    const n = num(patch.training_frequency);
    // The database CHECK is 1..6 and rejects anything else with raw Postgres
    // text. Say it in English before it gets there.
    if (n !== null && (Number.isNaN(n) || n < 1 || n > 6 || !Number.isInteger(n))) {
      return "Days per week has to be a whole number between 1 and 6.";
    }
  }

  for (const key of ["billing_anchor_day", "billing_anchor_day_2"] as const) {
    if (key in patch) {
      const n = num(patch[key]);
      if (n !== null && (Number.isNaN(n) || n < 1 || n > 31 || !Number.isInteger(n))) {
        return "A payment date has to be a day of the month between 1 and 31.";
      }
    }
  }

  if ("billing_anchor_weekday" in patch) {
    const n = num(patch.billing_anchor_weekday);
    if (n !== null && (Number.isNaN(n) || n < 0 || n > 6 || !Number.isInteger(n))) {
      return "That isn't a day of the week.";
    }
  }

  if ("billing_anchor_day" in patch && "billing_anchor_day_2" in patch) {
    const a = num(patch.billing_anchor_day);
    const b = num(patch.billing_anchor_day_2);
    if (a !== null && b !== null && !Number.isNaN(a) && !Number.isNaN(b) && a === b) {
      return "Twice-a-month needs two different dates.";
    }
  }

  return null;
}

/**
 * Which fields does this billing type actually use?
 *
 * Drives what the form shows, and — more importantly — what it CLEARS. Leaving
 * a stale session rate on a flat client is not cosmetic: Tyler Dorsett's $15
 * survived his move to a $300 flat rate and billed him $60.
 */
export function fieldsFor(billingType: string): {
  rate: boolean;
  sessionRate: boolean;
  expectedSessions: boolean;
  cadence: boolean;
  paidBy: boolean;
} {
  switch (billingType) {
    case "monthly_adjusted":
      return { rate: true, sessionRate: true, expectedSessions: true, cadence: true, paidBy: false };
    case "flat":
      return { rate: true, sessionRate: false, expectedSessions: false, cadence: true, paidBy: false };
    case "per_session":
      return { rate: false, sessionRate: true, expectedSessions: false, cadence: true, paidBy: false };
    case "paid_by_other":
      return { rate: false, sessionRate: false, expectedSessions: false, cadence: false, paidBy: true };
    default: // none
      return { rate: false, sessionRate: false, expectedSessions: false, cadence: false, paidBy: false };
  }
}

/**
 * The patch that switching billing type implies — including the nulls.
 *
 * A form that only writes what it shows leaves the fields it hid behind,
 * still set, still read by the engine.
 */
export function clearUnusedFields(billingType: string): Record<string, null> {
  const f = fieldsFor(billingType);
  const out: Record<string, null> = {};
  if (!f.rate) out.current_fees = null;
  if (!f.sessionRate) out.session_rate = null;
  if (!f.expectedSessions) out.expected_sessions_per_cycle = null;
  if (!f.paidBy) out.paid_by_client_id = null;
  return out;
}
