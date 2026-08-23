// ONE AGENT THREAD PER TRAINER, NOT ONE PER INSTANCE.
//
// `ai_chat_sessions` had no trainer column and the drawer stored a single row
// keyed on the string 'trainer_agent', read and written through the service
// role. Brooke Orton signing in on 23 Aug would have opened Dustin's
// conversation — named clients, injuries, money — overwritten it with her first
// question, and deleted it with Clear. No error at any point; the row was
// simply the newest one.
//
// The routes still use the service role, so RLS is the second line here. These
// assertions are about the first: every touch of that table carries the owner.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const SESSION = readFileSync(join(ROOT, "src/app/api/agent/session/route.ts"), "utf8");
const AGENT = readFileSync(join(ROOT, "src/app/api/agent/route.ts"), "utf8");
const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations/20260823a_the_agents_memory_belongs_to_the_trainer.sql"),
  "utf8",
);

/** Every `.from("ai_chat_sessions")` chain in a file, up to its terminator. */
function chainsOver(src: string): string[] {
  const out: string[] = [];
  let i = src.indexOf('from("ai_chat_sessions")');
  while (i >= 0) {
    // A chain ends at the first semicolon that isn't inside the chain itself.
    const end = src.indexOf(";", i);
    out.push(src.slice(i, end < 0 ? src.length : end));
    i = src.indexOf('from("ai_chat_sessions")', i + 1);
  }
  return out;
}

test("reading the thread asks whose thread it is", () => {
  const reads = chainsOver(SESSION).filter((c) => c.includes(".select("));
  assert.ok(reads.length > 0, "no read found — has the route moved?");
  for (const c of reads) {
    assert.match(c, /\.eq\("owner_user_id",/, `a read with no owner filter:\n${c}`);
  }
});

test("clearing the thread clears only the caller's", () => {
  const deletes = chainsOver(SESSION).filter((c) => c.includes(".delete("));
  assert.ok(deletes.length > 0, "no delete found — has Clear moved?");
  for (const c of deletes) {
    assert.match(c, /\.eq\("owner_user_id",/, `Clear would wipe every trainer's thread:\n${c}`);
  }
});

test("a saved thread is stamped with its owner", () => {
  const inserts = chainsOver(AGENT).filter((c) => c.includes(".insert("));
  assert.ok(inserts.length > 0, "no insert found — has saveSession moved?");
  for (const c of inserts) {
    assert.match(c, /owner_user_id:/, `a new thread with no owner:\n${c}`);
  }
});

test("the row being updated was found by owner, not just by context", () => {
  const reads = chainsOver(AGENT).filter((c) => c.includes(".select("));
  assert.ok(reads.length > 0);
  for (const c of reads) {
    assert.match(c, /\.eq\("owner_user_id",/, `saveSession would pick another trainer's row:\n${c}`);
  }
});

test("saveSession cannot be called without saying whose thread it is", () => {
  assert.match(
    AGENT,
    /async function saveSession\(db: Db, ownerUserId: string,/,
    "the owner is not a required argument, so a call site can omit it",
  );
  const calls = [...AGENT.matchAll(/await saveSession\(\s*admin,\s*([^,\n]+)/g)].map((m) => m[1].trim());
  assert.ok(calls.length >= 3, `expected every exit path to save, found ${calls.length}`);
  for (const arg of calls) {
    assert.equal(arg, "scope.userId", `an exit path saves without the caller: ${arg}`);
  }
});

test("the column exists and the policy is scoped", () => {
  assert.match(MIGRATION, /add column if not exists owner_user_id uuid/);
  assert.match(MIGRATION, /drop policy if exists trainer_all_ai_chat/, "the instance-wide policy is still in place");
  assert.match(MIGRATION, /owner_user_id = auth\.uid\(\)/);
});
