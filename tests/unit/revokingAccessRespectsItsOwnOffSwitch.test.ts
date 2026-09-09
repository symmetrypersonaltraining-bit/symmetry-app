import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runRevokePass, type Outcome } from "../../src/app/api/cron/revoke-access/route.ts";

/**
 * THE JOB THAT TAKES THE APP AWAY, AND THE SWITCH THAT STOPS IT.
 *
 * Dustin, 2026-09-09, specifying this job: "Check the enabled flag at the TOP
 * of the job and exit if off. The nudge job doesn't do this and has been
 * messaging me nightly for weeks after I turned it off — same mistake, don't
 * repeat it."
 *
 * The nudge job's flag gates DELIVERY, not whether the job RUNS. So with nudges
 * off it still woke every night, still called the model, and still posted a
 * preview into his own inbox — eleven consecutive nights after he set the flag
 * false, and by his count he had turned it off about ten times. From where he
 * sits, that is a broken switch.
 *
 * This file is what stops the same shape appearing in a job whose whole purpose
 * is cutting real people off from the app.
 */

const ROUTE = join(process.cwd(), "src/app/api/cron/revoke-access/route.ts");
// A source-reading test cannot tell code from comments, and this file's own
// prose discusses the nudge job at length. Strip comments or the explanation
// satisfies the assertion.
const CODE = readFileSync(ROUTE, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("the flag is read BEFORE any work is done", () => {
  const flagAt = CODE.indexOf("readFlag(db,");
  const workAt = CODE.indexOf("runRevokePass(db,");
  assert.ok(flagAt > -1, "the job must read a flag at all");
  assert.ok(workAt > -1, "the job must call the pass");
  assert.ok(flagAt < workAt, "the flag has to be read before the work, not after it — this is the nudge bug");
});

test("a flag that is off returns before the pass is ever called", () => {
  const flagAt = CODE.indexOf("readFlag(db,");
  const workAt = CODE.indexOf("runRevokePass(db,");
  const between = CODE.slice(flagAt, workAt);
  assert.match(between, /if \(!live[^)]*\)/, "there must be a guard on the flag");
  assert.match(between, /return NextResponse\.json\(\{ ran: false/, "and that guard must RETURN, not just skip the send");
});

test("it is its own flag, not somebody else's", () => {
  assert.match(CODE, /"access_revoke_live"/);
  assert.doesNotMatch(CODE, /nudges_live|coachbot_live|birthday_bot_live/,
    "reusing another job's switch means his 'off' turns off the wrong thing");
});

test("nothing is written or sent before the flag is checked", () => {
  // Scoped to the HANDLER, because runRevokePass is defined above it and its
  // writes are therefore textually earlier while executing strictly later. The
  // first cut of this test read the whole file and failed on that, which is a
  // fair reminder that source order is not execution order.
  const handler = CODE.slice(CODE.indexOf("async function handle("), CODE.indexOf("export async function GET"));
  const flagAt = handler.indexOf("readFlag(db,");
  assert.ok(flagAt > -1, "the handler is where the flag is read");
  const before = handler.slice(0, flagAt);
  // The door (isCronRequest) is a header check and does no work. Anything that
  // touches a table, an auth user or a message must come after the flag.
  assert.doesNotMatch(before, /\.update\(|\.insert\(|updateUserById|from\("messages"\)|runRevokePass\(/,
    "no write, no ban, no message and no pass may happen before the off switch is read");
});

// ── What the pass actually does, on a fake database ────────────────────────

interface FakeCall { table: string; op: string; payload?: unknown; id?: string }

function fakeDb(clients: unknown[], paid: unknown[], opts: { banFails?: boolean } = {}) {
  const calls: FakeCall[] = [];
  const bans: string[] = [];

  const clientsQuery = {
    select: () => clientsQuery,
    not: () => clientsQuery,
    is: () => Promise.resolve({ data: clients, error: null }),
    eq: (_c: string, id: string) => {
      calls.push({ table: "clients", op: "update", id });
      return Promise.resolve({ error: null });
    },
    update: (payload: unknown) => {
      calls.push({ table: "clients", op: "update-payload", payload });
      return clientsQuery;
    },
  };
  const paidQuery = {
    select: () => paidQuery,
    eq: () => paidQuery,
    in: () => Promise.resolve({ data: paid, error: null }),
  };

  const db = {
    from: (t: string) => (t === "clients" ? clientsQuery : paidQuery),
    auth: {
      admin: {
        updateUserById: (uid: string, attrs: { ban_duration?: string }) => {
          if (opts.banFails) return Promise.resolve({ error: { message: "auth is down" } });
          bans.push(`${uid}:${attrs.ban_duration}`);
          return Promise.resolve({ error: null });
        },
      },
    },
  };
  // The pass is typed against the real admin client; the fake supplies exactly
  // the surface it uses, and the cast is confined to this test helper.
  return { db: db as unknown as Parameters<typeof runRevokePass>[0], calls, bans };
}

const ARCHIVED = "2026-08-31T11:40:00.139022+00:00";

function outcomeFor(outcomes: Outcome[], name: string): Outcome {
  const found = outcomes.find((o) => o.name === name);
  assert.ok(found, `expected an outcome for ${name}`);
  return found;
}

test("someone past their thirty days is revoked and banned", async () => {
  const { db, bans, calls } = fakeDb(
    [{ id: "c1", name: "Past Due", archived_at: ARCHIVED, auth_user_id: "u1", access_override_until: null }],
    [{ client_id: "c1", due_date: "2026-08-01" }],
  );
  const { outcomes } = await runRevokePass(db, { today: "2026-09-09" });
  assert.equal(outcomeFor(outcomes, "Past Due").action, "revoked");
  assert.deepEqual(bans, ["u1:876000h"], "the auth user is banned, which is the real gate");
  assert.ok(calls.some((c) => c.op === "update-payload"), "and access_revoked_at is written");
});

test("his override keeps someone in, and Bobbie is the live case", async () => {
  const { db, bans } = fakeDb(
    [{ id: "c1", name: "Bobbie Page", archived_at: ARCHIVED, auth_user_id: "u1", access_override_until: "2026-10-01" }],
    [{ client_id: "c1", due_date: "2026-08-01" }],
  );
  const { outcomes } = await runRevokePass(db, { today: "2026-09-09" });
  assert.equal(outcomeFor(outcomes, "Bobbie Page").action, "kept-override");
  assert.deepEqual(bans, [], "nobody under an override is ever banned");
});

test("someone still inside their thirty days is left alone", async () => {
  const { db, bans, calls } = fakeDb(
    [{ id: "c1", name: "Recent", archived_at: "2026-09-01T12:00:00+00:00", auth_user_id: "u1", access_override_until: null }],
    [{ client_id: "c1", due_date: "2026-09-01" }],
  );
  const { outcomes } = await runRevokePass(db, { today: "2026-09-09" });
  assert.equal(outcomeFor(outcomes, "Recent").action, "kept");
  assert.deepEqual(bans, []);
  assert.deepEqual(calls.filter((c) => c.op === "update-payload"), []);
});

test("a dry run writes nothing and bans nobody", async () => {
  const { db, bans, calls } = fakeDb(
    [{ id: "c1", name: "Past Due", archived_at: ARCHIVED, auth_user_id: "u1", access_override_until: null }],
    [{ client_id: "c1", due_date: "2026-08-01" }],
  );
  const { outcomes } = await runRevokePass(db, { today: "2026-09-09", dryRun: true });
  assert.equal(outcomeFor(outcomes, "Past Due").action, "revoked", "it still says what it WOULD do");
  assert.deepEqual(bans, [], "but bans nobody");
  assert.deepEqual(calls.filter((c) => c.op === "update-payload"), [], "and writes nothing");
});

test("a failed ban does NOT write the column", async () => {
  // The column is what the app reads; the ban is what actually stops a sign-in.
  // Writing the column while the ban failed leaves a client the app believes is
  // revoked and who can still get a session — the same gap as archived_at,
  // which is the whole reason this rule exists.
  const { db, calls } = fakeDb(
    [{ id: "c1", name: "Past Due", archived_at: ARCHIVED, auth_user_id: "u1", access_override_until: null }],
    [{ client_id: "c1", due_date: "2026-08-01" }],
    { banFails: true },
  );
  const { outcomes } = await runRevokePass(db, { today: "2026-09-09" });
  assert.equal(outcomeFor(outcomes, "Past Due").action, "ban-failed");
  assert.deepEqual(calls.filter((c) => c.op === "update-payload"), [],
    "the row must not say revoked when the ban did not take");
});

test("a client with no login is revoked without a ban that would throw", async () => {
  // Brooke Reynolds is exactly this: archived, past her date, auth_user_id null.
  const { db, bans } = fakeDb(
    [{ id: "c1", name: "Brooke Reynolds", archived_at: "2026-08-01T00:23:27+00:00", auth_user_id: null, access_override_until: null }],
    [],
  );
  const { outcomes } = await runRevokePass(db, { today: "2026-09-09" });
  assert.equal(outcomeFor(outcomes, "Brooke Reynolds").action, "revoked-no-login");
  assert.deepEqual(bans, []);
});

test("the pass never deletes anything", () => {
  assert.doesNotMatch(CODE, /\.delete\(|drop table|truncate/i,
    "revoking access is not deleting the client — his words, and history stays for ever");
});
