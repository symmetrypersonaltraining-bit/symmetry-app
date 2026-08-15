// Guard: the trainer calendar's writes use values the database accepts, times
// that mean what they say, and never report success they did not get.
//
// Three separate faults, found 15 Aug, all in the same file:
//
// 1. THE SINGLE-SESSION CANCEL HAD NEVER WORKED. `appointments_status_check`
//    accepts scheduled / completed / cancelled_client / cancelled_trainer /
//    no_show. The button wrote 'cancelled'. Confirmed against the live database
//    by running the update inside a rolled-back DO block — 23514, every time —
//    and `select count(*) from appointments where status='cancelled'` returns 0.
//    The error was never read, so the code went on to recolour the Google
//    Calendar event orange and close the sheet. Dustin cancelled a session,
//    watched Google Calendar agree with him, and the appointment stayed
//    `scheduled`: still counted, still reminding, still in today's list.
//
//    The BULK cancel sixty lines below had exactly this bug and was fixed. This
//    one was not. Two buttons, same file, same defect, one of them patched.
//
//    Why the existing scanner missed it: dbCheckConstraintValues.test.ts
//    follows a bare identifier back to its `const`. Here `status` is a FUNCTION
//    PARAMETER and the literal lives at the call site — structurally the same
//    hole that hid the sixth of the original six dead writes.
//
// 2. NAIVE TIMESTAMPS INTO timestamptz. This database's connection timezone is
//    UTC (`show timezone` → UTC), so "2026-08-15T09:00:00" with no offset is
//    stored as 09:00 UTC = 04:00 Central. A 9am session booked for four in the
//    morning. Latent, not live: all 4,628 appointments came from the Google
//    Calendar sync, which sends proper offsets, so nothing has been booked
//    through this modal yet. A trap under the button rather than a mess.
//
// 3. UNCHECKED INSERTS IN A LOOP. A recurring series inserted week by week with
//    no error read, so one failure part-way through still closed the sheet as
//    if the whole series had been booked.
//
// MUTATION-TESTED: reverting each of the three fails its test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/app/(app)/home/TrainerCalendar.tsx"), "utf8");
// Comments in this file quote the bad values while explaining them, and a
// source scan that matches prose measures nothing.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Values `appointments_status_check` actually accepts, from the live database. */
const LEGAL_STATUS = new Set([
  "scheduled",
  "completed",
  "cancelled_client",
  "cancelled_trainer",
  "no_show",
]);

test("no appointments write sends a status the CHECK constraint refuses", () => {
  // Every string literal assigned to `status` in an update/insert payload.
  const assigned = [...CODE.matchAll(/status:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const illegal = assigned.filter((s) => !LEGAL_STATUS.has(s));
  assert.deepEqual(
    illegal,
    [],
    `these statuses are written but the database refuses them: ${illegal.join(", ")}. ` +
      `Legal values: ${[...LEGAL_STATUS].join(", ")}.`
  );
});

test("the single-session cancel maps to a legal value before writing", () => {
  assert.match(
    CODE,
    /status === "cancelled"\s*\?\s*"cancelled_client"/,
    "the single-session cancel no longer translates 'cancelled' to a value the database accepts"
  );
});

test("the single-session status update reads its error and stops on failure", () => {
  // The whole reason this went unnoticed for months. If the error is not read,
  // a refused write still recolours Google Calendar and closes the sheet.
  const fn = CODE.slice(CODE.indexOf("async function updateStatus"));
  const body = fn.slice(0, fn.indexOf("\n  }"));
  assert.match(body, /const \{ error: \w+ \} = await supabase/, "the status update no longer destructures its error");
  assert.match(body, /if \(\w*[Ee]rr\w*\)\s*\{/, "the error is read but never acted on");
  assert.ok(
    body.indexOf("setGCalEventColor") > body.indexOf("if (statusErr)"),
    "Google Calendar is recoloured before the database write is known to have succeeded"
  );
});

test("appointment times are written with a Central offset, never naive", () => {
  assert.ok(
    !/scheduled_at:\s*`\$\{[^}]+\}T\$\{[^}]+\}:00`/.test(CODE),
    "scheduled_at is being built as a naive timestamp again — timestamptz + a UTC connection means it lands 5-6 hours early"
  );
  assert.match(CODE, /scheduled_at:\s*centralIso\(/, "scheduled_at no longer goes through centralIso");
  assert.match(CODE, /ends_at:\s*centralIso\(/, "ends_at no longer goes through centralIso");
});

test("booking a session checks the insert instead of assuming it worked", () => {
  assert.ok(
    !/for \(const row of rows\)\s*\{\s*await supabase\.from\("appointments"\)\.insert\(row\);/.test(CODE),
    "back to a loop of unchecked inserts — one failed week in a recurring series closes the sheet as if all of them booked"
  );
  assert.match(
    CODE,
    /const \{ error: \w+ \} = await supabase\.from\("appointments"\)\.insert\(rows\)/,
    "the appointment insert no longer reads its error"
  );
});
