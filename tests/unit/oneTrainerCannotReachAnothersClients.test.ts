// "IS A TRAINER" IS NOT "IS THIS CLIENT'S TRAINER".
//
// trainer_can_see_client() has always said the right thing in the database:
// the owner sees everyone, any other trainer sees the rows whose trainer_id is
// theirs. But a dozen trainer-gated API routes read with createAdminClient() —
// the SERVICE ROLE, which bypasses RLS by design because it needs tables a
// client may not touch — and then never re-imposed the rule in code.
//
// viewerIsTrainer() answers "is a trainer". There was no helper in the codebase
// that could answer the second question, so nothing asked it. The result, the
// moment a second trainer existed:
//
//   /api/plateaus?clientId=<any>   → anyone's whole lifting history
//   /api/live-sessions             → everyone's clients training, in real time
//   /api/attention-drafts          → drafts a message about anyone's client
//   /api/focus-drafts              → reads, rewrites and APPROVES the weekly
//                                    coaching copy for every client, and
//                                    "approve all" published it
//   /api/cron/weekly-ai POST       → a whole-business sweep, one model call per
//                                    client, rewriting the owner's copy
//
// Checked and NOT changed: /api/reminders/send reads payment_reminders through
// the SESSION client, and that table carries trainer_scoped_payment_reminders
// (using trainer_can_see_client). RLS is the boundary there and it holds.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { trainerMaySeeClient } from "../../src/lib/auth/roster.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** A fake db: one clients row, plus the trainers row the scope resolves through. */
function db(trainerRow: Record<string, unknown> | null, clientTrainerId: string | null) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(col: string) {
              const result =
                table === "trainers"
                  ? { data: trainerRow }
                  : col === "auth_user_id"
                    ? { data: null }
                    : { data: { trainer_id: clientTrainerId } };
              return {
                maybeSingle: async () => result,
                limit: async () => ({ data: trainerRow ? [trainerRow] : [] }),
              };
            },
          };
        },
      };
    },
  };
}

const BROOKE = { id: "t-brooke", auth_user_id: "u-brooke", email: "b@x.com", name: "Brooke", role: "trainer" };
const DUSTIN = { id: "t-dustin", auth_user_id: "u-dustin", email: "d@x.com", name: "Dustin", role: "owner" };
const user = (id: string) => ({ id, email: null });

test("a trainer reaches her own client", async () => {
  assert.equal(await trainerMaySeeClient(db(BROOKE, "t-brooke") as never, user("u-brooke"), "c1"), true);
});

test("a trainer does not reach the owner's client", async () => {
  assert.equal(await trainerMaySeeClient(db(BROOKE, "t-dustin") as never, user("u-brooke"), "c1"), false);
});

test("an unassigned client is not everyone's", async () => {
  assert.equal(await trainerMaySeeClient(db(BROOKE, null) as never, user("u-brooke"), "c1"), false);
});

test("the owner reaches every client", async () => {
  assert.equal(await trainerMaySeeClient(db(DUSTIN, "t-brooke") as never, user("u-dustin"), "c1"), true);
});

test("someone who is not a trainer at all reaches nothing", async () => {
  assert.equal(await trainerMaySeeClient(db(null, "t-dustin") as never, user("u-nobody"), "c1"), false);
});

test("a missing clientId is a refusal, not a wildcard", async () => {
  assert.equal(await trainerMaySeeClient(db(DUSTIN, "t-dustin") as never, user("u-dustin"), null), false);
});

// ── the routes ─────────────────────────────────────────────────────────────

for (const [file, marker] of [
  ["src/app/api/plateaus/route.ts", /trainerMaySeeClient\(/],
  ["src/app/api/attention-drafts/route.ts", /trainerMaySeeClient\(/],
  ["src/app/api/live-sessions/route.ts", /onRoster\(c, scope\)/],
  ["src/app/api/focus-drafts/route.ts", /draftIsMine\(/],
] as const) {
  test(`${file} asks whose client it is`, () => {
    assert.match(read(file), marker, "still trusts 'is a trainer' alone");
  });
}

test("plateaus and attention-drafts refuse rather than return empty", () => {
  for (const f of ["src/app/api/plateaus/route.ts", "src/app/api/attention-drafts/route.ts"]) {
    assert.match(read(f), /"Not your client".*403|status: 403/s, `${f} does not refuse`);
  }
});

test("approve-all approves only the caller's clients", () => {
  const src = read("src/app/api/focus-drafts/route.ts");
  const i = src.indexOf("if (body.all)");
  assert.ok(i > 0);
  const block = src.slice(i, i + 900);
  assert.match(block, /if \(!scope\.isOwner\)/, "approve all is still instance-wide");
  assert.match(block, /q\.in\("client_id", ids\)/);
});

test("a non-owner cannot run a whole-business weekly sweep", () => {
  const src = read("src/app/api/cron/weekly-ai/route.ts");
  assert.match(src, /if \(!me\.isOwner\)/, "any trainer can still sweep every client");
  assert.match(src, /if \(!onlyClientId\)/, "the whole-roster form is still open to a non-owner");
});

test("reminders/send is left on RLS deliberately, not by oversight", () => {
  // If this ever switches to the admin client, the roster check has to come with it.
  const src = read("src/app/api/reminders/send/route.ts");
  assert.ok(
    !/createAdminClient|getServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(src),
    "this route now bypasses RLS and has no roster check of its own",
  );
});
