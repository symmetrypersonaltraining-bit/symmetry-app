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

/**
 * The last migration that DEFINES `needle` — creates the function or the policy
 * of that name. Later files win.
 *
 * This used to be a plain substring match, and 22 Aug is what that costs: the
 * payment-column revocation explains itself in a header comment that names
 * update_my_trainer_profile() as where writes still go, and that comment made
 * it the "latest" migration for the rule, so three assertions about a function
 * it does not contain failed at once. A migration mentioning a thing is not a
 * migration changing it.
 *
 * Definitions are matched first; the mention is kept as a fallback so a needle
 * that names something other than a function or policy (a column, a constraint)
 * still resolves.
 */
function latest(needle: string): string {
  const defines = new RegExp(
    "(create\\s+(or\\s+replace\\s+)?function\\s+(public\\.)?" + needle +
    "\\b|create\\s+policy\\s+\"?" + needle + "\\b)",
    "i",
  );
  let def = "";
  let mention = "";
  for (const sql of ALL_SQL) {
    if (defines.test(sql)) def = sql;
    if (sql.includes(needle)) mention = sql;
  }
  const out = def || mention;
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

  it("the library is per trainer, but nobody starts empty", () => {
    // ── This assertion was INVERTED the same evening ────────────────────────
    //
    // It first said the library must stay shared, because that was the choice
    // at 8pm: "shared library, private programmes". An hour later Dustin
    // changed it: "they need to have their own copy of the library where they
    // can do what they want with it but it should not effect any other
    // trainers." So the rule this guards is the newer one.
    //
    // COPY-ON-WRITE is what makes both halves of that sentence true at once —
    // their own copy to do anything with, AND 843 movements on day one. A hard
    // clone would satisfy the first half and break the second.
    // Anchored on the DEFINITION, not the name. A later migration mentions
    // fork_exercise_for_me in a comment explaining why it does not call it,
    // and latest() takes the last file that matches — so a looser anchor reads
    // the wrong migration and fails for a reason that has nothing to do with
    // the rule.
    const lib = latest("create or replace function public.fork_exercise_for_me");
    assert.match(lib, /alter table public\.exercises[\s\S]{0,200}owner_trainer_id/i,
      "a movement has to know whose library it is in");
    assert.match(lib, /forked_from_id/,
      "a private copy has to remember the house movement it overrides, or the library shows both");
    assert.match(lib, /create table if not exists public\.exercise_hidden/i,
      "removing a movement must be recorded, not deleted — another trainer's programmes point at that row");

    // The fork must repoint ONLY the forking trainer's own programmes.
    const fork = lib.slice(lib.indexOf("function public.fork_exercise_for_me"));
    assert.match(fork, /pr\.owner_trainer_id = v_me/,
      "the fork repoints prescriptions without checking who owns the programme — it would rewrite " +
      "a house template, or another trainer's work, to point at this trainer's private copy");
  });

  it("the name constraint allows two trainers the same movement", () => {
    // The bug that would have hit every trainer on their first edit: a global
    // UNIQUE(name) means forking "Barbell Back Squat" collides with the house
    // row of the same name.
    const lib = latest("exercises_name_per_owner");
    assert.match(lib, /drop constraint if exists exercises_name_key/i);
    assert.match(lib, /\(name, owner_trainer_id\) nulls not distinct/i,
      "NULLS NOT DISTINCT is required — the house library is owner NULL, and without it the " +
      "house library loses its own uniqueness");
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

describe("each trainer's clients get their own room", () => {
  const sql = latest("my_group_trainer_id");

  it("nothing is moved out of the owner's room", () => {
    // Dustin, 21 Aug: "my clients should not be effected by splitting the group
    // chat. my clients continue to see my app's group chat." All 168 existing
    // messages and 4 challenges are stamped to him — his clients see the same
    // room tomorrow. A migration that reassigned any of them would be wrong.
    assert.match(
      sql,
      /update public\.messages[\s\S]{0,200}where role = 'owner'[\s\S]{0,120}where is_group and group_trainer_id is null/i,
      "existing group history must be stamped to the owner and to nobody else",
    );
  });

  it("the room is closed to everyone outside it", () => {
    assert.match(
      sql,
      /drop policy if exists "Anyone reads group messages"/i,
      "USING (is_group = true) let ANY signed-in person read the room, including another " +
        "trainer's client",
    );
    assert.match(sql, /group_trainer_id = public\.my_group_trainer_id\(\)/);
  });

  it("a client is placed in their trainer's room, not their own", () => {
    assert.match(
      sql,
      /coalesce\(\s*public\.my_trainer_id\(\),[\s\S]{0,160}c\.trainer_id/,
      "a client has no trainer id of their own — they belong to their trainer's room",
    );
  });

  it("a post cannot be aimed at somebody else's room", () => {
    assert.match(sql, /create trigger trg_stamp_group_message/i,
      "without the stamp, a client of one trainer could post into another trainer's chat");
  });
});
