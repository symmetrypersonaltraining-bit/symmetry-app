// src/lib/pay-links.ts
// Pay-link builders for client payment reminders. PURE — no DB, no fetch, no side effects.
//
// ── WHOSE ACCOUNT? ─────────────────────────────────────────────────────────
// Every value here was a module constant naming Dustin. From 20 Aug there are
// two trainers, and Stephanie's clients pay HER directly (his decision). A
// client paying the wrong trainer is the single worst thing this app could do
// silently, so the destination is now DATA, passed in per client, and these
// constants survive only as the fallback for a client with no trainer resolved.
//
// The builders stay pure. The lookup lives in trainerResolve.ts; the components
// pass a PayDestination in.

/** Where one client's money should go. Resolved from their trainer's row. */
export interface PayDestination {
  recipientName: string;
  venmoUsername: string | null;
  zelleEmail: string | null;
  zellePhone: string | null;
  cashtag: string | null;
}

export const VENMO_USERNAME = "dustingautreaux"; // personal profile (venmo.com/u/dustingautreaux)

export const ZELLE = {
  recipientName: "Dustin Gautreaux",
  // Both enrolled with Zelle — clients can use either:
  email: "symmetrypersonaltraining@gmail.com",
  phone: "972-832-6201",
};

/**
 * The owner's details, as a destination. USED ONLY when a client's trainer
 * cannot be resolved — which after phase 1 means a client row with no
 * trainer_id, a state the NOT NULL constraint makes impossible.
 *
 * Kept because showing NO way to pay is worse than showing the business's
 * default one, and because the alternative — throwing — would blank a client's
 * home screen over a billing detail.
 */
export const OWNER_PAY_DESTINATION: PayDestination = {
  recipientName: ZELLE.recipientName,
  venmoUsername: VENMO_USERNAME,
  zelleEmail: ZELLE.email,
  zellePhone: ZELLE.phone,
  cashtag: CASHTAG_FALLBACK(),
};

function CASHTAG_FALLBACK(): string | null { return null; }

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
export function buildVenmoLink(amount: number, note = "Personal Training", username?: string | null): string {
  const p = new URLSearchParams({ txn: "pay", amount: amount.toFixed(2), note });
  // The caller's username wins. Defaulting to the module constant when one is
  // not passed keeps every existing call site working unchanged — but every
  // client-facing call site now passes one.
  return "https://venmo.com/u/" + (username || VENMO_USERNAME) + "?" + p.toString();
}

/** Cash App link with amount prefilled: https://cash.app/$tag/205 */
export function buildCashAppLink(amount: number, cashtag?: string | null): string {
  return "https://cash.app/$" + (cashtag || CASHTAG) + "/" + amount.toFixed(2);
}

/**
 * Zelle has NO universal deep link (it lives inside each bank's app).
 * The UI shows a small sheet: recipient name + contact with a copy button
 * + the exact amount with a copy button + one-line instructions.
 */
export const ZELLE_INSTRUCTIONS =
  "Open your banking app → Send money with Zelle® → add the contact below → send the exact amount.";
