import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clearedPoolFor, isPoolGated, isDayInPool } from "../../src/lib/ai/workoutPool";

/**
 * THE CONTRAINDICATION GATE.
 *
 * This is the only test file in the repo where a failure means somebody could
 * get hurt, so it is worth being explicit about who and how.
 *
 *   GERARD, 71. 2018 motorcycle accident. Roughly 1.5 INCHES OF TIBIA MISSING,
 *   drop foot with almost no anterior tib activation, left hip and pelvis broken
 *   and surgically repaired, right rotator cuff repaired, major left-leg
 *   atrophy. Everything seated or supported, ZERO spinal loading, no impact.
 *
 *   SHARON. Bilateral mastectomy — limited shoulder ROM overhead and in
 *   push/pull. Trigeminal neuralgia medication causing DIZZINESS AND
 *   INSTABILITY. ZERO spinal loading, NO balance or unstable-surface work.
 *
 * They train together, unsupervised, in another state. Neither is tech savvy;
 * Dustin's whole reason for this feature is that they will talk to the app
 * instead of navigating it. So there is nobody in the room to notice a bad
 * suggestion, and no fallback screen they would go and find.
 *
 * Dustin's instruction, and the design it produces:
 *
 *   "A prompt can be talked out of a rule; a filtered candidate set cannot."
 *
 * The model is never HANDED a workout it may not offer. Not instructed — never
 * handed. Everything below tests that property rather than testing any wording.
 *
 * These run against the REAL database rows, not fixtures. A fixture would prove
 * the function filters a list; only the live pool proves the two people it was
 * written for are actually covered by it. They skip cleanly without credentials
 * so CI stays green, and the skip is loud rather than silent.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE = Boolean(URL_ && KEY);

const GERARD = "d970da5e-9c46-45c4-be9c-e27e1893b575";
const SHARON = "b726a885-c975-4266-80f7-860a401251c0";

async function db() {
  const { createClient } = await import("@supabase/supabase-js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient(URL_!, KEY!, { auth: { persistSession: false } }) as any;
}

// ── the property, tested against the source ────────────────────────────────
// These run everywhere, including without credentials, because the fail-closed
// behaviour is the part that must never regress quietly.

const SRC = readFileSync(join(process.cwd(), "src/lib/ai/workoutPool.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the pool query always filters by BOTH owner and cleared-flag", () => {
  // `swappable` alone reaches the shared library and the other clients' days —
  // and seven other clients have swappable days today. `client_owner_id` alone
  // reaches every day this person has ever been given, cleared or not. Either
  // one on its own is a hole, and neither is visibly wrong in a diff.
  assert.match(
    CODE,
    /\.eq\("client_owner_id", clientId\)\s*\.eq\("swappable", true\)/,
    "the pool query dropped one of its two filters",
  );
  assert.match(
    CODE,
    /\.eq\("id", dayId\)\s*\.eq\("client_owner_id", clientId\)\s*\.eq\("swappable", true\)/,
    "isDayInPool dropped a filter — a day id arriving from anywhere else could land",
  );
});

test("every failure path leaves a gated client GATED", () => {
  // The opposite default to lib/ai/tier.ts, and deliberately so. A tier lookup
  // that fails should fall to the cheap side; a GATE that fails must fall to
  // the safe side. An outage that quietly ungated Gerard could put a loaded
  // spinal movement in front of a man with a rebuilt pelvis.
  assert.match(CODE, /catch \{\s*return EMPTY_GATED;\s*\}/, "clearedPoolFor no longer fails closed");
  assert.match(CODE, /catch \{\s*\n?\s*return true;\s*\}/, "isPoolGated no longer fails closed on a thrown lookup");
  assert.match(CODE, /catch \{\s*return false;\s*\}/, "isDayInPool no longer fails closed");
  // Checked on the catch BODIES rather than on proximity: `if (!gated) return
  // UNGATED` legitimately sits right after a catch block, and a naive window
  // reads that correct line as the bug.
  const catchBodies = [...CODE.matchAll(/catch\s*(?:\([^)]*\))?\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);
  assert.ok(catchBodies.length >= 3, "the fail-closed catches have gone missing");
  for (const body of catchBodies) {
    assert.ok(
      !/return UNGATED/.test(body),
      "a catch block returns UNGATED — that is the one outcome this file exists to prevent",
    );
  }
});

test("the gate contains no prompt text, because a prompt can be argued with", () => {
  // If instructions ever appear in here it means somebody started enforcing a
  // contraindication by asking a model nicely, which is the exact thing the
  // spec rules out.
  for (const smell of ["never offer", "do not offer", "you must", "system:", "You are"]) {
    assert.ok(
      !new RegExp(smell, "i").test(CODE),
      `the gate contains prompt text ("${smell}") — safety here is a filter, not an instruction`,
    );
  }
});

// ── the real people, against the real rows ─────────────────────────────────

test("Gerard and Sharon are gated, and their pools are not empty", { skip: !LIVE }, async () => {
  const d = await db();
  for (const [who, id] of [["Gerard", GERARD], ["Sharon", SHARON]] as const) {
    assert.equal(await isPoolGated(d, id), true, `${who} is not gated`);
    const pool = await clearedPoolFor(d, id);
    assert.equal(pool.gated, true);
    assert.ok(pool.workouts.length > 0, `${who}'s cleared pool is EMPTY — the AI would have nothing to offer`);
    assert.ok(
      pool.exerciseNames.length > 0,
      `${who} has no cleared movement vocabulary — every in-workout swap would be refused`,
    );
  }
});

test("neither of them is ever offered the other's workouts", { skip: !LIVE }, async () => {
  // Their contraindications overlap ONLY on "no spinal loading". Gerard's
  // seated-everything session ignores Sharon's overhead limit; hers ignores his
  // hip and ankle. Cross-offering is its own way of getting someone hurt, not
  // an untidiness.
  const d = await db();
  const g = await clearedPoolFor(d, GERARD);
  const s = await clearedPoolFor(d, SHARON);
  const gIds = new Set(g.workouts.map((w) => w.dayId));
  const overlap = s.workouts.filter((w) => gIds.has(w.dayId));
  assert.deepEqual(overlap, [], "a day appears in both pools");

  for (const w of s.workouts) {
    assert.equal(await isDayInPool(d, GERARD, w.dayId), false, `Sharon's "${w.label}" is offerable to Gerard`);
  }
  for (const w of g.workouts) {
    assert.equal(await isDayInPool(d, SHARON, w.dayId), false, `Gerard's "${w.label}" is offerable to Sharon`);
  }
});

test("a day outside the pool can never be handed to them", { skip: !LIVE }, async () => {
  // The check that has to hold when a day id arrives from somewhere other than
  // the pool query: a stale client payload, a model echoing an id out of its
  // own context, a copy-paste between two people who train together and share
  // a phone.
  const d = await db();
  const { data } = await d
    .from("days")
    .select("id, label")
    .eq("client_owner_id", GERARD)
    .eq("swappable", false)
    .limit(3);
  const uncleared = (data as { id: string; label: string }[] | null) || [];
  assert.ok(uncleared.length > 0, "no uncleared day to test against — this assertion is not proving anything");
  for (const day of uncleared) {
    assert.equal(
      await isDayInPool(d, GERARD, day.id),
      false,
      `an UNCLEARED day ("${day.label}") passed the pool check for Gerard`,
    );
  }
});

test("the pool the AI sees has no duplicate sessions in it", { skip: !LIVE }, async () => {
  // Twice now the data has been built by a loop inserting one `days` row per
  // scheduled date instead of reusing one — 34 duplicates across these two on
  // 13 Aug, six copies of each session at the same microsecond.
  //
  // For these two that is not cosmetic. The whole feature is "few options,
  // plainly named"; offering Gerard seven identical Total Body & Carry sessions
  // is precisely the confusing screen it exists to prevent. So the de-dup lives
  // in the reader and does not depend on the data being clean, because the data
  // has already not been clean twice.
  const d = await db();
  for (const [who, id] of [["Gerard", GERARD], ["Sharon", SHARON]] as const) {
    const pool = await clearedPoolFor(d, id);
    const sigs = pool.workouts.map((w) => `${w.label}::${w.exercises.join("|")}`);
    assert.equal(
      new Set(sigs).size,
      sigs.length,
      `${who}'s pool contains duplicate sessions — he would be shown the same option more than once`,
    );
  }
});

test("an ungated client is completely unaffected", { skip: !LIVE }, async () => {
  // Seven other clients have swappable days. If the gate had keyed off "has a
  // pool" rather than off the client, this feature would have silently
  // restricted all of them — a regression shipped as a safety improvement.
  const d = await db();
  const { data } = await d
    .from("clients")
    .select("id, name")
    .not("id", "in", `(${GERARD},${SHARON})`)
    .is("archived_at", null)
    .limit(5);
  for (const c of ((data as { id: string; name: string }[] | null) || [])) {
    const pool = await clearedPoolFor(d, c.id);
    assert.equal(pool.gated, false, `${c.name} got gated without anyone asking for it`);
  }
});
