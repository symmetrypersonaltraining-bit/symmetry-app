import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A COUNTED ROW HAS TO LEAD SOMEWHERE, AND ITS ✕ HAS TO WORK.
 *
 * Dustin, 26 Aug: "programkung running out won't let me clear and routes to
 * client list, data check failing goes to client list."
 *
 * Three separate faults behind one sentence:
 *
 *   1. Every ✕ on Today's Admin had been a no-op since the day it shipped.
 *      admin_dismissals had ZERO rows in it. The client upserted with
 *      `onConflict: "trainer_id,row_key,subject_id"` while the unique index is
 *      on COALESCE(subject_id, ...) — an expression — so Postgres refused every
 *      call with 42P10 before it ever reached the conflict.
 *   2. "Programming running out" listed one client, linked that client's name
 *      to their programme, and put a button next to it going to the roster.
 *   3. "Data check failing" named the failing checks and the clients involved
 *      and then sent him to the roster, because the integrity checker had been
 *      writing results since 16 Aug with no page in the app that read them.
 *
 * The shared shape: the app knew exactly what was wrong and had nowhere to put
 * it. These tests keep each row's destination honest.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const ADMIN = code(read("src/components/TodaysAdmin.tsx"));

test("dismissing goes through the RPC, not an upsert that cannot match the index", () => {
  assert.match(ADMIN, /rpc\("dismiss_admin_row"/);
  assert.doesNotMatch(
    ADMIN,
    /onConflict: "trainer_id,row_key,subject_id"/,
    "the upsert is back — it has never once succeeded",
  );
});

test("a dismissal that did not save puts the row straight back", () => {
  // The catch was always right. It was reporting a write that could not happen.
  assert.match(ADMIN, /if \(error\) throw error;/);
  assert.match(ADMIN, /setRows\(keep \?\? null\)/);
});

test("no admin row sends him to the bare client roster with one subject", () => {
  // /clients is a legitimate destination only when the row genuinely concerns
  // the whole roster. A row that has already named ONE client and linked them
  // must not offer a second button going somewhere less useful.
  assert.match(ADMIN, /short\.length === 1[\s\S]{0,80}href: `\/clients\/\$\{short\[0\]\.id\}\/program`/);
});

test("the integrity row opens the checker's own page", () => {
  assert.match(ADMIN, /href: "\/settings\/data-health", cta: "Look"/);
});

test("that page exists, is trainer-gated, and reads the latest run only", () => {
  const PAGE = read("src/app/(app)/settings/data-health/page.tsx");
  assert.match(code(PAGE), /viewerIsTrainer/);
  assert.match(code(PAGE), /redirect\("\/home"\)/);
  assert.match(code(PAGE), /from\("integrity_checks"\)/);
  // Latest run only — the table keeps history and every run repeats the faults.
  assert.match(code(PAGE), /c\.ran_at === newest/);
  // The names inside detail are the actionable half, so they have to be drawn.
  assert.match(code(PAGE), /Array\.isArray\(c\.detail\)/);
  assert.match(code(PAGE), /href=\{`\/clients\/\$\{id\}`\}/);
});

// ── the billing screen he arrived at ─────────────────────────────────────────

const PAY = code(read("src/app/(app)/payments/PaymentsClient.tsx"));

test("the Overdue count is not computed from a tab that excludes overdue", () => {
  // The dashboard said 2 past due; this header said 0. Both read the same rows.
  // The Upcoming tab kept `c.dueDate >= today`, so counting overdue rows out of
  // the filtered set asked how many of the not-late rows are late.
  assert.match(PAY, /const inBook = localClients;/);
  assert.match(PAY, /const overdueCount = inBook\.filter/);
  assert.match(PAY, /const pendingCount = inBook\.filter/);
  assert.match(PAY, /const totalOwed = inBook/);
  assert.doesNotMatch(PAY, /const overdueCount = filtered\.filter/);
});

test("a late payment stays on the default tab, and sorts to the top of it", () => {
  assert.match(PAY, /return c\.dueDate <= thirtyStr;/, "the >= today floor is back and overdue rows are hidden again");
  assert.match(PAY, /const la = a\.dueDate && daysUntil\(a\.dueDate, today\) < 0/);
  assert.match(PAY, /if \(la !== lb\) return la - lb;/);
});

test("the billing screen no longer downloads two years of bookings to ignore them", () => {
  // 3,736 rows in four sequential round trips, on a phone, before the page drew.
  // The window had a floor and no ceiling, so every booking to Aug 2028 came
  // down the wire — and none of them can be inside a cycle this screen computes.
  const RE = code(read("src/components/ReminderEditor.tsx"));
  assert.match(RE, /\.lte\("scheduled_at", new Date\(Date\.now\(\) \+ APPT_HORIZON_DAYS \* 86400000\)/);
  // Derived from the reminder horizon rather than a second hand-written number,
  // so raising one cannot silently invalidate the other.
  assert.match(RE, /const APPT_HORIZON_DAYS = REMINDER_HORIZON_DAYS;/);
  assert.match(RE, /const REMINDER_HORIZON_DAYS = 45;/);
  // Still paged. A bound is not a guarantee; the roster grows.
  assert.match(RE, /fetchAllRows<any>\(/);
});
