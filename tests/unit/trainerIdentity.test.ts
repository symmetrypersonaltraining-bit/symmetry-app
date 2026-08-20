// WHO IS THE TRAINER — one answer, and it stays one answer.
//
// Until 11 Aug 2026 the answer was the literal "symmetrypersonaltraining@
// gmail.com", written out in 63 places across 62 files plus once inside the
// database's is_trainer(). That made Dylan's instance a FORK rather than a
// configuration: to make him the trainer, those 63 lines had to be edited, so
// fixes shipped here either never reached him or arrived as a merge touching
// the exact lines his copy had changed.
//
// Two things are tested here. The behaviour of the module, and — the one that
// actually keeps this fixed — a scan that fails the build the moment a 64th
// hardcoded copy of the address appears.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  TRAINER_EMAIL, TRAINER_EMAILS, isTrainerEmail, isTrainerUser,
  COACH_NAME, COACH_FIRST_NAME, BUSINESS_NAME,
} from "../../src/lib/trainer.ts";

// ── The module ───────────────────────────────────────────────────────────────

test("an unconfigured instance knows both trainers", () => {
  // CHANGED 20 Aug. This asserted the list was EXACTLY Dustin, which was right
  // when he was the only trainer and became wrong the moment Stephanie was
  // added — the test would have blocked her from being recognised at all.
  //
  // The defaults still make the change invisible in production: nothing in
  // Vercel has to be set. What changed is that there are two of them, and the
  // list is now a union so setting the env var cannot silently drop either.
  assert.deepEqual(
    [...TRAINER_EMAILS].sort(),
    ["steph.rgautreaux@gmail.com", "symmetrypersonaltraining@gmail.com"],
  );
  // TRAINER_EMAIL stays the OWNER — it means the business, not "whoever is
  // signed in". Using it for the latter is what 34 call sites did wrong.
  assert.equal(TRAINER_EMAIL, "symmetrypersonaltraining@gmail.com");
});

test("the trainer is recognised", () => {
  assert.equal(isTrainerEmail("symmetrypersonaltraining@gmail.com"), true);
  assert.equal(isTrainerUser({ email: "symmetrypersonaltraining@gmail.com" }), true);
});

test("a client is not", () => {
  assert.equal(isTrainerEmail("robert@example.com"), false);
  assert.equal(isTrainerUser({ email: "robert@example.com" }), false);
});

test("capitalisation and stray whitespace do not decide access", () => {
  // auth.users stores whatever was typed at signup. Someone signing in as
  // Symmetry... with a capital S must not become a non-trainer.
  assert.equal(isTrainerEmail("Symmetrypersonaltraining@Gmail.com"), true);
  assert.equal(isTrainerEmail("  symmetrypersonaltraining@gmail.com  "), true);
});

test("no email is not a trainer — every empty shape fails CLOSED", () => {
  // The failure mode that matters. An undefined email must never read as a
  // match against an empty configured value.
  assert.equal(isTrainerEmail(null), false);
  assert.equal(isTrainerEmail(undefined), false);
  assert.equal(isTrainerEmail(""), false);
  assert.equal(isTrainerUser(null), false);
  assert.equal(isTrainerUser(undefined), false);
  assert.equal(isTrainerUser({}), false);
  assert.equal(isTrainerUser({ email: null }), false);
});

test("a partial match is not a match", () => {
  assert.equal(isTrainerEmail("symmetrypersonaltraining@gmail.com.attacker.net"), false);
  assert.equal(isTrainerEmail("xsymmetrypersonaltraining@gmail.com"), false);
});

// ── The guard ────────────────────────────────────────────────────────────────

const ADDRESS = ["symmetrypersonaltraining", "@gmail.com"].join(""); // not a literal here either

/**
 * Uses of the address that are NOT identity checks and are correct as they are:
 * Symmetry's business contact details. Each is listed deliberately, with the
 * reason, so that adding to this list is a decision rather than an accident.
 */
const ALLOWED = new Map<string, string>([
  ["src/lib/trainer.ts", "the one place the default belongs"],
  ["src/app/privacy/page.tsx", "the privacy policy's public contact address"],
  ["src/lib/pay-links.ts", "the business's payment contact"],
  ["src/app/api/nutrition-ai/barcode-lookup/route.ts", "Open Food Facts requires a contact in the User-Agent"],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

test("no new hardcoded trainer address anywhere in src/", () => {
  const offenders = walk("src")
    .filter((p) => readFileSync(p, "utf8").includes(ADDRESS))
    .map((p) => p.split("\\").join("/"))
    .filter((p) => !ALLOWED.has(p));

  assert.deepEqual(
    offenders,
    [],
    `Hardcoded trainer address found in:\n  ${offenders.join("\n  ")}\n\n` +
      "Use isTrainerEmail(email) from @/lib/trainer for 'is this the trainer', " +
      "or TRAINER_EMAIL when a single address is genuinely needed (a lookup, an " +
      "email recipient). If this really is a business contact detail rather than " +
      "an identity check, add it to ALLOWED above with the reason.",
  );
});

test("the allowlist has not quietly grown", () => {
  // A cap, so 'just add it to ALLOWED' stops being the easy way out.
  assert.ok(ALLOWED.size <= 4, `ALLOWED is ${ALLOWED.size} entries — that is the old problem coming back`);
});

test("identity checks do not compare emails by hand", () => {
  // isTrainerEmail exists so that a SECOND trainer works. `x === TRAINER_EMAIL`
  // compiles, passes review, and silently supports exactly one — which is the
  // bug this whole change removes.
  const bad = walk("src")
    .filter((p) => !p.endsWith("lib/trainer.ts"))
    .filter((p) => /[!=]==\s*TRAINER_EMAIL\b/.test(readFileSync(p, "utf8")))
    .map((p) => p.split("\\").join("/"));
  assert.deepEqual(bad, [], `Compare with isTrainerEmail() instead of === TRAINER_EMAIL:\n  ${bad.join("\n  ")}`);
});

// ── The coach is not found by name ───────────────────────────────────────────
//
// Five components looked up the trainer's own clients row with
// .ilike("name", "%Dustin%") — but only on the trainer branch; for a client
// they correctly used auth_user_id. On any other instance there is no client
// called Dustin, so the query returns nothing and the component renders as if
// the person has no data: no coach avatar, no week summary, no milestone
// badges, no macros card, no weigh-in reminder. Nothing throws, nothing logs.
//
// Same class of bug as the hardcoded email, one layer down, and silent.

test("no component finds the coach by searching for a human's name", () => {
  const offenders = walk("src")
    .filter((p) => !p.endsWith("lib/ownClient.ts"))
    .filter((p) => /ilike\(\s*["']name["']\s*,\s*["']%Dustin%["']\s*\)/.test(readFileSync(p, "utf8")))
    .map((p) => p.split("\\").join("/"))
    // A comment recording the old code is fine; a live query is not.
    .filter((p) => {
      const src = readFileSync(p, "utf8");
      return src.split("\n").some(
        (l) => /ilike\(\s*["']name["']\s*,\s*["']%Dustin%["']\s*\)/.test(l) && !l.trim().startsWith("//"),
      );
    });

  assert.deepEqual(
    offenders,
    [],
    `Looking up a person by name only works on one database:\n  ${offenders.join("\n  ")}\n\n` +
      "Use fetchOwnClientRow(sb, user, columns) from @/lib/ownClient.",
  );
});

// ── The coach's NAME in client-facing copy ───────────────────────────────────
//
// About a hundred places spoke Dustin's name out loud: "Send to Dustin", "Your
// answer for Dustin…", "Dustin was notified", the trainer sidebar, the PWA
// manifest, and inside the AI system prompts that write in his voice.
//
// None of it BREAKS on another instance, which is why it is worse than broken.
// It works perfectly and names the wrong human, so every client another trainer
// coaches is told to go and talk to Dustin. There is no error to notice.

const COACH_ALLOWED = new Map<string, string>([
  ["src/lib/trainer.ts", "where the default belongs"],
  ["src/app/privacy/page.tsx", "a legal document naming the real business and person"],
  ["src/lib/pay-links.ts", "the business's actual payment recipient"],
  ["src/lib/peak-week.ts", "a client id, with the name as a comment"],
]);

/** Strip line comments, block comments and JSX comments before scanning. */
function stripComments(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")   // {/* jsx */}
    .replace(/\/\*[\s\S]*?\*\//g, "")             // /* block */
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");        // // line  (":" guards https://)
}

test("no client-facing copy names the coach directly", () => {
  const NAME = ["Dus", "tin"].join(""); // not a literal here either
  const offenders = walk("src")
    .map((p) => p.split("\\").join("/"))
    .filter((p) => !COACH_ALLOWED.has(p))
    .filter((p) => stripComments(readFileSync(p, "utf8")).includes(NAME));

  assert.deepEqual(
    offenders,
    [],
    `The coach's name is hardcoded in:\n  ${offenders.join("\n  ")}\n\n` +
      "Use COACH_FIRST_NAME / COACH_NAME from @/lib/trainer. In JSX that is " +
      "{COACH_FIRST_NAME}; inside a template literal ${COACH_FIRST_NAME}; a " +
      "plain \"…\" string needs converting to a backtick template first.",
  );
});

test("the coach-name allowlist has not quietly grown", () => {
  assert.ok(COACH_ALLOWED.size <= 4, `COACH_ALLOWED is ${COACH_ALLOWED.size} entries`);
});

test("the coach's first name is derived, never configured twice", () => {
  // Two settings that have to agree is one setting too many — someone would
  // eventually set NEXT_PUBLIC_COACH_NAME and not its first-name twin.
  assert.equal(COACH_FIRST_NAME, COACH_NAME.split(/\s+/)[0]);
});

test("an unconfigured instance still reads as Dustin's", () => {
  assert.equal(COACH_NAME, ["Dustin", "Gautreaux"].join(" "));
  assert.equal(BUSINESS_NAME, "Symmetry Personal Training");
});
