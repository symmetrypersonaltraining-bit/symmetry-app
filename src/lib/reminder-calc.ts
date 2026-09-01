// Pure reminder calculation + verification logic. No I/O.
//
// ── THE RULE (Dustin, 2026-08-29), in his own words ───────────────────────
//
//   "we need to charge actual sessions trained instead of refund cancelled...
//    thats time I'm working without pay"
//   "im thinking dont charge extras above plan"
//
//     credited = min(cancelled, max(0, plan - trained))
//     amount   = monthly rate - credited x session rate
//
// Three properties, all deliberate.
//
// 1. NEVER PAID BELOW THE SESSIONS DELIVERED. The credit stops as soon as it
//    would drop the bill under trained x rate. Lesly trained all 8 of her 8 and
//    cancelled 2; the previous rule handed her $160 back for sessions she did
//    not miss. Across the 29 Aug batch that leak was $565 in a single cycle --
//    Lesly 160, Lauren 75, Martha 87.50, Hassan 82.50, Cheyenne 80, Stacie 80.
//
// 2. EXTRAS ABOVE THE PLAN ARE NOT CHARGED. A calendar month at 3x/week holds
//    13 or 14 slots against a 12-session rate, so most clients run over. Tim
//    trained 14 in the cycle closing 23 Sep and is billed for 12. Dustin's
//    call: the rate stays the same every month and the extras are goodwill.
//
// 3. MAKE-UPS NEED NO DETECTION. Dustin asked to cross-reference a cancelled
//    session against the make-up. Nothing needs to. A made-up session appears
//    as TRAINED in whatever cycle it happened in and the credit shrinks to
//    match, so consecutive cycles sum to the sessions actually delivered:
//
//        Aug   7 trained, 1 cancelled    ->  640 - 80  =  560
//        Sep   8 trained (incl. make-up) ->  640 -  0  =  640
//        15 sessions x $80 = 1200.  Exact, with no make-up flag anywhere.
//
//    This matters because Google Calendar carries NO link between a cancelled
//    event and its replacement. Detection would have been a guess dressed up as
//    a fact, and it could not have told a make-up from a moved day -- which is
//    the distinction Dustin specifically asked us to be certain about.
//
// LATE CANCELS NEED NO FEATURE. Dustin: "i handle late cancel. if its last min
// I won't turn it orange in cal." An un-orange slot stays 'scheduled', counts
// as trained, and is billed. `halfPriceSessions` therefore no longer enters the
// arithmetic; nothing in the app could ever set it and no client was on it.
//
// Superseded, for the record:
//
//   2026-08-20  amount = monthly rate - cancelled x rate
//               Credited cancellations the client had already made up.
//   2026-07-31  amount = sessions_trained x rate
//               No ceiling: a client with a $900 commitment who trained six
//               times paid $450, and Dustin had held the slots.
//   2026-07-03  fee on file less invented credits
//
// Billing type is authoritative on `clients.billing_type`:
//   monthly_adjusted  the rule above
//   per_session       amount = sessionsTrained x rate. Todd Prine, from 29 Aug:
//                     a pilot booked a week at a time, so a week that never gets
//                     booked leaves no cancelled event and the monthly rule is
//                     blind to it. He had been paying trained x rate in practice
//                     for months -- $675 for 9, $600 for 8.
//   flat              amount = current_fees, every cycle, regardless of anything
//   none              no reminder is ever generated or shown (couples who pay
//                     together, and clients not currently billed)

export type Cadence = "monthly" | "semimonthly" | "biweekly" | "weekly" | "quarterly";
export type BillingType =
  /** Rate minus (orange-cancelled x session rate). The majority case. */
  | "monthly_adjusted"
  /** The rate, every cycle. The calendar is ignored entirely. */
  | "flat"
  /** Sessions trained x rate. Retained for anyone genuinely billed that way. */
  | "per_session"
  /** Billed on somebody else's invoice. */
  | "paid_by_other"
  /** Not billed. */
  | "none";

export interface ReminderCalcInput {
  fee: number | null;
  sessionRate: number | null;
  cadence: Cadence | null;
  dueDate: string; // YYYY-MM-DD
  /** Appointments with status='scheduled' inside the cycle. The billable count. */
  sessionsTrained: number;
  /** clients.billing_type. Falls back to flatBilling for older callers. */
  billingType?: BillingType | null;
  /**
   * `clients.expected_sessions_per_cycle` — what the rate buys. Only used to
   * SHOW the arithmetic and to check the rate against itself; the deduction
   * itself uses `sessionRate` directly, because that is the number Dustin
   * agreed with the client.
   */
  expectedSessions?: number | null;
  /**
   * Sessions Dustin ran remotely at half price while away. Manual, never
   * inferred: "only time i will bill half price is when im on vacation and i am
   * going to train them from the app. this will be done manually."
   */
  halfPriceSessions?: number;
  cancelledFull: number; // cancelled_client in cycle -- DISPLAY ONLY
  cancelledHalf: number; // cancelled_half in cycle -- DISPLAY ONLY
  /** @deprecated Removed from the UI; never affects the amount. Kept so older callers still typecheck. */
  manualCredits?: number;
  /** @deprecated Retained for callers; no longer produces a warning. */
  lastPaymentAmount?: number | null;
  lastCycleApprovedOn?: string | null; // CT date the PREVIOUS round was approved
  /**
   * The due date of this client's PREVIOUS reminder, when one exists.
   *
   * Clamping stops the month arithmetic skipping February, but it still cannot
   * make previousDueDate() a true inverse of nextDueDate(): "the 31st, minus a
   * month" from 28 February is 28 January, not 31 January. Guessing backwards
   * is only ever an approximation of a date that is already recorded.
   *
   * So when the real one is known, use it. Cycles then tile against what was
   * actually billed rather than against a reconstruction of it.
   */
  previousDueDateActual?: string | null;
  draftAmount: number; // current amount_due on the reminder row
  override: boolean; // Dustin explicitly accepted a non-calculated amount
  /** @deprecated Use billingType. true is read as 'flat'. */
  flatBilling?: boolean;
  /**
   * Today's Central date. When supplied, a cycle that has not closed BLOCKS
   * approval — see `provisional` below. Omitted by older callers, which then
   * behave exactly as before.
   */
  todayCT?: string | null;
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
  /** What the monthly rate is before any deduction. Null for per-session. */
  baseRate: number | null;
  /** Cancellations x rate. Positive number, already subtracted from `expected`. */
  cancelDeduction: number;
  /** Always 0. Late cancels are handled by not marking them orange. Kept so existing render code compiles. */
  halfPriceDeduction: number;
  /** Cancellations that actually cost a session, so earned a credit. */
  sessionsCredited: number;
  /** Sessions delivered above the plan. Null when the client has no plan. */
  sessionsExtra: number | null;
  /**
   * The cycle has not closed yet, so this figure can still move and must not
   * be sent. True only when `todayCT` was supplied and is before `cycleEnd`.
   */
  provisional: boolean;
  blocking: string[];
  warnings: string[];
}

// ── MONTH ARITHMETIC THAT DOES NOT SKIP FEBRUARY ────────────────────────────
//
// `setUTCMonth(m + 1)` on a 29th, 30th or 31st overflows into the month after
// the one you asked for, because the target month is too short to hold the day:
//
//     29 Jan  + 1 month  ->  29 Feb  ->  1 March    (2026 is not a leap year)
//     31 Mar  + 1 month  ->  31 Apr  ->  1 May
//
// A client billed on the 29th therefore had no February invoice at all -- the
// due date jumped straight from January to March -- and every cycle after it
// was permanently one or two days out of step, so the window between two
// consecutive reminders left a gap that belonged to no cycle. Sessions in that
// gap were billed to nobody. Lauren Standefer and Tim Yancey are both on the
// 30th; Jennifer Day is quarterly on the 30th.
//
// Clamping to the last day of the target month is what a person means by "the
// 31st of a month with 30 days in it".
function addMonthsClamped(dt: Date, months: number): void {
  const day = dt.getUTCDate();
  dt.setUTCDate(1);                      // park on a day every month has
  dt.setUTCMonth(dt.getUTCMonth() + months);
  const lastDayOfTarget = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(day, lastDayOfTarget));
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
  else if (cadence === "quarterly") addMonthsClamped(dt, -3);
  else addMonthsClamped(dt, -1); // monthly default
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
  else if (cadence === "quarterly") addMonthsClamped(dt, 3);
  else addMonthsClamped(dt, 1);
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
  const known: BillingType[] = ["monthly_adjusted", "flat", "per_session", "paid_by_other", "none"];
  if (i.billingType && known.includes(i.billingType)) return i.billingType;
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
  const cycleStart = reminderSendDate(
    // The recorded previous due date beats any recomputation of it.
    i.previousDueDateActual && i.previousDueDateActual < i.dueDate
      ? i.previousDueDateActual
      : previousDueDate(i.dueDate, i.cadence),
  );
  const cycleEnd = reminderSendDate(i.dueDate);

  const cancelled = Math.max(0, Number(i.cancelledFull) || 0);
  // halfPriceSessions is dead: late cancels are handled by not marking them
  // orange in the calendar, so the slot stays billable. Read nowhere below.

  const base = {
    cycleStart,
    cycleEnd,
    billingType,
    sessionsTrained,
    rate: i.sessionRate ?? null,
    cancelledFull: cancelled,
    cancelledHalf: i.cancelledHalf || 0,
    autoCredits: 0,
    totalCredits: 0,
    baseRate: null as number | null,
    cancelDeduction: 0,
    halfPriceDeduction: 0,
    sessionsCredited: 0,
    sessionsExtra: null as number | null,
    provisional: false,
  };

  // Not billed by the app at all. 'paid_by_other' is on somebody else's
  // invoice; 'none' is family, staff, or a client who settles up directly.
  // Nothing is generated, nothing is shown, nothing blocks.
  if (billingType === "none" || billingType === "paid_by_other") {
    return { ...base, notApplicable: true, expected: 0, blocking: [], warnings: [] };
  }

  // ── NOTHING GOES OUT BEFORE THE CYCLE CLOSES ────────────────────────────
  //
  // Dustin, 2026-08-20: "add back in provisional windows on payments so I cant
  // send until 7 days before."
  //
  // A cycle closes seven days before the due date, and only then is the amount
  // final. Before that, every orange mark he adds changes it — so a reminder
  // sent early is a number the client will be quoted and then charged something
  // else. Seven of the twenty open reminders were mid-cycle when the rule
  // changed today, which is exactly the window this closes.
  //
  // BLOCKING, not a warning. The screen already showed a PROVISIONAL badge and
  // it stopped nothing; a badge beside a live Approve button is a label, not a
  // guard. The override path is deliberately absent here: the point is that the
  // figure is not knowable yet, and overriding an unknown is not a judgement
  // call the way overriding an amount is.
  const provisional = !!i.todayCT && i.todayCT < cycleEnd;
  if (provisional) {
    blocking.push(
      "This cycle closes " + cycleEnd + " — the amount can still change until then. " +
      "It can be sent from " + cycleEnd + ".",
    );
  }

  if (!i.cadence) warnings.push("No payment cadence found in calendar history - assuming monthly");

  let expected: number;
  let baseRate: number | null = null;
  let cancelDeduction = 0;
  let sessionsCredited = 0;
  let sessionsExtra: number | null = null;
  const halfPriceDeduction = 0;

  if (billingType === "flat") {
    // Flat clients pay current_fees per cycle regardless of what they trained.
    // Dustin, 20 Aug, on Tyler / Robert / Bobbie: "they do meet w me
    // occasionally on the calendar but that does not effect flat rate at all."
    if (i.fee == null) blocking.push("Flat billing but no fee on file - set the client fee first");
    expected = round2(Math.max(0, i.fee ?? 0));
    baseRate = i.fee ?? null;
    if (cancelled > 0 || i.cancelledHalf > 0) {
      warnings.push(
        "Flat rate: " + cancelled + " cancelled session" + (cancelled === 1 ? "" : "s") +
        " in this cycle, shown for reference only - the full rate is billed"
      );
    }
  } else if (billingType === "monthly_adjusted") {
    // THE RULE. Start at the rate; take off only the sessions they actually
    // missed. A cancellation the client made up later shows as a trained
    // session, so the shortfall closes and the credit closes with it.
    if (i.fee == null) {
      blocking.push("Monthly rate billing but no monthly rate on file - set the client's rate first");
    }
    if (i.sessionRate == null) {
      blocking.push("Monthly rate billing but no session rate on file - the cancellation credit cannot be worked out");
    }
    if (i.expectedSessions == null) {
      // Without the plan there is no shortfall to cap the credit against, and
      // the rule silently degenerates into the 20 August one it replaced.
      blocking.push("Monthly rate billing but no session count on file - set how many sessions the rate covers");
    }
    baseRate = i.fee ?? null;
    const rate = i.sessionRate ?? 0;
    const plan = i.expectedSessions ?? 0;
    sessionsCredited = Math.min(cancelled, Math.max(0, plan - sessionsTrained));
    sessionsExtra = i.expectedSessions == null ? null : Math.max(0, sessionsTrained - plan);
    cancelDeduction = round2(sessionsCredited * rate);
    expected = round2(Math.max(0, (i.fee ?? 0) - cancelDeduction));
    if (cancelled > sessionsCredited) {
      // Not a problem -- it is the rule working. Said out loud so the number on
      // the screen and the number of orange marks in the calendar do not look
      // like a contradiction when Dustin screenshots this for a client.
      //
      // TWO DIFFERENT REASONS, and saying the wrong one would be a lie in a
      // client's hand. If they still hit the plan, the cancelled sessions were
      // made up. If they did not, the calendar simply held more slots than the
      // rate covers -- a 12-session rate against a month with 14 bookings.
      const uncredited = cancelled - sessionsCredited;
      warnings.push(
        sessionsTrained >= plan
          ? uncredited + " of " + cancelled + " cancelled session" +
            (uncredited === 1 ? " was" : "s were") + " made up inside this cycle, so " +
            (uncredited === 1 ? "it is" : "they are") + " not credited"
          : uncredited + " cancelled session" + (uncredited === 1 ? "" : "s") +
            " beyond the " + plan + " the rate covers - not credited"
      );
    }
    if (sessionsExtra) {
      warnings.push(
        sessionsExtra + " session" + (sessionsExtra === 1 ? "" : "s") +
        " above the " + plan + " the rate covers - not charged"
      );
    }
    // The rate should divide by the session rate into the expected sessions.
    // When it does not, one of the three numbers is wrong - which is exactly
    // how Madeleine Coker's $75 session rate became a $75 monthly fee.
    if (i.fee != null && i.sessionRate != null && i.sessionRate > 0 && i.expectedSessions != null) {
      const implied = round2(i.fee / i.sessionRate);
      if (Math.abs(implied - i.expectedSessions) > 0.01) {
        warnings.push(
          "$" + i.fee + " / $" + i.sessionRate + " = " + implied + " sessions, but " +
          i.expectedSessions + " are set. Check the rate, the session rate, or the session count."
        );
      }
    }
  } else {
    // per_session: count what happened. Retained for anyone genuinely billed
    // this way; as of 20 Aug nobody on the roster is.
    if (i.sessionRate == null) {
      blocking.push("Per-session billing but no session rate on file - set the client's session rate");
    }
    expected = round2(sessionsTrained * (i.sessionRate ?? 0));
    // per_session clients are billed for what happened, so nobody is now on the
    // old comment's "nobody" - Todd Prine moved here 29 Aug.
  }

  // ── A $0 BILL IS A CONVERSATION, NOT AN INVOICE ─────────────────────────
  //
  // Sharon Rambo cancelled four in a row between 18 and 29 August. Her next
  // half-cycle computes to $300 - 4 x $75 = $0, and nothing anywhere stopped
  // that from being approved and emailed to her as a demand for nothing.
  //
  // Zero is a legitimate ARITHMETIC answer under every one of the three rules;
  // it is never a legitimate thing to send. Blocking rather than warning,
  // because the screen already carried a warning about a zero per-session cycle
  // and it stopped nothing. Overridable: Dustin may genuinely want to record a
  // $0 cycle rather than delete the row.
  if (expected === 0 && blocking.length === 0) {
    const why =
      billingType === "per_session"
        ? "no sessions were trained in this cycle"
        : billingType === "flat"
          ? "the flat rate on file is $0"
          : "every session the rate covers was cancelled";
    const msg = "This comes to $0 - " + why + ". Nothing should be sent; talk to them instead.";
    if (i.override) warnings.push(msg + " - OVERRIDDEN by trainer");
    else blocking.push(msg);
  }

  if (Math.abs(i.draftAmount - expected) > 0.009) {
    const basis =
      billingType === "flat"
        ? "flat rate $" + (i.fee ?? 0)
        : billingType === "monthly_adjusted"
          ? "$" + (i.fee ?? 0) + " less " + sessionsCredited + " missed x $" + (i.sessionRate ?? 0)
          : sessionsTrained + " sessions x $" + (i.sessionRate ?? 0);
    const msg = "Draft $" + i.draftAmount + " does not match calculated $" + expected + " (" + basis + ")";
    if (i.override) warnings.push(msg + " - OVERRIDDEN by trainer");
    else blocking.push(msg);
  }

  return { ...base, notApplicable: false, expected, baseRate, cancelDeduction, halfPriceDeduction,
           sessionsCredited, sessionsExtra, provisional, blocking, warnings };
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
