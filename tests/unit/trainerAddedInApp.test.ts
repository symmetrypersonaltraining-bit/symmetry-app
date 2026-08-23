// A trainer added from inside the app is a trainer everywhere.
//
// Dustin, 21 Aug, with four testers due on the app the next morning:
//
//   "they should also be able to fill out assessment pages, add clients etc...
//    they are testing the app they need full functionality just like i have to
//    manage their own clients and all their data."
//
// ── What was actually wrong ─────────────────────────────────────────────────
//
// `isTrainerEmail()` answers from `TRAINER_EMAILS`, an array fixed when the app
// is BUILT. That was correct while the only way to become a trainer was to edit
// the array and deploy. /api/invite-trainer changed it: an owner adds a trainer
// from inside the app, a `trainers` row appears with auth_user_id stamped, and
// that person is a trainer immediately — on a deployment that has never heard
// of their address.
//
// The database was never the problem. is_trainer() joins auth.users to
// `trainers` on lower(email), so every RLS policy already let them through. It
// was 136 app-layer checks, in 65 files, all asking the build-time list. The
// first trainer invited would have got:
//
//   middleware        no early exit -> straight into the CLIENT onboarding
//                     redirect chain, on EVERY navigation. They would never
//                     have reached a page at all.
//   (app)/layout      the client app shell: no roster, no dock, no builder
//   ai/scope          403 on every AI route in the app, including the coach
//   ~40 routes/pages  401/403/redirect on the roster, payments, assessments,
//                     the programme builder, invites
//   messageActions    returned 0 and said nothing — a broadcast that silently
//                     never sent
//
// None of it would have looked like a permissions bug. It would have looked
// like the app was broken for them and fine for Dustin.
//
// Pure node: reads the source, no browser, no network.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  isTrainerEmail,
  noteTrainerEmail,
  knownTrainerEmails,
  __resetLearnedTrainers,
  TRAINER_EMAILS,
} from "../../src/lib/trainer.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Source with comments removed — a rule described in prose is not a rule. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${e}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(e)) out.push(rel);
  }
  return out;
}

// ─── the learned registry ───────────────────────────────────────────────────

test("an address off the build-time list is not a trainer until the table says so", () => {
  __resetLearnedTrainers();
  assert.ok(!isTrainerEmail("justinrayaus@yahoo.test"));
  noteTrainerEmail("justinrayaus@yahoo.test");
  assert.ok(isTrainerEmail("justinrayaus@yahoo.test"));
  __resetLearnedTrainers();
  assert.ok(!isTrainerEmail("justinrayaus@yahoo.test"), "the registry never persisted the reset away");
});

test("learning is case- and whitespace-insensitive, like the list it extends", () => {
  __resetLearnedTrainers();
  noteTrainerEmail("  Justin.Ray@Example.TEST  ");
  assert.ok(isTrainerEmail("justin.ray@example.test"));
  assert.ok(isTrainerEmail("JUSTIN.RAY@EXAMPLE.TEST"));
  __resetLearnedTrainers();
});

test("learning never removes a configured trainer", () => {
  __resetLearnedTrainers();
  noteTrainerEmail("someone@else.test");
  for (const e of TRAINER_EMAILS) assert.ok(isTrainerEmail(e), e + " stopped being a trainer");
  assert.ok(knownTrainerEmails().includes("someone@else.test"));
  __resetLearnedTrainers();
});

test("nothing empty or null is ever learned", () => {
  __resetLearnedTrainers();
  for (const bad of [null, undefined, "", "   "]) {
    noteTrainerEmail(bad as string | null | undefined);
    assert.ok(!isTrainerEmail(bad as string | null | undefined));
  }
  assert.deepEqual(knownTrainerEmails().sort(), [...TRAINER_EMAILS].sort());
});

// ─── the resolver ───────────────────────────────────────────────────────────

test("the resolver fails OPEN to the build-time list, never closed", () => {
  const c = code(read("src/lib/auth/viewer.ts"));
  // A trainers query that throws must not demote Dustin in his own app.
  assert.match(c, /catch\s*\{[\s\S]{0,200}\}\s*return isTrainerEmail\(user\.email\)/,
    "an unreachable trainers table returns false instead of the configured answer");
  // Was `active !== false`. The point of the assertion is that DEACTIVATION IS
  // HONOURED, and `=== true` honours it strictly more — it also refuses a NULL,
  // which is what trainerGate.ts has always required. The two disagreeing was a
  // trap waiting to hand somebody the full trainer shell and a 403 from the AI
  // in the same session, so all three readers now say the same thing.
  assert.match(c, /active === true/,
    "a deactivated trainer is still treated as one — trainers.active is how one is switched off");
  assert.match(c, /ilike\("email"/,
    "no address fallback: a trainers row whose auth_user_id was never stamped resolves to 'not a trainer', " +
    "while my_trainer_id() and is_trainer() both match it by email and let them through");
});

// ─── nothing gates on the build-time list any more ──────────────────────────

// The list is PRESENTATION — the file that defines it says so. These are the
// only places allowed to consult it directly, each for a stated reason.
const MAY_USE_THE_LIST = new Set([
  "src/lib/trainer.ts",          // defines it
  "src/lib/auth/viewer.ts",      // the fast path, then the table
  "src/lib/ai/scope.ts",         // a back-compat re-export, no call
  "src/middleware.ts",           // short-circuits before paying for a query
  "src/app/(app)/layout.tsx",    // OR'd with the database answer beside it
  "src/lib/useNotificationFeed.tsx", // OR'd with coach.isSelf from the provider
  "src/lib/rankings.ts",         // pure function over rows; no db in scope
]);

test("no route, page or action decides trainer-ness from the build-time list", () => {
  const offenders: string[] = [];
  for (const f of walk("src")) {
    if (MAY_USE_THE_LIST.has(f)) continue;
    const c = code(read(f));
    if (/\bisTrainerEmail\s*\(|\bisTrainerUser\s*\(/.test(c)) offenders.push(f);
  }
  assert.deepEqual(offenders, [],
    "these ask a build-time list who is a trainer, so a trainer added from inside the app is denied:\n  " +
    offenders.join("\n  "));
});

test("the two surfaces that decide which app you get ask the database", () => {
  const mw = code(read("src/middleware.ts"));
  assert.match(mw, /from\("trainers"\)/,
    "middleware never asks the trainers table, so a new trainer falls into the client onboarding chain");
  // And it must not pay for that query for the addresses it already knows.
  assert.match(mw, /const bakedIn = isTrainerEmail\(user\.email\)/,
    "middleware queries trainers even for a configured trainer — that is a round trip on every navigation");

  const layout = code(read("src/app/(app)/layout.tsx"));
  assert.match(layout, /coach\.isSelf/,
    "the layout picks the app shell from the email list while coachForViewer sits unused beside it");
});

test("every AI route reaches a trainer added from inside the app", () => {
  const c = code(read("src/lib/ai/scope.ts"));
  assert.match(c, /await viewerIsTrainer\(supabase, user\)/,
    "resolveAiScope gates every AI route in the app; on the build-time list a new trainer gets 403 on all of them");
});

test("the invite stamps the auth link the resolver looks for", () => {
  const c = code(read("src/app/api/invite-trainer/route.ts"));
  assert.match(c, /auth_user_id: authUserId/,
    "the trainers row is inserted without auth_user_id, so coachForViewer resolves them to nobody");
});
