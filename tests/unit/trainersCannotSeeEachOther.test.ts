// ============================================================================
// One trainer's business is not another trainer's business.
//
// Dustin, 21 Aug, before the app goes to a test group of four:
//
//   "we need to set it up so that trainers cannot see anyone else's
//    information. So nobody should be able to see other trainers' Venmo tag,
//    or anything, period."
//
// and, in the same breath, the other half of it:
//
//   "they should also be able to fill out assessment pages, add clients etc...
//    they are testing the app, they need full functionality just like i have to
//    manage their own clients and all their data."
//
// So this is isolation WITHOUT a reduced role. Both halves are guarded here,
// because it is easy to satisfy one by breaking the other.
//
// ── What was actually open ────────────────────────────────────────────────
//
// The client data was already walled correctly (every client table checks
// trainer_can_see_client). What was not:
//
//   trainers               USING (is_trainer())  — every trainer read every
//                          trainer's name, email, phone, Venmo, Zelle, Cash App
//   programs + 5 children  USING (is_trainer()) FOR ALL — not just readable:
//                          any trainer could EDIT or DELETE another trainer's
//                          client programming
//   app_flags              USING (is_trainer()) FOR ALL — any trainer could
//                          flip a switch that changes the app for everybody
//   gcal_sync_runs         every trainer's calendar sync activity
//   integrity_checks       detail names other trainers' clients
//
// And the thing blocking full functionality:
//
//   client_assessments     CASE WHEN client_id IS NULL THEN is_owner()
//                          — an assessment for a walk-in has no client row yet,
//                          so only Dustin could run one. Every other trainer was
//                          locked out of the front door of the intake flow.
//
// Verified against production when it shipped, as a trainer who is nobody's
// client: 1 trainer row, 0 Venmo tags, 0 clients, 0 metrics, 0 workout logs,
// 0 of Dustin's programmes, 0 integrity rows, 0 sync runs — and 843 exercises,
// because the movement library is deliberately shared.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "supabase/migrations");

const ALL_SQL = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
  .map((f) => fs.readFileSync(path.join(DIR, f), "utf8"));

/** The last migration text that mentions `needle`. Later files win. */
function latest(needle: string): string {
  let out = "";
  for (const sql of ALL_SQL) if (sql.includes(needle)) out = sql;
  assert.ok(out, `no migration mentions ${needle} — the rule is not recorded anywhere`);
  return out;
}

describe("a trainer sees only their own row", () => {
  const sql = latest("trainer_reads_own_row");

  it("the blanket read is dropped", () => {
    assert.match(
      sql,
      /drop policy if exists "trainers_select_trainer" on public\.trainers/i,
      "USING (is_trainer()) on trainers means every trainer reads every trainer's payment handles",
    );
  });

  it("what replaces it is scoped to the caller", () => {
    assert.match(sql, /create policy "trainer_reads_own_row"[\s\S]{0,200}auth_user_id = auth\.uid\(\)/i);
    assert.doesNotMatch(
      sql.slice(sql.indexOf('create policy "trainer_reads_own_row"'), sql.indexOf("owner_reads_all_trainers")),
      /using \(public\.is_trainer\(\)\)/i,
      "the replacement is as wide as what it replaced",
    );
  });

  it("a client can still see who their trainer is", () => {
    // Not dropped anywhere — a client has to know where to send money.
    const dropped = ALL_SQL.some((s) => /drop policy[^\n]*client_reads_own_trainer/i.test(s));
    assert.equal(dropped, false, "clients lost the ability to see their own trainer's payment details");
  });
});

describe("programmes are private, the library is shared", () => {
  // Anchored on the OWNERSHIP migration specifically. `latest()` takes the last
  // file mentioning a name, and the child-policy migration mentions
  // trainer_can_use_program on every line — so a looser anchor reads the wrong
  // file and passes for the wrong reason.
  const sql = latest("stamp_program_owner");

  it("a programme knows who owns it", () => {
    assert.match(sql, /alter table public\.programs\s+add column if not exists owner_trainer_id/i);
    assert.match(sql, /create trigger trg_stamp_program_owner/i, "new programmes must stamp their owner automatically");
  });

  it("reading and editing are different questions", () => {
    // A house template (owner null) is usable by everyone and editable by the
    // owner alone — otherwise the first trainer to tweak a corrective track
    // rewrites it for the whole gym.
    assert.match(sql, /trainer_can_use_program[\s\S]{0,400}owner_trainer_id is null/i,
      "house templates must stay readable to every trainer");
    const edit = sql.slice(sql.indexOf("function public.trainer_can_edit_program"));
    assert.doesNotMatch(edit.slice(0, 500), /owner_trainer_id is null/i,
      "trainer_can_edit_program lets a trainer change a house template");
  });

  it("every child table drops its blanket policy", () => {
    const childSql = latest("trainer_reads_pe");
    for (const old of ["trainer_all_phases", "trainer_all_days", "trainer_all_sections", "trainer_all_pe"]) {
      assert.match(
        childSql,
        new RegExp(`drop policy if exists "${old}"`, "i"),
        `${old} still grants every trainer full access to that table`,
      );
    }
  });

  it("the shared library is left alone on purpose", () => {
    // exercises / equipment / foods keep USING (is_trainer()). Dustin chose
    // "shared library, private programmes" so a new trainer inherits ~843
    // movements and the video work rather than starting on an empty screen.
    const anyDrop = ALL_SQL.some((s) => /drop policy[^\n]*trainer_all_exercises/i.test(s));
    assert.equal(anyDrop, false, "the shared exercise library was split — that was not the decision");
  });
});

describe("every trainer keeps full functionality", () => {
  const sql = latest("stamp_assessment_trainer");

  it("a prospect assessment is no longer owner-only", () => {
    assert.match(
      sql,
      /created_by_trainer_id = public\.my_trainer_id\(\)/,
      "an assessment with no client yet must belong to whoever ran it, not to the owner",
    );
    const policy = sql.slice(sql.indexOf('create policy "trainer_scoped_assessments"'));
    assert.ok(policy.length > 0, "the assessment policy is gone");
    assert.doesNotMatch(
      policy,
      /else public\.is_owner\(\)\s*$/m,
      "the NULL-client branch is owner-only again — every other trainer is locked out of intake",
    );
  });

  it("and it is stamped for the service-role paths too", () => {
    assert.match(
      sql,
      /coalesce\(\s*public\.my_trainer_id\(\),/,
      "routes that run as the service role have no auth.uid(); without a fallback the " +
        "assessment lands with no owner and disappears from the trainer who ran it",
    );
  });
});

describe("global switches belong to the owner", () => {
  const sql = latest("owner_writes_app_flags");

  it("only the owner writes them", () => {
    assert.match(sql, /drop policy if exists "trainer_write_app_flags"/i);
    assert.match(sql, /create policy "owner_writes_app_flags"[\s\S]{0,160}is_owner\(\)/i);
  });

  it("but every trainer still reads them", () => {
    // The tutorial gate and the coach gate are read client-side. Take the read
    // away and both features vanish for everyone but the owner.
    assert.match(sql, /create policy "trainers_read_app_flags"[\s\S]{0,160}is_trainer\(\)/i);
  });
});

describe("a trainer can edit their own profile, and only their own", () => {
  const sql = latest("update_my_trainer_profile");

  it("the write goes through a function, not a table policy", () => {
    // RLS is row-level: a policy allowing a trainer to update their own row
    // allows them to update `role` and make themselves the owner.
    assert.match(sql, /create or replace function public\.update_my_trainer_profile/i);
    assert.match(sql, /security definer/i);
    const noUpdatePolicy = ALL_SQL.every(
      (s) => !/create policy[^\n]*on public\.trainers[\s\S]{0,80}for update/i.test(s),
    );
    assert.ok(noUpdatePolicy, "an UPDATE policy on trainers lets a trainer rewrite their own role");
  });

  it("it cannot touch identity or authority", () => {
    const body = sql.slice(sql.indexOf("update public.trainers t"), sql.indexOf("return v_row"));
    for (const col of ["role", "email", "auth_user_id", "active"]) {
      assert.doesNotMatch(
        body,
        new RegExp(`\\b${col}\\s*=`, "i"),
        `update_my_trainer_profile writes ${col} — that column decides who someone is or what they can see`,
      );
    }
  });

  it("it writes the caller's row, never an id it was handed", () => {
    assert.match(
      sql,
      /v_id uuid := public\.my_trainer_id\(\)/,
      "the target row must come from the session, not from an argument",
    );
  });

  it("and the UI exists", () => {
    const card = path.join(ROOT, "src/components/TrainerProfileCard.tsx");
    assert.ok(fs.existsSync(card), "no editor — the RPC is unreachable and nothing changed for a trainer");
    const settings = fs.readFileSync(path.join(ROOT, "src/app/(app)/settings/SettingsClient.tsx"), "utf8");
    assert.match(settings, /<TrainerProfileCard \/>/, "the editor is not mounted in Settings");
  });
});
