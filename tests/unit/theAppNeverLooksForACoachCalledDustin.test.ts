// IDENTITY BY LITERAL STRING, ONE LAYER DOWN.
//
// src/lib/ownClient.ts was written to delete `.ilike("name", "%Dustin%")` —
// looking for a human being by name. Four places survived that pass, and all
// four are the same shape: "which of these clients is the coach?" answered with
// /dustin/i.
//
// It fails in both directions at once. On another trainer's account the test
// never matches, so their own client row sits in their own coaching workload
// forever; and any real client actually named Dustin silently disappears from
// the feed. Nothing throws either way.
//
// The replacement is always the same question asked properly: is this row the
// VIEWER'S own client row (auth_user_id), and is it on the VIEWER'S roster
// (trainer_id, owner bypassed).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { onRoster, isViewersOwnClient, scopeRoster, restrictToRoster, NO_ROSTER } from "../../src/lib/auth/roster.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// A name test that DECIDES something — as opposed to one inside a comment
// explaining why it is gone.
function decidesOnTheNameDustin(src: string): string[] {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return false;
      return /\/dustin\/i|includes\("dustin"\)|ilike\([^)]*[Dd]ustin/.test(l);
    })
    .map((l) => l.trim());
}

for (const file of [
  "src/app/api/attention/route.ts",
  "src/components/TrainerWeekDigest.tsx",
  "src/app/(app)/progress/page.tsx",
  "src/app/api/cron/coachbot/route.ts",
]) {
  test(`${file} does not decide anything by the name Dustin`, () => {
    const hits = decidesOnTheNameDustin(read(file));
    assert.deepEqual(hits, [], `still matching on a name:\n${hits.join("\n")}`);
  });
}

test("the attention feed is scoped to the viewer's roster", () => {
  const src = read("src/app/api/attention/route.ts");
  assert.match(src, /rosterScopeFor\(/, "the route never asks whose clients these are");
  assert.match(src, /scopeRoster\(/, "the service-role roster read is still unfiltered");
});

test("the week digest leaves the viewer out of their own week, by id", () => {
  const src = read("src/components/TrainerWeekDigest.tsx");
  assert.match(src, /c\.auth_user_id === viewer\.id/, "the coach's own row is not excluded by identity");
  assert.match(src, /select\("id, name, email, weekly_focus, digest_snoozed_until, auth_user_id"\)/);
});

test("progress defaults to the viewer's own client row", () => {
  const src = read("src/app/(app)/progress/page.tsx");
  assert.match(src, /allClients\.find\(\(c\) => c\.auth_user_id === user\.id\)/);
});

// ── the helper itself ───────────────────────────────────────────────────────

const OWNER = { trainerId: "t-owner", isOwner: true, ownClientId: "c-owner" };
const BROOKE = { trainerId: "t-brooke", isOwner: false, ownClientId: "c-brooke" };

test("an owner sees every trainer's clients", () => {
  assert.equal(onRoster({ trainer_id: "t-brooke" }, OWNER), true);
  assert.equal(onRoster({ trainer_id: null }, OWNER), true);
});

test("a trainer sees only their own", () => {
  assert.equal(onRoster({ trainer_id: "t-brooke" }, BROOKE), true);
  assert.equal(onRoster({ trainer_id: "t-owner" }, BROOKE), false);
  assert.equal(onRoster({ trainer_id: null }, BROOKE), false, "an unassigned row is the owner's, not everyone's");
});

test("a viewer with no trainer row sees nothing at all", () => {
  assert.equal(onRoster({ trainer_id: "t-owner" }, NO_ROSTER), false);
  assert.equal(onRoster({ trainer_id: null }, NO_ROSTER), false);
});

test("the viewer's own client row is theirs, whatever it is called", () => {
  assert.equal(isViewersOwnClient({ id: "c-brooke" }, BROOKE), true);
  // The row this used to hinge on: a real client who happens to be called Dustin.
  assert.equal(isViewersOwnClient({ id: "c-some-client-named-dustin" }, BROOKE), false);
});

test("scopeRoster drops other trainers' clients and the viewer's own row", () => {
  const rows = [
    { id: "c-brooke", trainer_id: "t-brooke" },
    { id: "c-hers", trainer_id: "t-brooke" },
    { id: "c-his", trainer_id: "t-owner" },
  ];
  assert.deepEqual(scopeRoster(rows, BROOKE).map((r) => r.id), ["c-hers"]);
  assert.deepEqual(scopeRoster(rows, BROOKE, { includeOwn: true }).map((r) => r.id), ["c-brooke", "c-hers"]);
  assert.deepEqual(scopeRoster(rows, OWNER).map((r) => r.id), ["c-brooke", "c-hers", "c-his"]);
});

test("restrictToRoster fails CLOSED for a viewer with no trainer id", () => {
  const calls: [string, unknown][] = [];
  const q = { eq(col: string, v: unknown) { calls.push([col, v]); return this; } };
  restrictToRoster(q, NO_ROSTER);
  assert.equal(calls.length, 1, "no filter applied — the query would return everything");
  assert.equal(calls[0][0], "trainer_id");
  assert.notEqual(calls[0][1], null, "a null filter is not a filter");
});

test("restrictToRoster leaves an owner's query alone", () => {
  const calls: [string, unknown][] = [];
  const q = { eq(col: string, v: unknown) { calls.push([col, v]); return this; } };
  restrictToRoster(q, OWNER);
  assert.deepEqual(calls, []);
});
