// THE SEVEN LEFT OVER FROM THE SECOND-TRAINER SWEEP.
//
// Each was written up as "needs Dustin" on 23 Aug and answered the same day.
// One test block per item, in the order they were listed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { signState, verifyState } from "../../src/lib/auth/oauthState.ts";

// The signer reads its key at CALL time and falls back to the service-role key,
// which no unit run has. Set one here — module bodies run before any test()
// callback, so this lands in time — and the crypto is exercised for real
// instead of skipped.
process.env.OAUTH_STATE_SECRET ||= "test-only-oauth-state-secret";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// ── 1. A trainer can see her own calendar sync ──────────────────────────────
//
// gcal_sync_runs logs one row per INVOCATION and an invocation loops over every
// trainer, so there is no trainer_id to put on it — which is why it went
// owner-only, which made the one card that answers "is my calendar working"
// render as empty space for everyone else. The per-trainer outcome was already
// inside response->'trainers'; it just had no user_id to match on.

test("every sync result names the trainer it belongs to", () => {
  const src = read("src/app/api/gcal-sync/route.ts");
  assert.match(src, /user_id: string;/, "TrainerSyncResult has no user_id");
  assert.match(src, /trainer: who,\s*\n\s*user_id: trainer\.user_id,/, "the real result path does not stamp it");
  assert.match(src, /emptyResult\(who, 'no clients assigned', trainer\.user_id\)/);
  assert.match(src, /emptyResult\(t\.trainer_name \|\| t\.user_id, msg, t\.user_id\)/);
});

test("a trainer's slice carries what makes it worth showing", () => {
  const src = read("src/app/api/gcal-sync/route.ts");
  const i = src.indexOf("trainers: results.map");
  assert.ok(i > 0);
  const block = src.slice(i, i + 500);
  assert.match(block, /user_id: r\.user_id/);
  assert.match(block, /errors: r\.errors/, "a slice with no errors cannot report a failure");
  assert.match(block, /unmatched_samples/, "a slice with no samples cannot say what was dropped");
});

test("the card reads the scoped function, not the owner-only table", () => {
  const src = read("src/components/SyncHealth.tsx");
  assert.match(src, /rpc\("my_gcal_sync_health"\)/);
  assert.ok(
    !/\.from\("gcal_sync_runs"\)/.test(src),
    "still selecting the table directly, which returns nothing for a non-owner",
  );
});

test("the migration exists and narrows by role", () => {
  const p = "supabase/migrations/20260823b_a_trainer_can_see_her_own_calendar_sync.sql";
  assert.ok(existsSync(join(ROOT, p)), "no migration for my_gcal_sync_health");
  const sql = read(p);
  assert.match(sql, /if public\.my_trainer_id\(\) is null then\s*\n\s*return;/, "a non-trainer is not refused");
  assert.match(sql, /if public\.is_owner\(\) then/, "the owner does not get the whole run");
  assert.match(sql, /t ->> 'user_id' = auth\.uid\(\)::text/, "a trainer is not narrowed to her own entry");
  // The run-level error belongs to the invocation, not to one trainer.
  assert.match(sql, /error := null;/, "another trainer's dead credential is reported as hers");
});

// ── 2. The bots post as the owner ───────────────────────────────────────────
//
// I answered this one WRONG and it is worth leaving the record.
//
// I said the group chat was shared by decision and so the bots correctly spoke
// as the owner; the only fault was that any trainer could fire them. Dustin:
// "the group was split for per trainer" — and then, when the fix was still an
// owner-only gate: "if I have a group chat with challenges and ai bots, and
// other trainers do not, thats not exactly like mine is it?"
//
// The real answer was that every trainer gets the bots in their own room. The
// owner-only gate lived for one day and is gone. What replaced it is asserted
// in everyTrainerGetsAChallengeAndABot.test.ts; this only checks it stays gone.

for (const f of ["src/app/api/cron/coachbot/route.ts", "src/app/api/cron/birthdays/route.ts"]) {
  test(`${f}: the interim owner-only gate is not back`, () => {
    const src = read(f);
    assert.ok(!/isOwner/.test(src), "a trainer is being refused her own room's bot again");
    assert.match(src, /onlyTrainer = scoped\.scope\.userId;/, "a hand fire does not scope to the caller");
  });
}

// ── 3. The nudge digest ─────────────────────────────────────────────────────

test("a trainer's sweep covers her clients and lands in her inbox", () => {
  const src = read("src/app/api/ai-nudges/route.ts");
  assert.match(src, /const trainerAuth = caller \? caller\.id : await ownerAuthUid\(admin\);/,
    "the digest still always goes to the owner");
  assert.match(src, /callerScope \? scopeRoster\(allClients, callerScope/,
    "the sweep still runs over every client in the business");
  assert.match(src, /select\("id, name, primary_goal, auth_user_id, trainer_id"\)/,
    "the roster read has no trainer_id to scope on");
});

test("the scheduler keeps the whole-business sweep", () => {
  const src = read("src/app/api/ai-nudges/route.ts");
  assert.match(src, /let caller: \{ id: string; email: string \| null \} \| null = null;/);
  assert.match(src, /: allClients;/, "a cron run would be scoped to nobody");
});

// ── 4. Pages reachable by a client ──────────────────────────────────────────

for (const [dir, what] of [
  ["src/app/(app)/library/layout.tsx", "the library"],
  ["src/app/(app)/assessment/layout.tsx", "the assessment"],
] as const) {
  test(`${what} is gated on the server`, () => {
    assert.ok(existsSync(join(ROOT, dir)), `${dir} does not exist`);
    const src = read(dir);
    assert.match(src, /viewerIsTrainer\(supabase, user\)/);
    assert.match(src, /redirect\("\/home"\)/);
    assert.match(src, /export const dynamic = "force-dynamic"/, "a cached variant could serve the wrong branch");
  });
}

// ── 5. The OAuth state ──────────────────────────────────────────────────────

test("a signed state round-trips", () => {
  const s = signState("user-123");
  assert.ok(s, "no key configured in this environment");
  assert.deepEqual(verifyState(s), { ok: true, userId: "user-123" });
});

test("a forged state is refused", () => {
  // What the old code accepted: the victim's id, typed by hand.
  assert.deepEqual(verifyState("victim-user-id"), { ok: false, reason: "malformed" });
  const s = signState("user-123")!;
  const [u, t, n] = s.split(".");
  assert.deepEqual(verifyState(`${u}.${t}.${n}.notarealsignature`), { ok: false, reason: "bad_signature" });
});

test("someone else's signature does not transfer to another user id", () => {
  const mine = signState("attacker")!;
  const parts = mine.split(".");
  const swapped = ["victim", parts[1], parts[2], parts[3]].join(".");
  assert.equal(verifyState(swapped).ok, false);
});

test("a state older than the window is refused", () => {
  const old = signState("user-123", Date.now() - 11 * 60_000)!;
  assert.deepEqual(verifyState(old), { ok: false, reason: "expired" });
  // And one issued in the future, which is a clock lie either way.
  const ahead = signState("user-123", Date.now() + 5 * 60_000)!;
  assert.deepEqual(verifyState(ahead), { ok: false, reason: "expired" });
});

test("the routes actually use it", () => {
  const start = read("src/app/api/auth/google/route.ts");
  assert.match(start, /const state = signState\(user\.id\);/);
  // The literal must be gone from the CODE — the comment above it explains why.
  const code = start.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(!/state: user\.id/.test(code), "the bare user id is still being sent as state");
  const cb = read("src/app/api/auth/google/callback/route.ts");
  assert.match(cb, /const checked = verifyState\(rawState\);/);
  assert.match(cb, /const userId = checked\.userId;/, "the id still comes from the query string");
  assert.match(cb, /signedIn\.id !== userId/, "no session cross-check");
});

// ── 6 & 7. One reading of "is a trainer", everywhere ────────────────────────

test("active is read the same way in all three places", () => {
  for (const f of ["src/lib/auth/viewer.ts", "src/middleware.ts", "src/lib/ai/trainerGate.ts"]) {
    const src = read(f);
    const decisions = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .filter((l) => /active !== false/.test(l));
    assert.deepEqual(decisions, [], `${f} still uses the loose reading:\n${decisions.join("\n")}`);
  }
});

test("middleware resolves a trainer by email as well as auth id", () => {
  const src = read("src/middleware.ts");
  assert.match(src, /auth_user_id\.eq\.\$\{user\.id\}/, "the auth-id path is gone");
  assert.match(src, /email\.ilike\./, "a trainers row with no auth link still falls into client onboarding");
});
