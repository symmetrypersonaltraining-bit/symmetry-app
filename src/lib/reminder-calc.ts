// Pure reminder calculation + verification logic. No I/O.
//
// THE RULE (Dustin, 2026-07-31):  amount = sessions_trained x session_rate
//
//   "8 sessions at $75 = $600, plain and simple."
//
// We count what actually happened. A session that happened is billed; a session
// that did not happen is not billed. That is the whole model.
//
// This REPLACES the 2026-07-03 rule, which started from a fee on file and
// subtracted credits for cancellations. That model had to guess at a monthly
// fee and then reconcile it against reality, and the two drifted apart -- Todd's
// calendar says $900/mo while he averages 2 sessions/week, and that gap was
// real overbilling. Counting forward from sessions removes the guess.
//
// Cancellations are DISPLAY ONLY. They are shown so Dustin can see the shape of
// the cycle, but they are not deducted from anything, because there is nothing
// to deduct them from -- an uncancelled session was never added in the first
// place. `cancelledFull` / `cancelledHalf` survive on the RESULT for rendering
// and are absent from every arithmetic path below.
//
// Billing type is authoritative on `clients.billing_type`:
//   per_session  amount = sessionsTrained * session_rate
//   flat         amount = current_fees, every cycle, regardless of anything
//   none         no reminder is ever generated or shown (couples who pay
//                together: Troy/Krysta, Celeste/Greg)

// "semimonthly" = two fixed dates each month (Sharon Rambo: the 7th and the
// 23rd), NOT every 14 days. Biweekly drifts away from a fixed pair immediately
// — 07-07, 07-21, 08-04 instead of 07-07, 07-23, 08-07 — which is exactly how
// her reminders ended up on the wrong dates while Google Calendar, which is the
// source of truth for payments, had the right ones all along.
export type Cadence = "monthly" | "semimonthly" | "biweekly" | "weekly" | "quarterly";
export type BillingType = "per_session" | "flat" | "none";

export interface ReminderCalcInput {
  fee: number | null;
  sessionRate: number | null;
  cadence: Cadence | null;
  dueDate: string; // YYYY-MM-DD
  /** Appointments with status='scheduled' inside the cycle. The billable count. */
  sessionsTrained: number;
  /** clients.billing_type. Falls back to flatBilling for older callers. */
  billingType?: BillingType | null;
  cancelledFull: number; // cancelled_client in cycle -- DISPLAY ONLY
  cancelledHalf: number; // cancelled_half in cycle -- DISPLAY ONLY
  /** @deprecated Removed from the UI; never affects the amount. Kept so older callers still typecheck. */
  manualCredits?: number;
  /** @deprecated Retained for callers; no longer produces a warning. */
  lastPaymentAmount?: number | null;
  lastCycleApprovedOn?: string | null; // CT date the PREVIOUS round was approved
  draftAmount: number; // current amount_due on the reminder row
  override: boolean; // Dustin explicitly accepted a non-calculated amount
  /** @deprecated Use billingType. true is read as 'flat'. */
  flatBilling?: boolean;
}

export interface ReminderCalcResult {
  cycleStart: string; // start of the look-back window (previous cycle's send date)
  cycleEnd: string;   // send date for THIS cycle = due date minus 7 days
  billingType: BillingType;
  /** true when billing_type='none' -- caller must not render or send anything. */
  notApplicable: boolean;
  sessionsTrained: number;
  rate: number | null;
  cancelledFull: number; // display only
  cancelledHalf: number; // display only
  /** Always 0. Cancellations are not deducted. Kept so existing render code compiles. */
  autoCredits: number;
  /** Always 0. See autoCredits. */
  totalCredits: number;
  expected: number;
  blocking: string[];
  warnings: string[];
}

export function previousDueDate(dueDate: string, cadence: Cadence | null): string {
  const parts = dueDate.split("-").map(Number);
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  // Semi-monthly steps between the month's TWO anchor days, derived from the
  // due date itself rather than stored: a due date on the 23rd came from the
  // 7th of the same month, one on the 7th came from the 23rd of the month
  // before. Deriving it keeps the pair wherever the calendar put it instead of
  // hardcoding one client's dates into a shared helper.
  if (cadence === "semimonthly") {
    const day = dt.getUTCDate();
    if (day > 16) dt.setUTCDate(day - 16);
    else { dt.setUTCMonth(dt.getUTCMonth() - 1); dt.setUTCDate(day + 16); }
    return dt.toISOString().slice(0, 10);
  }
  if (cadence === "weekly") dt.setUTCDate(dt.getUTCDate() - 7);
  else if (cadence === "biweekly") dt.setUTCDate(dt.getUTCDate() - 14);
  else if (cadence === "quarterly") dt.setUTCMonth(dt.getUTCMonth() - 3);
  else dt.setUTCMonth(dt.getUTCMonth() - 1); // monthly default
  return dt.toISOString().slice(0, 10);
}

export function nextDueDate(dueDate: string, cadence: Cadence | null): string {
  const parts = dueDate.split("-").map(Number);
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (cadence === "semimonthly") {
    const day = dt.getUTCDate();
    if (day <= 16) dt.setUTCDate(day + 16);
    else { dt.setUTCMonth(dt.getUTCMonth() + 1); dt.setUTCDate(day - 16); }
    return dt.toISOString().slice(0, 10);
  }
  if (cadence === "weekly") dt.setUTCDate(dt.getUTCDate() + 7);
  else if (cadence === "biweekly") dt.setUTCDate(dt.getUTCDate() + 14);
  else if (cadence === "quarterly") dt.setUTCMonth(dt.getUTCMonth() + 3);
  else dt.setUTCMonth(dt.getUTCMonth() + 1);
  return dt.toISOString().slice(0, 10);
}

// Send-anchored billing cycle (Dustin, 2026-07-09, LIVE):
// The reminder is prepared 7 days before the due date, and the billing cycle
// CLOSES on that send date rather than on the due date. A session that lands in
// the final 7 days (between send and due) therefore rolls onto the NEXT cycle
// instead of retroactively changing an amount that was already locked in.
// The lead is a fixed 7 days for every cadence (it is the reminder window, not
// the billing period), so this helper ignores cadence.
export const REMINDER_SEND_LEAD_DAYS = 7;
export function reminderSendDate(dueDate: string): string {
  const parts = dueDate.split("-").map(Number);
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  dt.setUTCDate(dt.getUTCDate() - REMINDER_SEND_LEAD_DAYS);
  return dt.toISOString().slice(0, 10);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function resolveBillingType(i: {
  billingType?: BillingType | null;
  flatBilling?: boolean;
}): BillingType {
  if (i.billingType === "per_session" || i.billingType === "flat" || i.billingType === "none") {
    return i.billingType;
  }
  return i.flatBilling === true ? "flat" : "per_session";
}

export function calcReminder(i: ReminderCalcInput): ReminderCalcResult {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const billingType = resolveBillingType(i);
  const sessionsTrained = Math.max(0, Number(i.sessionsTrained) || 0);

  // Window closes 7 days before due (send-anchored), and opens at the PREVIOUS
  // cycle's send date. Cycles must tile the timeline exactly:
  // (previous send date, this send date]. No gaps, no overlaps.
  //
  // This used to start at `lastCycleApprovedOn` when the prior reminder was
  // approved later than the cadence date. Under the old credit-based rule that
  // was conservative -- it could only reduce credits. Under sessions-trained it
  // silently DROPS SESSIONS: Todd Prine's previous reminder was approved on
  // 2026-07-03, so the window opened at 07-03 exclusive and the session he
  // trained that day fell into no cycle at all. Six clients, $467.50 unbilled.
  // When a reminder happened to be approved is a fact about Dustin's Tuesday,
  // not about when a client trained.
  const cycleStart = reminderSendDate(previousDueDate(i.dueDate, i.cadence));
  const cycleEnd = reminderSendDate(i.dueDate);

  const base = {
    cycleStart,
    cycleEnd,
    billingType,
    sessionsTrained,
    rate: i.sessionRate ?? null,
    cancelledFull: i.cancelledFull || 0,
    cancelledHalf: i.cancelledHalf || 0,
    autoCredits: 0,
    totalCredits: 0,
  };

  // billing_type='none': these clients pay together with a partner and are never
  // billed individually. Nothing is generated, nothing is shown, nothing blocks.
  if (billingType === "none") {
    return { ...base, notApplicable: true, expected: 0, blocking: [], warnings: [] };
  }

  if (!i.cadence) warnings.push("No payment cadence found in calendar history - assuming monthly");

  let expected: number;

  if (billingType === "flat") {
    // Flat clients pay current_fees per cycle regardless of what they trained.
    if (i.fee == null) blocking.push("Flat billing but no fee on file - set the client fee first");
    expected = round2(Math.max(0, i.fee ?? 0));
    if (i.cancelledFull > 0 || i.cancelledHalf > 0) {
      warnings.push(
        "Flat billing: " + i.cancelledFull + " full / " + i.cancelledHalf +
        " cancels shown for reference only - full fee billed"
      );
    }
  } else {
    // per_session: count what happened. No fee-on-file check -- current_fees is
    // irrelevant here and blocking on it was stopping valid drafts.
    if (i.sessionRate == null) {
      // The rate on file is the truth and there is no safe substitute. Deriving
      // it from the calendar payment total is circular -- that total is the
      // stale number we are replacing.
      blocking.push("Per-session billing but no session rate on file - set the client's session rate");
    }
    expected = round2(sessionsTrained * (i.sessionRate ?? 0));
    if (i.sessionRate != null && sessionsTrained === 0) {
      warnings.push("No sessions trained in this cycle - amount is $0");
    }
  }

  if (Math.abs(i.draftAmount - expected) > 0.009) {
    const basis =
      billingType === "flat"
        ? "flat fee $" + (i.fee ?? 0)
        : sessionsTrained + " sessions x $" + (i.sessionRate ?? 0);
    const msg = "Draft $" + i.draftAmount + " does not match calculated $" + expected + " (" + basis + ")";
    if (i.override) warnings.push(msg + " - OVERRIDDEN by trainer");
    else blocking.push(msg);
  }

  return { ...base, notApplicable: false, expected, blocking, warnings };
}

// ─── A REMINDER IS ITEMISED AT THE RATE IT WAS BILLED AT ─────────────────────
//
// Lesly Spencer, 18 Aug. Her rate went 75 -> 80 for the cycle starting 11 Aug.
// The payments screen read the rate off `clients.session_rate` — the rate she
// has TODAY — so her already-sent 18 Aug reminder, billed at 75, immediately
// re-itemised itself as "8 sessions x $80 = $640" while the amount on the row
// still said what she owed. One row contradicting itself, on the screen Dustin
// screenshots for clients.
//
// Raising somebody's rate must never rewrite the arithmetic on a bill they have
// already been sent. The rate that applied is stored on the reminder
// (`credit_details.rate`), written at the time it was calculated, and that is
// the number to itemise with. The client's current rate is only a fallback for
// rows too old to carry one.
//
// Pending rows are unaffected: the sync recalculates `credit_details.rate` from
// the client on every run, so for anything not yet sent the two agree by
// construction.

/** The rate this reminder was actually billed at. `stored` is credit_details.rate. */
export function billedRateOf(stored: unknown, clientRate: number | null): number | null {
  const n =
    typeof stored === "number" ? stored :
    typeof stored === "string" ? Number(stored) :
    NaN;
  return Number.isFinite(n) && n > 0 ? n : clientRate;
}

export interface AdjustmentNote {
  /** Always positive. The size of the gap. */
  amount: number;
  /** Whole sessions the gap works out to, when it divides evenly. Else null. */
  sessions: number | null;
  /** "covered" = billed LESS than itemised. "added" = billed more. */
  direction: "covered" | "added";
}

/**
 * How does the billed amount differ from the sessions x rate above it?
 *
 * Returns null when they agree — the ordinary case, and nothing is rendered.
 *
 * When they do not, the screen has to say so in the client's own terms rather
 * than leaving them to subtract. Dustin, 18 Aug, billing Lesly 6 of 8 sessions:
 * "create a reminder in app so I can screenshot the dates n show her I gave her
 * 2 free." A discount nobody can see is a discount you do not get credit for.
 */
export function describeAdjustment(
  expected: number,
  billed: number,
  rate: number | null,
): AdjustmentNote | null {
  const diff = Math.round((expected - billed) * 100) / 100;
  if (diff === 0) return null;
  const amount = Math.abs(diff);
  let sessions: number | null = null;
  if (rate && rate > 0) {
    const n = amount / rate;
    // Only claim "2 sessions covered" when it is exactly two sessions. A $50
    // goodwill knock off a $75 rate is not two-thirds of a session to anybody.
    if (Math.abs(n - Math.round(n)) < 0.005 && Math.round(n) > 0) sessions = Math.round(n);
  }
  return { amount, sessions, direction: diff > 0 ? "covered" : "added" };
}
