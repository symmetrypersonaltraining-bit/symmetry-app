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

// The trainers on this instance, as code. Kept in step with the `trainers`
// table, which is the AUTHORITY — `is_trainer()` and every RLS policy resolve
// through that table, not through this list. What this list does is decide
// which controls get drawn before the database has been asked.
//
// Stephanie added 20 Aug 2026. Deliberately here rather than only in an
// environment variable: adding a trainer should not depend on somebody
// remembering to edit Vercel config, and a mismatch between the two would show
// a real trainer a client's interface over data she can perfectly well read.
const DEFAULT_TRAINER_EMAILS = [
  "symmetrypersonaltraining@gmail.com",
  "steph.rgautreaux@gmail.com",
];
const DEFAULT_TRAINER_EMAIL = DEFAULT_TRAINER_EMAILS[0];

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
  // UNION, not override.
  //
  // This used to be "env if set, otherwise the default", which means setting
  // the variable to one address silently REMOVES everyone else — and nothing
  // would say so. Adding a trainer would then require an env edit on top of the
  // database work, and forgetting it draws a trainer the client interface over
  // rows she can read perfectly well: broken in a way that looks like a bug in
  // the app rather than a missing setting.
  //
  // Removing a trainer is a database change (trainers.active = false) or a code
  // change, not an env edit. That is the correct place for it — RLS is the real
  // boundary and it has never read this list.
  const configured = [
    ...parse(process.env.NEXT_PUBLIC_TRAINER_EMAILS),
    ...parse(process.env.TRAINER_EMAILS),
    ...DEFAULT_TRAINER_EMAILS.map((e) => e.toLowerCase()),
  ];
  const seen = new Set<string>();
  return configured.filter((e) => (seen.has(e) ? false : (seen.add(e), true)));
})();

/**
 * The PRIMARY trainer — the OWNER, and the only correct use of this constant is
 * a fact about the business rather than about a person: where an
 * infrastructure alert goes, who a cost warning emails.
 *
 * IT IS NOT "the current trainer". Using it to find the signed-in trainer's own
 * client row, address a digest, or name a coach lands on Dustin no matter who is
 * signed in — 34 call sites did exactly that before 20 Aug. Use
 * `resolveTrainer()` for anything about the person using the app.
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
