/**
 * WHAT THE MONEY ROW ON TODAY'S ADMIN IS ALLOWED TO SAY.
 *
 * Dustin, 14 Sep 2026, looking at the trainer home:
 *
 *   *"Wording is not right, 9 are not 'ready to send' they're still in
 *     provisional period"*
 *
 * The card read **"3 sent, not confirmed paid. 9 ready to send."** The 3 were
 * right. The 9 were not nine of anything he could act on.
 *
 * ── WHAT THE NINE ACTUALLY WERE ──────────────────────────────────────────────
 *
 * All nine were **already paid**. Eight of them were July invoices — Sharon
 * Rambo 7 Jul, Todd Prine and Stacie Weever 9 Jul, Tina Haley 12 Jul, Grant
 * Weever 14 Jul, Claudine Ocon 15 Jul, Lesly Spencer 18 Jul, Sharon Rambo again
 * 21 Jul — every one of them `notification_status: 'paid'` with a
 * `paid_confirmed_at` timestamp on it, fifty-five to sixty-nine days old. The
 * ninth was Mary Ellen Joseph's 10 Sep invoice, which she had paid before the
 * row was even created.
 *
 * They sat in the bucket because the old filter asked exactly one question:
 *
 *     !p.reminder_sent_at && p.due_date <= today + 7
 *
 * A reminder that is paid without a reminder ever being sent — he was handed
 * cash, or a transfer landed, and he marked it paid — never gets a
 * `reminder_sent_at`. So it passes `!reminder_sent_at` forever, and the card
 * kept telling him to chase money he had already been given. Permanently, and
 * growing: every payment taken that way adds one.
 *
 * ── AND THE WORD HE REACHED FOR IS THE ONE THE CARD WAS MISSING ──────────────
 *
 * "Provisional" is already a real thing in this app. The cycle closes SEVEN
 * DAYS BEFORE the due date, and until it does the amount can still move — every
 * orange cancellation mark he adds changes it. `/api/reminders/send` refuses to
 * send before then (Dustin, 20 Aug: *"add back in provisional windows on
 * payments so I cant send until 7 days before"*), and the reminder editor badges
 * those rows `PROVISIONAL — can send from <date>`.
 *
 * The home card had no idea that state existed. It could only say "ready to
 * send", so the 13 invoices that genuinely ARE waiting on their cycle — Hassan
 * Kareem 22 Sep through Jennifer Day 30 Oct — were invisible, and the 9 it did
 * count were finished business. He read one as the other, which is the only
 * reading the card left open to him.
 *
 * ── SO THE RULE ──────────────────────────────────────────────────────────────
 *
 *   paid, skipped or paused   →  counted nowhere. There is nothing to do.
 *   sent, not confirmed       →  awaiting  (past due → overdue)
 *   unsent, cycle CLOSED      →  ready to send. This is the actionable one.
 *   unsent, cycle still open  →  provisional. Named, never counted as work.
 *
 * Provisional deliberately cannot raise the card on its own. A row you are
 * forbidden to act on is not admin; it is context, and it only appears when the
 * card is already up for a reason.
 *
 * This lives in lib and not in the component so it can be tested against the
 * real rows, which is the only way the 9 was ever going to be caught.
 */

/** Statuses that mean the invoice is closed and must not be counted as work. */
const CLOSED = new Set(["paid", "skipped", "paused"]);

/**
 * How long before the due date a cycle closes.
 *
 * Seven, and it is seven in three places: here, `reminder-calc.ts` (`cycleEnd`
 * = due date minus 7) and the send route's own lock. If that ever moves it
 * moves in all three or the card starts promising sends the route refuses.
 */
export const CYCLE_CLOSES_DAYS_BEFORE_DUE = 7;

export interface ReminderRow {
  due_date: string;
  reminder_sent_at: string | null;
  client_ack_at: string | null;
  paid_confirmed_at: string | null;
  notification_status: string | null;
}

export interface MoneyBuckets {
  /** Sent, not confirmed paid, and the due date has passed. A subset of `awaiting`. */
  overdue: ReminderRow[];
  /** Sent and still unanswered. */
  awaiting: ReminderRow[];
  /** Nothing sent, still owed, and the cycle has closed — he can send these now. */
  toSend: ReminderRow[];
  /** Nothing sent, still owed, cycle still open — the amount can still change. */
  provisional: ReminderRow[];
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * "Sep 15", the way the reminder editor writes the same date.
 *
 * Noon, not midnight: a date-only string parses as midnight UTC and renders as
 * the day before in Central, which is the oldest date bug in this codebase.
 */
function fmtDay(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The date this invoice's cycle closes, after which the amount is final. */
export function cycleEnd(dueDate: string): string {
  return addDays(dueDate, -CYCLE_CLOSES_DAYS_BEFORE_DUE);
}

/**
 * Is there still money outstanding on this row?
 *
 * Both halves matter. `paid_confirmed_at` is the timestamp he sets when the
 * money lands; `notification_status` is what the rest of the app filters on.
 * They agree on every row today — but a row marked paid without a timestamp, or
 * skipped entirely, is equally finished, and this is the check that stops
 * either shape coming back as work.
 */
export function isOutstanding(r: ReminderRow): boolean {
  return !r.paid_confirmed_at && !CLOSED.has(r.notification_status || "");
}

/** Sort the roster's reminders into what he can do something about. */
export function moneyBuckets(rows: ReminderRow[], todayCT: string): MoneyBuckets {
  const open = rows.filter(isOutstanding);

  // client_ack_at is "the client says they have paid" — it is an answer, so the
  // reminder is no longer waiting on them even though the money is unconfirmed.
  const awaiting = open.filter((p) => p.reminder_sent_at && !p.client_ack_at);
  const unsent = open.filter((p) => !p.reminder_sent_at);

  return {
    overdue: awaiting.filter((p) => p.due_date < todayCT),
    awaiting,
    toSend: unsent.filter((p) => cycleEnd(p.due_date) <= todayCT),
    provisional: unsent.filter((p) => cycleEnd(p.due_date) > todayCT),
  };
}

/** True when there is something on the card worth interrupting him for. */
export function needsAttention(b: MoneyBuckets): boolean {
  return b.overdue.length > 0 || b.awaiting.length > 0 || b.toSend.length > 0;
}

/**
 * The sentence under the count.
 *
 * Every clause is a number he can act on, except the last, which exists purely
 * so that "nothing to send" does not read as "nothing is coming".
 */
export function moneySub(b: MoneyBuckets, todayCT: string): string {
  const sentWaiting = b.awaiting.length - b.overdue.length;
  const parts: string[] = [];

  if (b.overdue.length) parts.push(b.overdue.length + " past due and unconfirmed.");
  if (sentWaiting > 0) parts.push(sentWaiting + " sent, not confirmed paid.");
  if (b.toSend.length) parts.push(b.toSend.length + " ready to send.");

  if (b.provisional.length) {
    // Carrying the date the FIRST one opens, because "13 still provisional"
    // invites exactly the question this row should already have answered: so
    // when can I send one? Phrased the way the reminder editor badges the same
    // state — "PROVISIONAL — can send from Sep 15" — so the two agree on sight.
    const next = b.provisional
      .map((p) => cycleEnd(p.due_date))
      .sort()
      .find((d) => d > todayCT);
    parts.push(
      b.provisional.length + " still provisional" +
        (next ? ", can send from " + fmtDay(next) + "." : "."),
    );
  }

  return parts.join(" ");
}
