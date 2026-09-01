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
    // The filter has to sit within the same query EXPRESSION, not just
    // somewhere in the file — and "expression" is what we bound to, never a
    // character count.
    //
    // This was `slice(at - 600, at + 900)` and it failed on correct code on
    // 20 Aug: a comment added above the query pushed `.is('archived_at', null)`
    // past +900. That is the third fixed-size source window in this codebase to
    // do exactly that, and the file's own comment above warns that widening is
    // the wrong repair. So: from the anchor, take the client query and stop at
    // the statement that ends it.
    // Pick the clients query that BELONGS to this anchor, then bound it at the
    // end of its own statement. Never a character count.
    //
    // Neither direction alone works, and both were tried on 20 Aug:
    //   - anchors like "primary_goal, created_at" sit INSIDE the query's
    //     .select(), so searching forward lands on the NEXT query (7 failures);
    //   - anchors like "sendBroadcastMessage" are a function NAME above the
    //     query, so searching backward lands on the previous one (1 failure).
    // So: the query whose own statement contains the anchor, else the first one
    // after it.
    const spans = [...text.matchAll(/\.from\(['"]clients['"]\)/g)].map((m) => {
      const from = m.index ?? 0;
      const semi = text.indexOf(";", from);
      return { from, to: semi === -1 ? text.length : semi };
    });
    assert.notEqual(spans.length, 0, `${file}: no clients query at all`);
    const span =
      spans.find((sp) => sp.from <= at && at <= sp.to) ??
      spans.find((sp) => sp.from > at) ??
      spans[spans.length - 1];
    const window = text.slice(span.from, span.to);
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
