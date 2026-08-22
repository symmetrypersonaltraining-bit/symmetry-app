// WHERE the money goes — read through a gate, not off the table.
//
// The five payment columns on `trainers` (venmo_username, zelle_email,
// cashapp_handle, pay_phone, pay_display_name) are no longer SELECTable by the
// `authenticated` role. Dustin, 21 Aug: "I do not want anyone but their own
// clients seeing their pmt info."
//
// RLS is ROW-level and could not express that: the row-read policies already
// let a trainer see their own row and the owner see every row, and the moment a
// row is visible every column on it is. Postgres COLUMN privileges are the only
// mechanism that draws the line, so SELECT on those five was revoked outright
// and `trainer_pay_details(uuid)` — SECURITY DEFINER — hands them back to
// exactly two askers: the trainer themself, and a client of that trainer.
//
// That includes the owner. Dustin cannot read another trainer's Venmo tag
// either, which is the point of the sentence above and not an oversight.
//
// Every surface that needs a pay destination goes through here.

import type { PayDestination } from "@/lib/pay-links";

type RpcResult = PromiseLike<{ data: unknown; error?: unknown }>;
type RpcDb = { rpc: (fn: string, args: Record<string, unknown>) => RpcResult };

/** The RPC's row, or null when the caller is not allowed to see it. */
export async function payDestinationFor(
  db: unknown,
  trainerId: string | null | undefined,
): Promise<PayDestination | null> {
  if (!trainerId) return null;
  try {
    const { data } = await (db as RpcDb).rpc("trainer_pay_details", { p_trainer: trainerId });
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
    if (!row) return null;
    return {
      recipientName: String(row.recipient_name || ""),
      venmoUsername: (row.venmo_username as string) ?? null,
      zelleEmail: (row.zelle_email as string) ?? null,
      zellePhone: (row.pay_phone as string) ?? null,
      cashtag: (row.cashapp_handle as string) ?? null,
    };
  } catch {
    // A pay destination that cannot be read must degrade to "not set", never
    // to a blank client home screen.
    return null;
  }
}

/** True when this destination can actually receive money. */
export function payDestinationIsSet(d: PayDestination | null): boolean {
  return !!(d && (d.venmoUsername || d.zelleEmail || d.cashtag || d.zellePhone));
}
