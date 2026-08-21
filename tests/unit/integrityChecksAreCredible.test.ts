// ============================================================================
// The integrity checker has to be worth reading.
//
// It ran twice a day from 16 Aug and NOTHING in the app displayed it, so its
// output was only ever seen by someone running SQL by hand. In that time:
//
//   * anon_writable_policies sat critical on a FALSE POSITIVE. It matched
//     `qual = 'true'` — the USING expression, which a SELECT policy has too —
//     so food_catalog_read, a public read of a public food catalogue, was
//     reported as an anon WRITE. The one check that could ever mean "somebody
//     can change data they do not own" was permanently, meaninglessly red.
//
//   * scheduled_day_outside_assigned_program sat critical at 1,072 with no
//     date filter, comparing workouts back to July 2024 against the client's
//     CURRENTLY active assignment. Finishing a programme turned that client's
//     entire history critical. 772 of the 1,072 were in the past.
//
//   * supervised_workout_no_appointment sat critical at 371 describing a link
//     the mover stopped needing on 21 Aug, and counting online-only clients
//     who are excluded from calendar moves BY DESIGN and can never clear.
//
// Three permanent reds is not a monitor, it is wallpaper. These assert the
// shape that keeps a critical meaning something.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "supabase/migrations");

/** The last migration to define run_integrity_checks, comments stripped. */
function checker(): string {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  let body = "";
  for (const f of files) {
    const sql = fs.readFileSync(path.join(DIR, f), "utf8");
    const i = sql.search(/create\s+or\s+replace\s+function\s+public\.run_integrity_checks\b/i);
    if (i >= 0) body = sql.slice(i).replace(/--.*$/gm, "");
  }
  assert.ok(body, "run_integrity_checks lives only in the database — it must ship as a migration");
  return body;
}

/** The block of the checker that produces one named check. */
function check(name: string): string {
  const body = checker();
  const i = body.indexOf(`'${name}'`);
  assert.ok(i > 0, `the ${name} check is gone`);
  const next = body.indexOf("union all", i);
  return body.slice(i, next > 0 ? next : body.length);
}

describe("anon_writable_policies means what its name says", () => {
  it("tests the command, not the USING expression", () => {
    const block = check("anon_writable_policies");
    assert.match(
      block,
      /cmd in \('INSERT','UPDATE','DELETE','ALL'\)/,
      "it must filter on the policy COMMAND — that is what decides whether a policy can write",
    );
    assert.doesNotMatch(
      block,
      /qual\s*=\s*'true'/,
      "matching qual='true' catches every public READ policy in the schema. That is the false " +
        "positive that made this check meaningless for weeks.",
    );
  });
});

describe("a critical is scoped to something that can still be changed", () => {
  it("the outside-programme check only looks forward", () => {
    const block = check("scheduled_day_outside_assigned_program");
    assert.match(
      block,
      /sw\.scheduled_date >= v_today_ct/,
      "without a date filter this compares years of finished workouts against the CURRENT " +
        "assignment, so completing a programme reports the client's whole history as critical",
    );
    assert.match(block, /c\.archived_at is null/, "archived clients cannot be acted on");
    assert.match(
      block,
      /jsonb_agg\(distinct jsonb_build_object\('client',c\.name\)\)/,
      "it must name the clients — a bare count is not something anyone can act on",
    );
  });
});

describe("the online-only wall reaches the checker too", () => {
  // Eleven clients whose workouts must never follow the calendar. Counting
  // them as faults produces a number that can never reach zero.
  for (const name of ["supervised_workout_no_appointment", "appointment_no_supervised_workout"]) {
    it(`${name} skips online-only clients`, () => {
      assert.match(
        check(name),
        /not c\.online_only/,
        "an online-only client has no calendar link by design and can never clear this",
      );
    });
  }

  it("a missing appointment link is a warn, not a critical", () => {
    assert.match(
      check("supervised_workout_no_appointment"),
      /'warn'/,
      "the mover pairs by client and week now, so the stored link is provenance rather than " +
        "a thing anything depends on",
    );
  });
});

describe("somebody can actually see the result", () => {
  const all = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(DIR, f), "utf8")).join("\n");
  const admin = fs.readFileSync(path.join(ROOT, "src/components/TodaysAdmin.tsx"), "utf8");

  it("trainers can read the table", () => {
    assert.match(
      all,
      /create policy[\s\S]{0,120}on public\.integrity_checks[\s\S]{0,120}for select/i,
      "integrity_checks has RLS on; with no policy every browser read returns empty and the " +
        "dashboard reports a healthy system it cannot see",
    );
  });

  it("the dashboard reads it", () => {
    assert.match(
      admin,
      /from\("integrity_checks"\)/,
      "nothing displays the checker. That is how a critical went unseen from 16 Aug.",
    );
    assert.match(
      admin,
      /severity === "critical"/,
      "warns are context for someone already looking; only a critical earns a row here",
    );
    assert.match(
      admin,
      /c\.ran_at === newest/,
      "the table keeps history — without taking the latest run only, one fault is reported once " +
        "per run forever",
    );
  });
});
