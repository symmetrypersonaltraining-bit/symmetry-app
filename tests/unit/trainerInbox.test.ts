// A client's message reaches THEIR coach, and the group chat posts as the owner.
//
// Five routes answered "which trainer?" with
// `trainer_settings.select("user_id").limit(1).maybeSingle()`, each carrying a
// comment saying trainer_settings "holds the single trainer auth user id — the
// same row the calendar sync reads".
//
// That row is not single. trainer_settings holds one row per trainer with a
// Google Calendar connected, and Stephanie connects hers the day she starts.
// From that moment `.limit(1)` with no ORDER BY decides, per request, which
// coach receives a client's escalation — and the client is told it was
// delivered either way. Nothing errors. Nothing logs.
//
// The right answer differs by route, which is the other half of the fix:
//   escalation, programming answer, DM  → the client's OWN trainer
//   group chat, birthdays, coachbot     → the OWNER (shared by decision)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  trainerForClient, ownerTrainer, ownerAuthUid, inboxAuthUidForClient,
  type AnyDb,
} from "../../src/lib/trainerResolve.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const OWNER = {
  id: "t-dustin", auth_user_id: "u-dustin", email: "d@x.test", name: "Dustin Gautreaux",
  first_name: "Dustin", role: "owner", venmo_username: "dustingautreaux",
  zelle_email: "d@x.test", cashapp_handle: null, pay_phone: null, pay_display_name: null,
};
const STEPH = {
  id: "t-steph", auth_user_id: "u-steph", email: "s@x.test", name: "Stephanie Gautreaux",
  first_name: "Stephanie", role: "trainer", venmo_username: "symmetrypt",
  zelle_email: "s@x.test", cashapp_handle: null, pay_phone: "972-800-8841", pay_display_name: null,
};

/**
 * Enough of a supabase builder for this module: select → eq/ilike → limit.
 *
 * It PROJECTS to the requested column list, and that is not gold-plating: the
 * first version returned whole rows, so dropping `auth_user_id` from the SELECT
 * — which breaks every inbox in production — left all ten tests green. A fake
 * that returns more than the real one would is a fake that hides the bug.
 */
function fakeDb(tables: Record<string, Record<string, unknown>[]>): AnyDb {
  return {
    from(table: string) {
      let rows = (tables[table] || []).slice();
      let cols: string[] | null = null;
      const project = (r: Record<string, unknown> | undefined) => {
        if (!r) return null;
        if (!cols) return r;
        const out: Record<string, unknown> = {};
        for (const c of cols) if (c in r) out[c] = r[c];
        return out;
      };
      const api = {
        select: (c: string) => { cols = c.split(",").map(x => x.trim()).filter(Boolean); return api; },
        eq: (col: string, v: unknown) => { rows = rows.filter(r => r[col] === v); return api; },
        ilike: (col: string, v: string) =>
          { rows = rows.filter(r => String(r[col]).toLowerCase() === String(v).toLowerCase()); return api; },
        limit: (n: number) => Promise.resolve({ data: rows.slice(0, n).map(project), error: null }),
        maybeSingle: () => Promise.resolve({ data: project(rows[0]), error: null }),
      };
      return api;
    },
  };
}

const db = fakeDb({
  trainers: [OWNER, STEPH],
  clients: [
    { id: "c-lesly", trainer_id: "t-dustin" },
    { id: "c-hers", trainer_id: "t-steph" },
    { id: "c-orphan", trainer_id: null },
  ],
});

// ─── the lookup itself ──────────────────────────────────────────────────────

test("a client resolves to the trainer who owns them", async () => {
  assert.equal((await trainerForClient(db, "c-lesly"))?.id, "t-dustin");
  assert.equal((await trainerForClient(db, "c-hers"))?.id, "t-steph");
});

test("a trainer record carries the auth account, not just the trainer row id", async () => {
  // The inbox is addressed by auth.users id. Without this field the whole
  // lookup is decorative and the routes have to go back to trainer_settings.
  assert.equal((await trainerForClient(db, "c-hers"))?.authUserId, "u-steph");
  assert.equal((await ownerTrainer(db))?.authUserId, "u-dustin");
});

test("the owner is found by role, not by being first", async () => {
  const flipped = fakeDb({ trainers: [STEPH, OWNER], clients: [] });
  assert.equal((await ownerTrainer(flipped))?.id, "t-dustin");
  assert.equal(await ownerAuthUid(flipped), "u-dustin");
});

// ─── the inbox address ──────────────────────────────────────────────────────

test("a message is addressed to the sender's own coach", async () => {
  assert.equal(await inboxAuthUidForClient(db, "c-lesly"), "u-dustin");
  assert.equal(await inboxAuthUidForClient(db, "c-hers"), "u-steph");
});

test("a client with no trainer still reaches somebody", async () => {
  // Degrade to the owner, never to null — a silently undelivered escalation is
  // worse than one that lands on the wrong desk and gets forwarded.
  assert.equal(await inboxAuthUidForClient(db, "c-orphan"), "u-dustin");
  assert.equal(await inboxAuthUidForClient(db, null), "u-dustin");
  assert.equal(await inboxAuthUidForClient(db, "c-nonexistent"), "u-dustin");
});

test("a database that throws does not take the message down", async () => {
  const angry: AnyDb = { from() { throw new Error("connection reset"); } };
  assert.equal(await inboxAuthUidForClient(angry, "c-lesly"), null);
  assert.equal(await ownerAuthUid(angry), null);
});

// ─── the five call sites ────────────────────────────────────────────────────

const PER_CLIENT = [
  ["src/app/api/coach-escalate/route.ts", "inboxAuthUidForClient(db, me.id)"],
  ["src/app/api/program-feedback/route.ts", "inboxAuthUidForClient(db, cid)"],
  // "Your client just AI-built their own workout" belongs to whoever coaches
  // them. This one searched the CLIENTS table for
  // `email = TRAINER_EMAIL OR name ILIKE '%Dustin%'` — two owner-shaped guesses
  // rather than a lookup.
  ["src/app/api/workout-ai/route.ts", "inboxAuthUidForClient(admin, clientId)"],
] as const;

const OWNER_WIDE = [
  ["src/app/api/cron/birthdays/route.ts", "ownerAuthUid(db)"],
  ["src/app/api/cron/coachbot/route.ts", "ownerAuthUid(db)"],
  // The nightly nudge digest covers the whole roster, so it goes to the owner.
  // Splitting it per trainer is Dustin's call, not a default to slide in.
  ["src/app/api/ai-nudges/route.ts", "ownerAuthUid(admin)"],
] as const;

test("no route resolves a trainer by taking whatever trainer_settings row comes first", () => {
  for (const [f] of PER_CLIENT) assertNoSettingsGrab(f);
  for (const [f] of OWNER_WIDE) assertNoSettingsGrab(f);
  assertNoSettingsGrab("src/lib/ai/agent-tools.ts");
});

function assertNoSettingsGrab(f: string) {
  const c = code(read(f));
  assert.ok(!/from\("trainer_settings"\)[\s\S]{0,80}?limit\(1\)/.test(c),
    f + " is back to picking an arbitrary trainer_settings row — with two trainers that is a coin flip per request");
}

test("client-facing messages go to that client's coach", () => {
  for (const [f, call] of PER_CLIENT) {
    assert.ok(code(read(f)).includes(call), f + " no longer resolves the client's own trainer (" + call + ")");
  }
});

test("the shared surfaces post as the owner, deliberately", () => {
  for (const [f, call] of OWNER_WIDE) {
    assert.ok(code(read(f)).includes(call),
      f + " does not resolve the owner (" + call + ") — it would post from whichever trainer sorted first");
  }
});

test("nobody finds a trainer by guessing at the owner's email or name", () => {
  // Two more shapes of the same mistake, both live until 20 Aug:
  //   .eq("email", TRAINER_EMAIL) against the CLIENTS table — works only
  //   because Dustin also trains himself.
  //   .or(`email.eq.${TRAINER_EMAIL},name.ilike.%${COACH_FIRST_NAME}%`) — a
  //   name match, which would happily return the OTHER Gautreaux.
  for (const f of [...PER_CLIENT.map(x => x[0]), ...OWNER_WIDE.map(x => x[0])]) {
    const c = code(read(f));
    assert.ok(!/from\("clients"\)[\s\S]{0,160}?TRAINER_EMAIL/.test(c),
      f + " looks the trainer up in the clients table by the owner's email");
    assert.ok(!/name\.ilike\.%\$\{COACH_FIRST_NAME\}%/.test(c),
      f + " matches a trainer by first name — there are two Gautreauxes");
  }
});

test("the agent sends a group post as the owner and a DM as the client's coach", () => {
  const c = code(read("src/lib/ai/agent-tools.ts"));
  assert.match(c, /if \(isGroup\) trainerUid = await ownerAuthUid\(db\);/,
    "a group post no longer resolves the owner");
  assert.match(c, /else trainerUid = await inboxAuthUidForClient\(db, clientId\);/,
    "a DM is not sent from the client's own coach — it would carry a stranger's name and land in the wrong thread");
});
