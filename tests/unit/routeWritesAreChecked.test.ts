// Guard: three routes stop telling somebody a write landed when it did not.
//
// Same fault as the payments screen (30106f7), the workout adjuster (c7d06c6)
// and the trainer calendar (2c6776b), which is why the question in
// docs/UNCHECKED-WRITES-INVENTORY.md is the only one that decides a site:
// IF THIS WRITE FAILS, DOES ANYONE FIND OUT?
//
// On these three the answer was no, and each had somebody being told otherwise:
//
//   /api/focus-drafts  — Dustin edits next week's coaching copy for 35 people
//     and approves it. Every write was unchecked and the route answered
//     `{ ok: true }` regardless. The approve path is the expensive one:
//     publish_focus_drafts only takes APPROVED rows, so a failed approval
//     published nothing, returned 200, cleared the queue off his screen — and
//     Sunday's 6am fallback then published the whole batch unreviewed. That is
//     the precise outcome the review screen exists to prevent.
//
//   /api/program-feedback — a client answers a programming question. The
//     update that IS the answer was unchecked, and `delivered` was hardcoded to
//     "was it substantive" rather than "did it reach the inbox", so a client
//     could be told their coach had their answer when nothing was written.
//     Both best-effort writes were wrapped in try/catch, which cannot work:
//     PostgREST RETURNS an error, it does not throw, so the console lines those
//     blocks exist to produce could never fire.
//
//   /api/challenge — join, leave, end and start. `join` swallowed every error
//     to be forgiving of a duplicate; the leaderboard bug where twenty-three
//     people had joined and six were showing came from this exact area. `start`
//     ends the running challenge before inserting the new one, and an unchecked
//     failure there caused the one thing that write exists to prevent: two
//     challenges live at once.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"));

// A write whose result is thrown away: `await db.from(x).update(…)` with no
// `= ` in front of the await. The lookbehind is what distinguishes it from the
// checked form, `const { error } = await db.from(x).update(…)`.
const BARE_WRITE = /(?<!=\s)await\s+db\s*\n?\s*\.from\([^)]*\)\s*\n?\s*\.(insert|update|delete|upsert)\(/g;

for (const [label, file] of [
  ["focus-drafts", "src/app/api/focus-drafts/route.ts"],
  ["program-feedback", "src/app/api/program-feedback/route.ts"],
  ["challenge", "src/app/api/challenge/route.ts"],
] as const) {
  test(`every write in /api/${label} captures its result`, () => {
    const code = read(file);
    const writes = (code.match(/\.(insert|update|delete|upsert)\(/g) || []).length;
    assert.ok(writes > 0, "expected write calls");
    const bare = code.match(BARE_WRITE) || [];
    assert.equal(bare.length, 0, `${bare.length} writes still discard their result:\n${bare.join("\n")}`);
  });
}

// ── focus-drafts ───────────────────────────────────────────────────────────

test("a failed edit is a 500, not { ok: true }", () => {
  const code = read("src/app/api/focus-drafts/route.ts");
  const i = code.indexOf("export async function PATCH");
  const body = code.slice(i, code.indexOf("export async function POST"));
  assert.match(body, /const \{ error \} = await db/);
  assert.match(body, /Edit not saved/);
  const guard = body.indexOf("if (error)");
  const ok = body.indexOf("ok: true");
  assert.ok(guard > 0 && guard < ok, "the ok is returned before the error is checked");
});

test("a failed approval does not fall through to publishing", () => {
  // publish_focus_drafts takes only approved rows, so falling through publishes
  // nothing, answers 200 and clears the queue — and the Sunday 6am fallback
  // then publishes the batch unreviewed.
  const code = read("src/app/api/focus-drafts/route.ts");
  const i = code.indexOf("export async function POST");
  const body = code.slice(i);
  const guard = body.indexOf("if (approveErr)");
  const publish = body.indexOf("publish_focus_drafts");
  assert.ok(guard > 0, "the approval result is not checked");
  assert.ok(guard < publish, "publishing runs before the approval is known to have landed");
});

test("approved-but-not-published says which", () => {
  const code = read("src/app/api/focus-drafts/route.ts");
  assert.match(code, /error: pubErr/, "the rpc error is discarded");
  assert.match(code, /approved: true/, "the two failures have different fixes and must be distinguishable");
});

test("the review screen keeps his text on screen when the edit failed", () => {
  // Closing the editor IS the success signal. A non-ok response is not a
  // throw, so the old code walked into the success path on a 500.
  const code = read("src/components/SaturdayReview.tsx");
  const i = code.indexOf("async function saveEdit");
  const body = code.slice(i, code.indexOf("async function approve"));
  const guard = body.indexOf("if (!res.ok)");
  const optimistic = body.indexOf("setDrafts(");
  assert.ok(guard > 0, "no failure branch");
  assert.ok(guard < optimistic, "the row repaints before the failure is known");
  assert.match(body.slice(guard, guard + 320), /window\.alert\(/);
  assert.match(body.slice(guard, guard + 320), /return;/);
});

test("a failed approval does not clear the queue off his screen", () => {
  const code = read("src/components/SaturdayReview.tsx");
  const i = code.indexOf("async function approve");
  const body = code.slice(i, i + 900);
  const guard = body.indexOf("if (!res.ok)");
  const clear = body.indexOf("setDrafts(");
  assert.ok(guard > 0 && guard < clear);
  assert.match(body.slice(guard, guard + 320), /window\.alert\(/);
});

// ── program-feedback ───────────────────────────────────────────────────────

test("the write that IS the answer is checked", () => {
  const code = read("src/app/api/program-feedback/route.ts");
  assert.match(code, /const \{ error: saveErr \} = await db/);
  const guard = code.indexOf("if (saveErr)");
  const ok = code.lastIndexOf("ok: true");
  assert.ok(guard > 0 && guard < ok);
});

test("`delivered` means it reached the inbox, not that we meant to send it", () => {
  const code = read("src/app/api/program-feedback/route.ts");
  assert.doesNotMatch(code, /delivered: substantive/, "that is the intent, not the outcome");
  assert.match(code, /let delivered = false;/);
  assert.match(code, /else delivered = true;/);
});

test("the best-effort writes can actually report a failure", () => {
  // Wrapping a PostgREST call in try/catch does nothing: it returns an error,
  // it does not throw. Both blocks needed the result captured to log at all.
  const code = read("src/app/api/program-feedback/route.ts");
  assert.match(code, /const \{ error: noteErr \} = await db\.from\("clients"\)\.update/);
  assert.match(code, /const \{ error: msgErr \} = await db\.from\("messages"\)\.insert/);
});

test("the client is told when their answer did not send", () => {
  const code = read("src/components/ProgrammingQuestion.tsx");
  const i = code.indexOf("async function submit");
  const body = code.slice(i, i + 900);
  const guard = body.indexOf("if (!res.ok)");
  const done = body.indexOf("setDone(true)");
  assert.ok(guard > 0, "no failure branch — the button just does nothing");
  assert.ok(guard < done);
  assert.match(body.slice(guard, guard + 320), /window\.alert\(/);
});

// ── challenge ──────────────────────────────────────────────────────────────

test("start does not create a second live challenge when it could not end the first", () => {
  const code = read("src/app/api/challenge/route.ts");
  const guard = code.indexOf("if (endErr)");
  const insert = code.indexOf('.insert({ title, metric');
  assert.ok(guard > 0, "the pre-close write is unchecked");
  assert.ok(guard < insert, "the new challenge is inserted before the old one is known to be closed");
});

test("joining forgives a duplicate and nothing else", () => {
  for (const file of ["src/app/api/challenge/route.ts", "src/components/GroupChallenge.tsx"]) {
    const code = read(file);
    assert.match(code, /error\.code !== "23505"/, `${file} still swallows every error`);
  }
});

test("a client with no profile is not told they joined", () => {
  // It used to write nothing at all and then set joined — the button said
  // You're in and the board never showed them.
  const code = read("src/components/GroupChallenge.tsx");
  const i = code.indexOf("async function join");
  const body = code.slice(i, code.indexOf("async function leave"));
  const guard = body.indexOf("if (!me)");
  const joined = body.indexOf("setJoined(true)");
  assert.ok(guard > 0 && guard < joined);
});

test("the join write is checked rather than left to a catch that cannot fire", () => {
  const code = read("src/components/GroupChallenge.tsx");
  const i = code.indexOf("async function join");
  const body = code.slice(i, code.indexOf("async function leave"));
  assert.match(body, /const \{ error \} = await supabase/);
  const guard = body.indexOf("if (error");
  const joined = body.indexOf("setJoined(true)");
  assert.ok(guard > 0 && guard < joined, "the button says joined before the insert is known to have landed");
});

for (const fn of ["start", "end", "leave"]) {
  test(`${fn} tells the person when it failed`, () => {
    const code = read("src/components/GroupChallenge.tsx");
    const i = code.indexOf(`async function ${fn}(`);
    assert.ok(i > 0, `${fn} not found`);
    const body = code.slice(i, i + 1100);
    assert.match(body, /if \(!res\.ok\)/, `${fn} does not check the response`);
    assert.match(body, /window\.alert\(/, `${fn} fails silently`);
  });
}
