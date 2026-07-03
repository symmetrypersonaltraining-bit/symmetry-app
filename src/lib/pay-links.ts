// src/lib/pay-links.ts
// Pay-link builders for client payment reminders. PURE — no DB, no fetch, no side effects.
// Handles confirmed by Dustin 2026-07-03.

export const VENMO_USERNAME = "dustingautreaux"; // personal profile (venmo.com/u/dustingautreaux)

export const ZELLE = {
  recipientName: "Dustin Gautreaux",
  // Both enrolled with Zelle — clients can use either:
  email: "symmetrypersonaltraining@gmail.com",
  phone: "972-832-6201",
};

// Clients who pay via Square invoice (Dustin creates + sends the invoice from
// his Square dashboard). Their TRAINER-side reminder cards get a "SQUARE —
// send invoice" chip; client-side banner still shows Venmo/Zelle as options.
// Keyed by client slug. Fill after Dustin confirms who's on Square.
export const SQUARE_INVOICE_CLIENT_SLUGS: string[] = [];

// Optional: a Square payment link (square.link/u/...) if Dustin creates one in his Square dashboard.
// Empty string = Square button hidden entirely.
export const SQUARE_LINK = "";

// Optional: Cash App $cashtag (without the $). Empty = hidden.
export const CASHTAG = "";

/**
 * Venmo deep link with amount + note prefilled.
 * On a phone, the Venmo app registers venmo.com links and opens with
 * recipient/amount/note pre-filled — client just taps Pay.
 * On desktop it falls back to the Venmo profile page (no txn possible; fine).
 * NOTE: Venmo notes are public by default — keep the note generic, never
 * health/personal info. "Personal Training" only.
 */
export function buildVenmoLink(amount: number, note = "Personal Training"): string {
  const p = new URLSearchParams({ txn: "pay", amount: amount.toFixed(2), note });
  return "https://venmo.com/u/" + VENMO_USERNAME + "?" + p.toString();
}

/** Cash App link with amount prefilled: https://cash.app/$tag/205 */
export function buildCashAppLink(amount: number): string {
  return "https://cash.app/$" + CASHTAG + "/" + amount.toFixed(2);
}

/**
 * Zelle has NO universal deep link (it lives inside each bank's app).
 * The UI shows a small sheet: recipient name + contact with a copy button
 * + the exact amount with a copy button + one-line instructions.
 */
export const ZELLE_INSTRUCTIONS =
  "Open your banking app → Send money with Zelle® → add the contact below → send the exact amount.";
