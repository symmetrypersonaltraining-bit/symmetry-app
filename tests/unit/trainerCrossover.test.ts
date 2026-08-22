// No crossover: money, notifications, and whose name is on them.
//
// Dustin, 20 Aug: "there can be no crossover on payments and payment reminders
// make sure these are set up right. also notifications need to be set up to
// only go to who they need to for clients n trainers. group chat for everyone
// but individual should be set up seoerateely per trainer."
//
// Row-level security is the real boundary and it now scopes every money table
// through `trainer_can_see_client(client_id)` — but RLS cannot help in two
// places, and those are what this file guards:
//
//   1. The SERVICE ROLE bypasses RLS entirely. The AI agent's tools run on it
//      with nothing but an `isTrainer` boolean in front of them, so "list every
//      payment reminder" would have returned the other trainer's whole book.
//   2. RLS decides who can READ a row. It has no opinion about whose NAME is
//      printed on the email that row generates.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** A function body bounded at the next top-level declaration — never a slice. */
function fnBody(src: string, name: string): string {
  const i = src.indexOf(name);
  assert.ok(i > 0, name + " is gone");
  const after = i + name.length;
  const rest = src.slice(after);
  const end = rest.search(/\n(?:export )?(?:async )?function |\n(?:export )?(?:interface|type|const) \w+/);
  return src.slice(i, end === -1 ? src.length : after + end);
}

// ─── 1. the agent knows who is asking ───────────────────────────────────────

test("the agent's tools cannot be called without a caller identity", () => {
  const c = code(read("src/lib/ai/agent-tools.ts"));
  assert.match(c, /export interface ToolCaller \{[\s\S]{0,400}?isOwner: boolean;/,
    "ToolCaller is gone — the tools are back to a service-role connection with no idea whose it is");
  assert.match(c, /export async function execTrainerTool\([\s\S]{0,160}?caller: ToolCaller\)/,
    "the caller is optional or absent; an optional identity is one somebody forgets");
  assert.doesNotMatch(c, /caller\?: ToolCaller/, "the caller must be required, not optional");
});

test("a non-owner's agent sees only their own roster", () => {
  const body = code(fnBody(read("src/lib/ai/agent-tools.ts"), "export async function execTrainerTool"));
  assert.match(body, /if \(!caller\.isOwner\) query = query\.eq\("trainer_id", caller\.trainerId\)/,
    "find_clients returns the whole business to whoever asks");
  assert.match(body, /if \(clientId && !caller\.isOwner\)[\s\S]{0,300}?not on your roster/,
    "no guard on a named client_id — every tool that takes one would act on the other trainer's client");
});

test("query_table is scoped before any caller-supplied filter, and fails closed", () => {
  const body = code(fnBody(read("src/lib/ai/agent-tools.ts"), "export async function execTrainerTool"));
  const i = body.indexOf('if (!READABLE.has(table))');
  assert.ok(i > 0, "query_table is gone");
  const qt = body.slice(i, i + body.slice(i).indexOf('if (name === "read_messages")'));
  assert.match(qt, /q = q\.in\("client_id", await myClientIds\(\)\)/,
    "client-scoped tables are not filtered — payment_reminders would come back whole");
  assert.match(qt, /q = q\.eq\("trainer_id", caller\.trainerId\)/, "the clients table is not scoped");
  assert.match(qt, /\} else if \(!SHARED_TABLES\.has\(table\)\) \{[\s\S]{0,160}?is not readable from your account/,
    "an unclassified table falls through unscoped — a new table added to READABLE must fail closed");
  // The scope has to be applied BEFORE the caller's own `where`, or a supplied
  // filter could be built on top of an unscoped query.
  assert.ok(qt.indexOf("caller.isOwner") < qt.indexOf("const where ="),
    "the caller's filters are applied before the scope");
});

test("every money table the agent can read is in the client-scoped set", () => {
  const c = code(read("src/lib/ai/agent-tools.ts"));
  const set = c.slice(c.indexOf("const CLIENT_SCOPED_TABLES"), c.indexOf("const SHARED_TABLES"));
  for (const t of ["payment_reminders", "calendar_payments", "billing_adjustments", "appointments", "messages"]) {
    assert.ok(set.includes(`"${t}"`), t + " is not scoped to the caller's roster");
  }
  const shared = c.slice(c.indexOf("const SHARED_TABLES"));
  for (const t of ["payment_reminders", "calendar_payments", "billing_adjustments"]) {
    assert.ok(!shared.slice(0, shared.indexOf("]")).includes(`"${t}"`), t + " is marked shared");
  }
});

test("the agent books on the calling trainer's own calendar", () => {
  const c = code(read("src/lib/ai/agent-tools.ts"));
  assert.doesNotMatch(c, /getValidAccessToken\(\s*\)/,
    "a bare token call is back — Stephanie's agent would book onto Dustin's calendar");
  const n = (c.match(/getValidAccessToken\(caller\.authUserId\)/g) || []).length;
  assert.equal(n, 6, "expected all 6 calendar calls to name the caller, found " + n);
});

test("the route resolves a real trainer row before running any tool", () => {
  const c = code(read("src/app/api/agent/route.ts"));
  assert.match(c, /trainerForAuthUser\(admin, scope\.userId, scope\.email\)/,
    "identity is taken from the boolean scope rather than the trainers table");
  // Strengthened 22 Aug. It is no longer enough to resolve SOME trainer row —
  // the row has to be the one trainerGate() authorized, matched on auth_user_id
  // and active, and not in client mode. See tests/unit/trainerAgentGate.test.ts.
  assert.match(c, /if \(!me \|\| me\.id !== verdict\.trainerId\)/,
    "an unresolvable trainer, or one the gate did not approve, still gets a service-role agent");
  assert.match(c, /trainerGate\(\{/,
    "the authorization gate is gone from the agent route");
  assert.match(c, /execTrainerTool\(admin, block\.name, [^)]*\)\s*\|\| \{\}, caller\)|execTrainerTool\([\s\S]{0,120}?caller\)/,
    "the caller is not passed through to the tools");
});

// ─── 2. whose name is on it ─────────────────────────────────────────────────

test("a payment reminder is signed by the coach who is owed the money", () => {
  const c = code(read("src/app/api/reminders/send/route.ts"));
  assert.match(c, /function reminderEmailHtml\([^)]*coachFirstName: string/,
    "the email body reads the global constant again");
  assert.match(c, /contact \$\{coachFirstName\} directly/, "the sign-off is not the parameter");
  assert.match(c, /from\("trainers"\)\.select\("first_name, name"\)\.eq\("id", client\.trainer_id\)/,
    "the coach is not resolved from the client's own trainer");
});

test("an invite is signed by the coach who created the client", () => {
  for (const f of ["src/app/api/create-client/route.ts",
                   "src/app/api/create-client-from-assessment/route.ts"]) {
    const c = code(read(f));
    assert.match(c, /creatorFirstName/, f + " does not resolve the creating coach");
    assert.match(c, /\.\.\.\(creatorFirstName \? \{ coachFirstName: creatorFirstName \} : \{\}\)/,
      f + " does not pass coachFirstName, so buildInviteEmailHtml falls back to the owner");
  }
});

// ─── 3. notifications reach the right people ────────────────────────────────

test("the group push reaches EVERY active trainer, not 'the' trainer", () => {
  const c = code(read("src/app/(app)/home/messageActions.ts"));
  assert.match(c, /from\('trainers'\)\.select\('auth_user_id'\)\.eq\('active', true\)/,
    "the group fan-out is back to one trainer — trainer_user_id() can only ever return one");
  assert.doesNotMatch(c, /rpc\('trainer_user_id'\)/,
    "trainer_user_id() is back: LIMIT 1 with no ORDER BY, plus a hardcoded fallback to the owner");
  assert.match(c, /\(coaches \|\| \[\]\)\.forEach/, "the coach list is fetched but not added to the targets");
});

test("a client's message falls back to the OWNER, deliberately, not to a coin flip", () => {
  const c = code(read("src/app/(app)/home/messageActions.ts"));
  assert.match(c, /rpc\("my_trainer_user_id"\)/, "a client's message no longer goes to their own coach");
  assert.match(c, /rpc\("owner_trainer_user_id"\)/,
    "the fallback is not the owner — an arbitrary trainer is a worse answer than a named one");
});

// ─── 4. an owner-only business rule stays on the owner's calendar ───────────

test("the paycheck exclusion applies only to the owner's calendar", () => {
  const c = code(read("src/app/api/gcal-sync/route.ts"));
  assert.match(c, /if \(isPayment && trainer\.is_owner && \(\/paycheck\/i\.test\(summary\)/,
    "a rule about what 'paycheck' means on Dustin's calendar is being applied to Stephanie's, where it would drop one of her client's payments");
});
