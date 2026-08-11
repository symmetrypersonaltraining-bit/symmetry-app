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
import { TRAINER_EMAIL, TRAINER_EMAILS, isTrainerEmail, isTrainerUser } from "../../src/lib/trainer.ts";

// ── The module ───────────────────────────────────────────────────────────────

test("an unconfigured instance is still Dustin's", () => {
  // The default is what makes this change invisible in production. Nothing in
  // Vercel has to be set for the app to behave exactly as it did yesterday.
  assert.deepEqual(TRAINER_EMAILS, ["symmetrypersonaltraining@gmail.com"]);
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
