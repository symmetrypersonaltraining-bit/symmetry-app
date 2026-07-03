// Pure reminder calculation + verification logic. No I/O.
// Rules (Dustin, 2026-07-03): amount is DERIVED from fee + cadence, minus
// session credits for cancelled (orange = full rate) and vacation (half rate)
// appointments inside the billing cycle (previous due date -> due date).
// Any mismatch BLOCKS the draft until Dustin edits or overrides.

export type Cadence = "monthly" | "biweekly" | "weekly" | "quarterly";

export interface ReminderCalcInput {
  fee: number | null;
  sessionRate: number | null;
  cadence: Cadence | null;
  dueDate: string; // YYYY-MM-DD
  cancelledFull: number; // cancelled_client appointments in cycle
  cancelledHalf: number; // cancelled_half (vacation) appointments in cycle
  manualCredits: number; // extra credits Dustin typed in the editor
  lastPaymentAmount: number | null;
  draftAmount: number; // current amount_due on the reminder row
  override: boolean; // Dustin explicitly accepted a non-calculated amount
}

export interface ReminderCalcResult {
  cycleStart: string; // previous due date (start of look-back window)
  autoCredits: number;
  totalCredits: number;
  expected: number;
  blocking: string[];
  warnings: string[];
}

export function previousDueDate(dueDate: string, cadence: Cadence | null): string {
  const parts = dueDate.split("-").map(Number);
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (cadence === "weekly") dt.setUTCDate(dt.getUTCDate() - 7);
  else if (cadence === "biweekly") dt.setUTCDate(dt.getUTCDate() - 14);
  else if (cadence === "quarterly") dt.setUTCMonth(dt.getUTCMonth() - 3);
  else dt.setUTCMonth(dt.getUTCMonth() - 1); // monthly default
  return dt.toISOString().slice(0, 10);
}

export function nextDueDate(dueDate: string, cadence: Cadence | null): string {
  const parts = dueDate.split("-").map(Number);
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (cadence === "weekly") dt.setUTCDate(dt.getUTCDate() + 7);
  else if (cadence === "biweekly") dt.setUTCDate(dt.getUTCDate() + 14);
  else if (cadence === "quarterly") dt.setUTCMonth(dt.getUTCMonth() + 3);
  else dt.setUTCMonth(dt.getUTCMonth() + 1);
  return dt.toISOString().slice(0, 10);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calcReminder(i: ReminderCalcInput): ReminderCalcResult {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const rate = i.sessionRate ?? 0;
  const autoCredits = round2(i.cancelledFull * rate + i.cancelledHalf * rate * 0.5);
  const totalCredits = round2(autoCredits + (i.manualCredits || 0));

  if ((i.cancelledFull > 0 || i.cancelledHalf > 0) && !i.sessionRate) {
    blocking.push("Cancelled sessions in this cycle but no session rate on file");
  }
  if (i.fee == null) blocking.push("No fee on file - set the client fee first");
  if (!i.cadence) warnings.push("No payment cadence found in calendar history - assuming monthly");

  const expected = round2(Math.max(0, (i.fee ?? 0) - totalCredits));

  if (i.fee != null && i.lastPaymentAmount != null && Number(i.lastPaymentAmount) !== Number(i.fee)) {
    warnings.push("Last actual payment $" + i.lastPaymentAmount + " differs from fee on file $" + i.fee + " - verify the rate is current");
  }
  if (i.fee != null && Math.abs(i.draftAmount - expected) > 0.009) {
    const msg = "Draft $" + i.draftAmount + " does not match calculated $" + expected + " (fee $" + i.fee + " minus credits $" + totalCredits + ")";
    if (i.override) warnings.push(msg + " - OVERRIDDEN by trainer");
    else blocking.push(msg);
  }

  return { cycleStart: previousDueDate(i.dueDate, i.cadence), autoCredits, totalCredits, expected, blocking, warnings };
}
