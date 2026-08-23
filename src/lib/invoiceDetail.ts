// What a client is shown about a bill, built from the reminder's own
// credit_details rather than recomputed.
//
// Dustin, 20 Aug: "I want to add full dates trained/cancelled and billing cycle
// on the clients view along w billing records where they or I can pull up past
// invoices w details."
//
// Until now a client saw four things: an amount, a due date, a free-text note,
// and pay buttons. No dates, no cycle, no rate, no session count, and no
// history at all — there was no past-invoice view in the app for a client OR
// for the trainer beyond a strip of date-and-amount chips. That is why the
// Lesly Spencer conversation on 18 August had to happen over screenshots: the
// information existed and there was nowhere to show it.
//
// EVERYTHING HERE IS READ, NOT DERIVED. `credit_details` is what the amount was
// actually calculated from. Recomputing it at display time would let the screen
// and the invoice drift apart — which is the exact failure that produced
// "8 sessions × $80 = $640" beside an amount of $450.

import { centralFormatDate } from "@/lib/central-time";

export interface InvoiceDetail {
  /** "monthly_less_cancellations" | "flat" | "sessions_trained" */
  basis: string;
  cycleStart: string | null;
  cycleEnd: string | null;
  monthlyRate: number | null;
  sessionRate: number | null;
  datesTrained: string[];
  datesCancelled: string[];
  cancelDeduction: number;
  halfPriceSessions: number;
  halfPriceDeduction: number;
  /** True while the cycle has not closed, so the figure can still move. */
  provisional: boolean;
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Never throws and never returns null — a malformed row degrades to "no detail". */
export function parseInvoiceDetail(credit_details: unknown, halfPriceSessions?: unknown): InvoiceDetail {
  const cd = (credit_details ?? {}) as Record<string, unknown>;
  const cycle = typeof cd.cycle === "string" ? cd.cycle : "";
  const [cycleStart, cycleEnd] = cycle.includes(" to ")
    ? cycle.split(" to ").map((x) => x.trim())
    : [null, null];
  return {
    basis: typeof cd.basis === "string" ? cd.basis : "",
    cycleStart: cycleStart || null,
    cycleEnd: cycleEnd || null,
    monthlyRate: numOrNull(cd.monthly_rate),
    sessionRate: numOrNull(cd.rate),
    datesTrained: strArray(cd.dates_trained),
    datesCancelled: strArray(cd.dates_cancelled),
    cancelDeduction: numOrNull(cd.cancel_deduction) ?? 0,
    halfPriceSessions: numOrNull(cd.half_price_sessions) ?? numOrNull(halfPriceSessions) ?? 0,
    halfPriceDeduction: numOrNull(cd.half_price_deduction) ?? 0,
    provisional: cd.provisional === true,
  };
}

/** "Aug 13" from "2026-08-13". */
export function shortDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  return centralFormatDate(iso.slice(0, 10), { month: "short", day: "numeric" });
}

/**
 * The one-line sum, in the client's words rather than the schema's.
 *
 * Returns null when there is nothing worth showing — a flat rate needs no
 * explanation, and neither does a bill with no detail behind it.
 */
export function explainAmount(d: InvoiceDetail, amountDue: number): string | null {
  if (d.basis === "monthly_less_cancellations") {
    if (d.monthlyRate == null) return null;
    const parts: string[] = ["$" + d.monthlyRate];
    if (d.cancelDeduction > 0 && d.datesCancelled.length) {
      parts.push(
        "− " + d.datesCancelled.length + " cancelled ($" + d.cancelDeduction + ")",
      );
    }
    if (d.halfPriceDeduction > 0) {
      parts.push("− " + d.halfPriceSessions + " at half rate ($" + d.halfPriceDeduction + ")");
    }
    if (parts.length === 1) return "$" + d.monthlyRate + " — nothing cancelled this cycle";
    return parts.join(" ") + " = $" + amountDue;
  }
  if (d.basis === "sessions_trained") {
    if (d.sessionRate == null || !d.datesTrained.length) return null;
    return d.datesTrained.length + " sessions × $" + d.sessionRate + " = $" + amountDue;
  }
  return null;
}
