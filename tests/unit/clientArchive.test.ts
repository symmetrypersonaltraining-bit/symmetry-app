import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Archiving a client is a soft roster state (clients.archived_at). The whole
 * point is REACH: an archived client must stop receiving group messages,
 * broadcasts, nudges and reminders, and must stop appearing in rosters and
 * rankings. That behaviour lives in a dozen separate queries rather than one
 * function, so this pins each of them at the source — if someone drops the
 * filter while refactoring, this fails instead of a former client silently
 * getting a 6 AM push.
 *
 * Deliberately NOT covered: lookups by id. An archived client's past logs,
 * messages and payments must still resolve their name, so those queries stay
 * unfiltered on purpose.
 */

// Tests are run from the repo root (`npx tsx --test tests/unit/*.test.ts`).
const ROOT = process.cwd();

function src(rel: string): string {
  return readFileSync(join(ROOT, "src", rel), "utf8");
}

/** Each entry: file, and a snippet that must carry the archived filter. */
const ROSTER_QUERIES: { file: string; near: string }[] = [
  { file: "app/(app)/home/messageActions.ts", near: "sendBroadcastMessage" },
  // Anchored on the roster query itself, not the function name. It was
  // "sendGroupMessage" until 16 Aug, when that function grew an error check and
  // the query slid out of the +900 window — a passing guard turned failing
  // because of a change three lines above it, which teaches people to widen the
  // window. Widening is the wrong repair: the point of a narrow window is that
  // the filter sits in the SAME query expression. A tighter anchor keeps that.
  { file: "app/(app)/home/messageActions.ts", near: "admin.from('clients')" },
  { file: "app/(app)/messages/page.tsx", near: "allClients" },
  { file: "app/api/attention/route.ts", near: "primary_goal, created_at" },
  { file: "app/api/ai-nudges/route.ts", near: "primary_goal, auth_user_id" },
  { file: "app/api/challenge/route.ts", near: "allClients" },
  { file: "app/api/leaderboard/route.ts", near: "namesRes" },
  { file: "components/TrainerWeekDigest.tsx", near: "digest_snoozed_until" },
  { file: "components/ReminderEditor.tsx", near: "flat_billing" },
  { file: "app/(app)/payments/page.tsx", near: "current_fees, training_frequency" },
  { file: "app/(app)/home/page.tsx", near: 'from("clients")' },
  { file: "app/(app)/progress/page.tsx", near: 'from("clients")' },
];

for (const { file, near } of ROSTER_QUERIES) {
  test(`archived clients are filtered out of the roster query in ${file} (${near})`, () => {
    const text = src(file);
    const at = text.indexOf(near);
    assert.notEqual(at, -1, `anchor "${near}" no longer exists in ${file} — update this test`);
    // The filter has to sit within the same query expression, not just somewhere
    // in the file, so only look at the window around the anchor.
    const window = text.slice(Math.max(0, at - 600), at + 900);
    assert.match(
      window,
      /\.is\((['"])archived_at\1,\s*null\)/,
      `${file}: the roster query near "${near}" no longer excludes archived clients`
    );
  });
}

test("the archive control offers restore as well as archive", () => {
  const text = src("app/(app)/clients/[clientId]/ArchiveClientButton.tsx");
  // Archiving must be reversible from the UI — a one-way door here would mean
  // a mis-tap can only be undone in SQL.
  assert.match(text, /archived_at:\s*nextArchived\s*\?\s*new Date\(\)\.toISOString\(\)\s*:\s*null/);
  assert.match(text, /Restore to roster/);
});

test("the clients API accepts archived_at but still refuses arbitrary columns", () => {
  const text = src("app/api/clients/[clientId]/route.ts");
  assert.match(text, /"archived_at"/);
  // The allowlist is what keeps a PATCH from writing auth_user_id or email.
  assert.match(text, /const allowed = \[/);
  assert.ok(!text.includes('"auth_user_id"'), "auth_user_id must never be PATCHable");
  assert.ok(!text.includes('"email"'), "email must never be PATCHable");
});
