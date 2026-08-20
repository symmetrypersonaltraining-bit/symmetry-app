// One calendar per trainer, and no trainer may touch another's rows.
//
// Stephanie became a trainer on 2026-08-20. Three things in the Google Calendar
// sync were load-bearing on "there is exactly one trainer", and each fails in a
// way that produces no error at all:
//
//   1. getValidAccessToken() with no argument read `LIMIT 1` off trainer_settings
//      with no ORDER BY — an arbitrary Google account. Sometimes the right
//      calendar, sometimes not, no way to tell from the outside.
//   2. gcal_get_clients() returned the WHOLE roster, so an event titled "Sarah"
//      on Dustin's calendar could match one of Stephanie's clients, and the
//      session would be billed by the wrong trainer.
//   3. gcal_reconcile_appointments()/-_payments() DELETE future rows that are
//      absent from the seen-event list. Trainer A's event list does not contain
//      trainer B's events. Unscoped and run per trainer, A's sync deletes B's
//      entire future schedule — silently, and the reconcile's own "more than
//      half the window" guard does not fire because from A's point of view the
//      deletion is legitimate.
//
// (3) is the one that eats data, so it is tested hardest. These are structural
// tests over the route source: the route is a 60-second server function that
// talks to Google, Supabase and four SECURITY DEFINER RPCs, with no seam to
// unit-test through, and a guard that is not tested is a guard that comes back
// out on the next refactor.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const ROUTE = read("src/app/api/gcal-sync/route.ts");
const GCAL = read("src/lib/gcal.ts");
const DISCONNECT = read("src/app/api/auth/google/disconnect/route.ts");
const SCHEDULE_ACTIONS = read("src/app/(app)/schedule/scheduleActions.ts");

/**
 * Source with comments removed.
 *
 * Every one of these files documents the bug it fixes IN PROSE, naming the very
 * call the assertion is looking for. Without this, "the bare call is gone"
 * matches the paragraph explaining why it went. That has decided a structural
 * assertion in this codebase five times; it does not get to be six.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// The stripper has to work, so it is tested before anything relies on it.
test("code() removes comments and keeps the code", () => {
  assert.equal(code("a // getValidAccessToken()\nb").trim().split("\n").join("|"), "a |b");
  assert.equal(code("/* getValidAccessToken() */x").trim(), "x");
  assert.match(code("const u = 'https://x/y' // note"), /https:\/\/x\/y/,
    "a URL's // is not a comment");
});

/** A function body, bounded at the next top-level declaration — never a slice. */
function fnBody(src: string, name: string): string {
  const i = src.indexOf(name);
  assert.ok(i > 0, name + " is gone");
  const after = i + name.length;
  const rest = src.slice(after);
  const end = rest.search(/\n(?:export )?(?:async )?function |\n(?:export )?type \w+ =/);
  return src.slice(i, end === -1 ? src.length : after + end);
}

// ─── 1. the token names a trainer ───────────────────────────────────────────

test("getValidAccessToken takes the trainer whose calendar it is", () => {
  const c = code(GCAL);
  assert.match(c, /export async function getValidAccessToken\(\s*userId\?: string/,
    "getValidAccessToken lost its userId parameter — every caller is back on a coin flip");
  assert.match(c, /rpc\('gcal_get_tokens',\s*\{\s*p_user_id: userId \?\? null/,
    "the userId is accepted but never passed to the RPC, which is worse than not accepting it");
});

test("the per-trainer sync asks for THAT trainer's token", () => {
  const body = code(fnBody(ROUTE, "async function syncOneCalendar"));
  assert.match(body, /getValidAccessToken\(trainer\.user_id\)/,
    "the sync fetches a token without naming the trainer — it will sync one calendar twice");
  assert.doesNotMatch(body, /getValidAccessToken\(\s*\)/,
    "a bare getValidAccessToken() is back inside the per-trainer body");
});

// ─── 2. a calendar only sees its own trainer's clients ──────────────────────

test("client lookup is scoped to the trainer being synced", () => {
  const body = code(fnBody(ROUTE, "async function syncOneCalendar"));
  assert.match(body, /rpc\('gcal_get_clients',\s*\{\s*p_trainer_id: trainer\.trainer_id/,
    "gcal_get_clients is called unscoped — one trainer's calendar can claim the other's clients by name");
});

test("a trainer with no clients is skipped, not fatal", () => {
  const body = code(fnBody(ROUTE, "async function syncOneCalendar"));
  assert.match(body, /if \(!clients\?\.length\) return emptyResult\(/,
    "an empty roster still fails the whole request — that is Stephanie's day one, and it would take Dustin's sync down with her");
});

// ─── 3. reconcile never reaches across trainers ─────────────────────────────
//
// The data-destroying one. Both reconciles delete; both must be scoped.

test("both reconciles are scoped to the trainer being synced", () => {
  const body = code(fnBody(ROUTE, "async function syncOneCalendar"));
  for (const rpc of ["gcal_reconcile_appointments", "gcal_reconcile_payments"]) {
    const i = body.indexOf("rpc('" + rpc + "'");
    assert.ok(i > 0, rpc + " is no longer called");
    // Bound the call at its closing `});` rather than a character count.
    const call = body.slice(i, i + body.slice(i).indexOf("});") + 3);
    assert.match(call, /p_trainer_id: trainer\.trainer_id/,
      rpc + " deletes across the whole table — run per trainer, that wipes the other trainer's future schedule");
    assert.match(call, /p_seen_ids/, rpc + " lost its seen-id list");
  }
});

// ─── 4. the whole-table reset runs once, outside the loop ───────────────────

test("gcal_clear_appointments is called outside the per-trainer loop", () => {
  const c = code(ROUTE);
  const calls = c.match(/rpc\('gcal_clear_appointments'\)/g) || [];
  assert.equal(calls.length, 1, "gcal_clear_appointments is called " + calls.length + " times; it empties the WHOLE table and must run exactly once");
  const inPost = code(fnBody(ROUTE, "export async function POST"));
  assert.match(inPost, /rpc\('gcal_clear_appointments'\)/,
    "the reset moved into the per-trainer body — trainer two would wipe what trainer one just wrote");
  const inSync = code(fnBody(ROUTE, "async function syncOneCalendar"));
  assert.doesNotMatch(inSync, /gcal_clear_appointments/,
    "the reset is inside syncOneCalendar, so it runs once per trainer");
});

// ─── 5. the loop actually loops, and one bad credential is not contagious ───

test("POST syncs every connected trainer, sequentially, and survives one failing", () => {
  const post = code(fnBody(ROUTE, "export async function POST"));
  assert.match(post, /rpc\('gcal_list_connected_trainers'\)/,
    "the route no longer enumerates trainers — it is single-tenant again");
  assert.match(post, /for \(const t of trainers\)[\s\S]{0,400}?syncOneCalendar\(/,
    "trainers are not iterated");
  assert.doesNotMatch(post, /Promise\.all\([\s\S]{0,120}?syncOneCalendar/,
    "calendars sync in parallel — each pass can write thousands of rows inside a 60s budget");
  const loop = post.slice(post.indexOf("for (const t of trainers)"));
  assert.match(loop.slice(0, loop.indexOf("}\n\n")), /try \{[\s\S]*?\} catch/,
    "one trainer's dead credential aborts the other's sync");
});

test("roster-wide recalcs run once, after every calendar has landed", () => {
  const post = code(fnBody(ROUTE, "export async function POST"));
  for (const rpc of ["sync_supervised_workouts_to_appointments", "recalc_pending_payment_reminders", "gcal_generate_payment_notifications"]) {
    const n = (post.match(new RegExp("rpc\\('" + rpc + "'", "g")) || []).length;
    assert.equal(n, 1, rpc + " is called " + n + " times in POST; it is roster-wide and must run once");
    assert.ok(post.indexOf("rpc('" + rpc + "'") > post.indexOf("for (const t of trainers)"),
      rpc + " runs before the calendars have synced, so it reads a half-written table");
  }
  const sync = code(fnBody(ROUTE, "async function syncOneCalendar"));
  assert.doesNotMatch(sync, /recalc_pending_payment_reminders/,
    "the billing recalc moved inside the per-trainer loop");
});

// ─── 6. the callers the button and the settings page read ───────────────────

test("top-level synced/payments totals survive the restructure", () => {
  const post = code(fnBody(ROUTE, "export async function POST"));
  assert.match(post, /\bsynced: sum\(/, "GcalSyncButton reads j.synced and would show 'Calendar synced' with no count");
  assert.match(post, /\bpayments: sum\(/, "the Settings 'Sync Now' alert reads j.payments");
  assert.match(post, /ok: true/, "GcalSyncButton treats a missing ok as a failure");
});

// ─── 7. disconnect revokes the caller's own grant ───────────────────────────

test("Disconnect revokes the tokens of whoever pressed it", () => {
  const c = code(DISCONNECT);
  assert.match(c, /rpc\('gcal_get_tokens',\s*\{\s*p_user_id: user\.id\s*\}\)/,
    "Disconnect reads an unqualified token row: Stephanie pressing it revokes DUSTIN's Google grant at Google, then clears her own empty row — his sync dead, the database still saying he is connected");
  // The read and the write must name the same person.
  assert.match(c, /\.eq\('user_id', user\.id\)/, "the row cleared is no longer the caller's");
});

// ─── 8. schedule actions edit the signed-in trainer's calendar ──────────────

test("schedule actions patch the calendar of the trainer using them", () => {
  const c = code(SCHEDULE_ACTIONS);
  assert.doesNotMatch(c, /getValidAccessToken\(\s*\)/,
    "a schedule action edits 'the trainer's' calendar unqualified — Stephanie moving her own session would patch an event id against Dustin's calendar");
  const calls = c.match(/getValidAccessToken\(await viewerCalendarUserId\(supabase\)\)/g) || [];
  assert.equal(calls.length, 3, "expected all 3 gcal actions to name the viewer, found " + calls.length);
});
