// Guard: writes the user believes succeeded actually did, and no route pins a
// model string of its own.
//
// Two unrelated classes of fault, both found in the 15 Aug audit, both of the
// same family as this codebase's documented signature failure — something that
// looks like it worked and did not, or looks maintained and is not.
//
// ── 1. DELETES THAT COULD NOT FAIL ─────────────────────────────────────────
//
// deleteMessage and deleteThread never read their update's error and returned
// void. MessagesClient wrapped them in
//   try { await deleteThread(...); router.push(...) } catch {}
// which LOOKS like error handling but was unreachable, because neither could
// throw. A confirmed "Delete the entire conversation with X" could fail on RLS
// and the app would navigate away and refresh as though it had worked.
//
// Same shape in PaymentsClient.saveEdit: an unchecked update followed by an
// optimistic local update, so a failed write left the trainer looking at the
// amount he had just typed while the database kept the old one — and the
// reminder email reads from the database.
//
// ── 2. HARDCODED MODEL STRINGS ─────────────────────────────────────────────
//
// analyze-meal-photo pinned 'claude-sonnet-4-6' and assessment-recommend pinned
// the DATED snapshot 'claude-haiku-4-5-20251001'. Neither would pick up a model
// change the rest of the app gets automatically, and the dated one is worse: it
// survives a rotation by quietly continuing to call a version everything else
// has left behind. Nothing fails; it just drifts.
//
// MUTATION-TESTED: reverting any of the four fails its test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("deleting a message or a thread reports failure instead of swallowing it", () => {
  const CODE = strip(read("src/app/(app)/home/messageActions.ts"));
  for (const fn of ["deleteMessage", "deleteThread"]) {
    const at = CODE.indexOf(`export async function ${fn}(`);
    assert.ok(at > -1, `${fn} is gone`);
    const body = CODE.slice(at, CODE.indexOf("\n}", at));
    assert.match(body, /const \{ error \} = await supabase/, `${fn} no longer reads its error`);
    assert.match(body, /if \(error\) throw new Error/, `${fn} reads its error but does not raise it`);
  }
});

test("the message screen's catch blocks are reachable and say something", () => {
  // An empty catch around a function that cannot throw is decoration. Now that
  // they can throw, silence would be a choice rather than an accident.
  const CODE = strip(read("src/app/(app)/messages/MessagesClient.tsx"));
  const empties = [...CODE.matchAll(/catch\s*\{\s*\}/g)];
  assert.deepEqual(
    empties.map((m) => m[0]),
    [],
    "an empty catch is back around a delete — a failed delete would navigate away as if it had worked"
  );
  assert.ok(
    (CODE.match(/toast\.error\(/g) || []).length >= 3,
    "the delete handlers no longer surface their failures"
  );
});

test("EVERY payment_reminders write reads its error", () => {
  // Deliberately not anchored to one function. The first version of this test
  // searched for the update by its shape and found the WRONG ONE — there are
  // two, and the one it landed on turned out to be a second unchecked write I
  // had not noticed, in the path that SENDS the reminder email. Counting them
  // all is both simpler and the reason that second bug was found at all.
  const CODE = strip(read("src/app/(app)/payments/PaymentsClient.tsx"));
  const writes = [...CODE.matchAll(/([\s\S]{0,80})await supabase\s*\.?\s*from\("payment_reminders"\)\s*\.update\(/g)];
  assert.ok(writes.length >= 2, `expected at least 2 payment_reminders writes, found ${writes.length}`);
  const unchecked = writes.filter((m) => !/const \{ error(: \w+)? \} =/.test(m[1]));
  assert.deepEqual(
    unchecked.map((m) => m[1].trim().slice(-50)),
    [],
    "a payment_reminders write is not reading its error — the screen shows a number the database does not have, and the reminder email reads from the database"
  );
});

test("the payment edit checks the write BEFORE the optimistic update", () => {
  const CODE = strip(read("src/app/(app)/payments/PaymentsClient.tsx"));
  const at = CODE.indexOf("async function saveEdit");
  assert.ok(at > -1, "saveEdit is gone");
  const body = CODE.slice(at, at + 2000);
  const guard = body.indexOf("if (updErr)");
  assert.ok(guard > -1, "the payment edit no longer guards on its error");
  assert.ok(
    guard < body.lastIndexOf("setLocalClients"),
    "the optimistic local update runs before the write is known to have succeeded"
  );
});

test("no AI route spells out a model string of its own", () => {
  // One place decides which model does which job: src/lib/ai/anthropic.ts.
  // A literal anywhere else is a route that silently stops moving with the rest.
  const routes = [
    "src/app/api/analyze-meal-photo/route.ts",
    "src/app/api/assessment-recommend/route.ts",
  ];
  for (const r of routes) {
    const CODE = strip(read(r));
    const literals = [...CODE.matchAll(/['"]claude-[a-z0-9.-]+['"]/g)].map((m) => m[0]);
    assert.deepEqual(
      literals,
      [],
      `${r} pins ${literals.join(", ")} — import HAIKU_MODEL / SONNET_MODEL / modelFor() instead`
    );
  }
});

test("the model constants those routes now import still exist", () => {
  // Guarding against a literal is only useful if the alternative is real.
  const A = read("src/lib/ai/anthropic.ts");
  assert.match(A, /export const HAIKU_MODEL\s*=/);
  assert.match(A, /export const SONNET_MODEL\s*=/);
});
