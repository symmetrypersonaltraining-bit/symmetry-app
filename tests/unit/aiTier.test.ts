import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { modelFor, HAIKU_MODEL, SONNET_MODEL } from "../../src/lib/ai/anthropic";

/**
 * THE ADVANCED TIER, AND WHY IT HAS TO BE EVERYWHERE OR NOWHERE.
 *
 * Dustin, 2026-08-13, about his parents Gerard (71) and Sharon:
 *
 *   "That AI bot for them across the entire app needs to be a lot higher model
 *    so that it can do exactly what they tell it to do in the app... I need
 *    their AI to be able to do anything they need to do in that app for them so
 *    they don't have to figure it out."
 *
 * For every other client the AI is an assistant: if it misreads something they
 * close it and use the app. For these two it is the ONLY route in — they train
 * unsupervised, they are not tech savvy, and there is no fallback UI they are
 * going to go and find. A misunderstanding is not a worse answer, it is a dead
 * end.
 *
 * Which makes PARTIAL coverage the specific failure to guard against. A client
 * who gets the good model on the coach chat and the standard one on the workout
 * builder experiences an assistant that is inconsistently clever — and they have
 * no way to know which screen they are on the wrong side of. That is more
 * confusing than a consistently ordinary one, which is the opposite of the
 * point. So the test below is not "does the tier work", it is "did anyone add a
 * coaching surface and forget".
 */

test("the tier raises COMPREHENSION, and does not raise price", () => {
  // The first cut of this put advanced clients on Opus. The real usage log
  // priced it at $72/mo for ten interactions a day each, $144 at twenty —
  // against a $95 ceiling that also covers the other thirty clients. It would
  // have tripped the cap and silently degraded exactly the two people least
  // able to cope with a worse answer.
  //
  // Dustin: "we need to use a better model than everybody else, but don't take
  // it too far."
  //
  // So the tier moves the EXTRACTION step up instead. Their failure mode is the
  // app misreading "move Friday to Saturday" — not the coaching being shallow.
  assert.equal(modelFor("extract", "standard"), HAIKU_MODEL);
  assert.equal(modelFor("extract", "advanced"), SONNET_MODEL);

  // The coach answer is the same for everyone. Sonnet is already the top
  // coaching model in the app and it is good at that job; paying five times as
  // much for it is what blew the budget.
  assert.equal(modelFor("coach", "standard"), SONNET_MODEL);
  assert.equal(modelFor("coach", "advanced"), SONNET_MODEL);

  // Default is standard, so a caller that forgets the argument cannot silently
  // upgrade everybody.
  assert.equal(modelFor("extract"), HAIKU_MODEL);
});

test("no tier can route to a model outside the two the app prices for", () => {
  // A guard on the budget itself. The $95 ceiling is sized on Haiku and Sonnet
  // rates; introducing a third, dearer model without re-doing that arithmetic
  // is how the cap gets blown by a one-line change that looks like an upgrade.
  const allowed = new Set([HAIKU_MODEL, SONNET_MODEL]);
  for (const kind of ["extract", "coach"] as const) {
    for (const tier of ["standard", "advanced"] as const) {
      const m = modelFor(kind, tier);
      assert.ok(allowed.has(m), `modelFor(${kind}, ${tier}) returned ${m}, which the cost model does not cover`);
    }
  }
});

test("no coaching route still hard-codes SONNET_MODEL", () => {
  // The whole "across the entire app" requirement, as a build failure. Any
  // route that passes SONNET_MODEL directly is a screen where these two get the
  // standard model without anyone noticing.
  const hits = execSync(
    `grep -rn "model: SONNET_MODEL" src/app/api/ || true`,
    { encoding: "utf8", cwd: process.cwd() },
  )
    .split("\n")
    .filter(Boolean)
    // The TRAINER agent is Dustin's own, not a client coach. There is no client
    // whose tier could apply — it is not reachable by Gerard or Sharon or
    // anyone else — so it stays on Sonnet. Listed rather than filtered by a
    // vague pattern, so adding a real coaching route cannot hide behind it.
    .filter((l) => !l.startsWith("src/app/api/agent/route.ts:"));
  assert.deepEqual(
    hits,
    [],
    "a coaching route hard-codes SONNET_MODEL instead of modelFor('coach', tier) — " +
      "advanced-tier clients get the standard model there:\n  " + hits.join("\n  "),
  );
});

test("the tier lookup fails to standard on every unhappy path", () => {
  // Getting this backwards is a bill rather than a blip: an advanced client
  // seeing one ordinary answer is invisible; every client silently upgraded is
  // not. Every return in the failure paths must be 'standard'.
  const src = readFileSync(join(process.cwd(), "src/lib/ai/tier.ts"), "utf8");
  assert.match(src, /if \(!clientId\) return "standard"/);
  assert.match(src, /if \(error\) return "standard"/, "a failed lookup no longer defaults to standard");
  assert.match(src, /catch \{\s*return "standard";\s*\}/, "a thrown lookup no longer defaults to standard");
  assert.ok(
    !/catch[\s\S]{0,80}return "advanced"/.test(src),
    "a failure path returns 'advanced' — that upgrades everyone on any outage",
  );
});

test("the tier is a per-client column, never a hard-coded name", () => {
  // An `if (email === '…')` would have to be edited to add a third person, and
  // it is exactly the shape that made the trainer's address a 63-file problem
  // before it was centralised.
  const src = readFileSync(join(process.cwd(), "src/lib/ai/tier.ts"), "utf8");
  assert.match(src, /from\("client_app_settings"\)[\s\S]{0,80}select\("ai_tier"\)/);
  for (const name of ["gerard", "sharon", "gautreaux"]) {
    assert.ok(
      !new RegExp(name, "i").test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")),
      `the tier lookup names "${name}" in code — it must read the column, not a person`,
    );
  }
});
