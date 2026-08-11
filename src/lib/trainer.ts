// WHO IS THE TRAINER. One answer, in one place.
//
// Until 11 Aug 2026 this question was answered by the literal string
// "symmetrypersonaltraining@gmail.com", written out in 63 places across 62
// files plus once inside the database's is_trainer(). Two consequences, and
// the second is the expensive one:
//
//   1. Dylan's instance was not a CONFIGURATION of this app, it was a FORK —
//      those same 63 lines had to be edited to make him the trainer. So fixes
//      shipped here either never reached him or arrived as a merge touching
//      the exact lines his copy had changed. The two drift apart by default,
//      and once they drift, "Dylan testing from a trainer perspective" stops
//      testing what Dustin's clients are actually running.
//   2. A second trainer at Sevens was impossible, because there was nowhere to
//      put a second answer.
//
// Configure with TRAINER_EMAILS (comma-separated). Dustin's address is the
// default, so an instance with nothing set behaves exactly as before.
//
// NEXT_PUBLIC_ is required because roughly half the call sites are client
// components — the dock, the avatar, the badges. Next inlines it at build
// time. That is fine: a trainer's email address is not a secret, it is on the
// website. What is secret is what a trainer can DO, and that is enforced by
// RLS in the database, never by this file. Nothing here grants access; it only
// decides which controls to draw. Treat it as presentation.

const DEFAULT_TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

function parse(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Every address that counts as a trainer on this instance, lower-cased.
 * Never empty — an instance with no configuration is Dustin's.
 */
export const TRAINER_EMAILS: string[] = (() => {
  const configured = [
    ...parse(process.env.NEXT_PUBLIC_TRAINER_EMAILS),
    ...parse(process.env.TRAINER_EMAILS),
  ];
  const seen = new Set<string>();
  const out = configured.filter((e) => (seen.has(e) ? false : (seen.add(e), true)));
  return out.length ? out : [DEFAULT_TRAINER_EMAIL];
})();

/**
 * The PRIMARY trainer — the one address to use when a single value is needed
 * rather than a test: looking up the trainer's own `clients` row, addressing a
 * digest, seeding a message. Not for permission checks; use isTrainerEmail.
 */
export const TRAINER_EMAIL: string = TRAINER_EMAILS[0];

/** Is this address a trainer on this instance? Case-insensitive. */
export function isTrainerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return TRAINER_EMAILS.includes(email.trim().toLowerCase());
}

/** The same question about a Supabase user (or anything carrying an email). */
export function isTrainerUser(user: { email?: string | null } | null | undefined): boolean {
  return isTrainerEmail(user?.email);
}

// ── The coach's NAME, as clients read it ─────────────────────────────────────
//
// Separate from identity above, and needed for a different reason. The app
// spoke Dustin's name out loud in about forty places of client-facing copy:
// "Send to Dustin", "Your answer for Dustin…", "Dustin was notified", the
// trainer sidebar, the celebration screen, the slacker screen, and inside the
// AI prompts that write the weekly focus line.
//
// None of that BREAKS on another instance — it is worse than broken. It works
// perfectly and addresses the wrong human, so every client Dylan coaches is
// told to go and talk to Dustin. There is no error to notice; it just reads as
// somebody else's app.
//
// Configure with NEXT_PUBLIC_COACH_NAME. Unset, it is Dustin, so nothing
// changes on the live instance.

const DEFAULT_COACH_NAME = "Dustin Gautreaux";
const DEFAULT_BUSINESS_NAME = "Symmetry Personal Training";

/** Full name, for signatures and the trainer sidebar. */
export const COACH_NAME: string =
  (process.env.NEXT_PUBLIC_COACH_NAME || "").trim() || DEFAULT_COACH_NAME;

/**
 * First name, which is how clients are actually addressed in copy.
 * Derived rather than configured separately — two settings that must agree is
 * one setting too many, and someone would eventually set only one of them.
 */
export const COACH_FIRST_NAME: string = COACH_NAME.split(/\s+/)[0] || COACH_NAME;

/** The business, for AI prompts and anywhere the studio is named in copy. */
export const BUSINESS_NAME: string =
  (process.env.NEXT_PUBLIC_BUSINESS_NAME || "").trim() || DEFAULT_BUSINESS_NAME;
