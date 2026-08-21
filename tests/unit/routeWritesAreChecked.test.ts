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

// ── /api/video-candidates/decide — the promise in its own header ───────────
//
// That file opens with: "Approving is REVERSIBLE and the route makes sure of
// it." The promise lived entirely in one unchecked write — the one that marks
// the candidate approved and stashes the exercise's PREVIOUS video_url.
//
// If it failed: the exercise's video_url had already been updated (that write
// was checked), so the new clip was live in front of clients; the candidate
// stayed `pending`, so the undo path refuses outright ("That one was never
// approved"); and previous_video_url was never written, so the old URL existed
// nowhere. Live, wrong, and unrecoverable from the screen that did it.
//
// The undo path had the mirror fault: restoring the exercise was unchecked and
// marking the candidate pending was not, so a failed restore left the bad video
// in front of clients while the queue read as handled.

const DECIDE = read("src/app/api/video-candidates/decide/route.ts");

test("every write in the decide route captures its result", () => {
  const writes = (DECIDE.match(/\.(insert|update|delete|upsert)\(/g) || []).length;
  assert.ok(writes > 0);
  assert.equal((DECIDE.match(BARE_WRITE) || []).length, 0);
});

// The approve block, not the undo block — both have a `markErr`, and only one
// of them is the reversibility promise.
const APPROVE = DECIDE.slice(DECIDE.indexOf("if (c.duration_sec == null)"));

test("an approval that could not be recorded does not stand", () => {
  const i = APPROVE.indexOf("const { error: markErr }");
  assert.ok(i > 0, "the approval mark is unchecked again");
  const after = APPROVE.slice(i);
  assert.match(after, /if \(markErr\)/);
  // Rolled back rather than left live-and-un-undoable.
  assert.match(after, /update\(\{ video_url: previous \}\)/, "no rollback of the exercise");
});

test("when even the rollback fails, the previous URL is handed back", () => {
  // It exists nowhere else at that point. Without it the exercise cannot be
  // put right by hand either.
  const after = APPROVE.slice(APPROVE.indexOf("if (markErr)"));
  assert.match(after, /previous,/);
  assert.match(after, /live: true/);
});

test("a failed undo does not report the video as removed", () => {
  const i = DECIDE.indexOf('action === "undo"');
  const body = DECIDE.slice(i, DECIDE.indexOf("if (c.duration_sec == null)"));
  const guard = body.indexOf("if (restoreErr)");
  const mark = body.indexOf('status: "pending"');
  assert.ok(guard > 0, "the restore is unchecked again");
  assert.ok(guard < mark, "the candidate is marked pending before the video is known to be off");
});

test("a failed rejection is not reported as rejected", () => {
  const i = DECIDE.indexOf('action === "reject"');
  const body = DECIDE.slice(i, i + 600);
  assert.match(body, /const \{ error \} = await db/);
  assert.match(body, /Not rejected/);
});

// ── The two cron writers ───────────────────────────────────────────────────
//
// /api/cron/weekly-ai writes the Saturday focus drafts. Both draft writes were
// unchecked and `results.push({ status: "written" })` followed regardless, so a
// client whose draft never landed was reported as written. That is the worst
// possible place for it: the Saturday review screen renders NOTHING when there
// are no drafts, so a silent failure looks exactly like a quiet week — and the
// run report agreed with it. They now throw into the per-client catch that
// already records `status: "failed"` with a detail, so the summary names who
// has no draft.
//
// /api/ai-nudges never messages clients (that was deleted deliberately, and
// stays deleted). But `ai_nudge_log` IS the guardrail state: "one per client
// per 48h, max 3 per rolling 7 days" is computed by reading that table back. An
// unchecked insert does not lose a log line, it defeats a stated rule — the
// same client comes round again next run as though nothing happened. And the
// digest to Dustin, which is the entire output of the run, was inserted
// unchecked while the response reported `generated: N` to a caller nobody
// reads.

const WEEKLY = read("src/app/api/cron/weekly-ai/route.ts");
const NUDGES = read("src/app/api/ai-nudges/route.ts");

// Superseded 21 Aug. The approval step was retired -- "correct i dont need to
// approve if the ai is set up to be accurate based on real numbers" -- so the
// sweep writes no drafts at all and there is no draft write left to check.
// The stronger property is that it stays that way: a draft written now would
// go to a table nothing publishes and a review screen nothing mounts.
test("the sweep writes no focus drafts, so none can be silently lost", () => {
  assert.equal(
    (WEEKLY.match(/weekly_focus_drafts/g) || []).length,
    0,
    "the sweep is writing drafts again. Nothing publishes that table any more, so those lines would reach nobody.",
  );
});

test("the programming question can report a failure it could never report before", () => {
  assert.match(WEEKLY, /const \{ error: qErr \}/);
  assert.match(WEEKLY, /if \(qErr\) console\.error/);
});

test("every nudge-ledger write is checked, because the ledger IS the cooldown", () => {
  const bare = NUDGES.match(/(?<!=\s)await\s+admin\s*\n?\s*\.from\("ai_nudge_log"\)\s*\n?\s*\.insert\(/g) || [];
  assert.equal(bare.length, 0, `${bare.length} ledger writes still discard their result`);
  for (const name of ["escErr", "supErr", "logErr"]) {
    assert.match(NUDGES, new RegExp(`error: ${name}`), `${name} is gone — a ledger row is unchecked again`);
  }
});

test("a cooldown that was not recorded is reported to Dustin, not swallowed", () => {
  assert.match(NUDGES, /ledgerErrors\.push\(/);
  assert.match(NUDGES, /cooldowns are not recorded/);
});

test("a digest that never arrived is not reported as a successful run", () => {
  assert.match(NUDGES, /const \{ error: digestErr \}/);
  assert.match(NUDGES, /if \(digestErr\)/);
  const guard = NUDGES.indexOf("if (digestErr)");
  const ok = NUDGES.indexOf('mode: "digest_only"', guard);
  assert.ok(guard > 0 && ok > guard, "the success response is returned before the digest is known to have landed");
});

// ── The last three where a person was still being told something ──────────
//
// Found while checking a claim rather than asserting it. The sweep's remaining
// sites are meant to be genuine fire-and-forget, and three of them were not:
//
//   `ClientTakeovers.joinAndGo` — the full-screen "join the challenge" prompt.
//   Unchecked insert, `fx("complete")` regardless, straight to the group chat.
//   The client is told they joined a board that will never show them. Same
//   fault, same table, as the one in GroupChallenge that produced "twenty-three
//   people had joined and six were showing".
//
//   The two delete buttons in the log screen. A client deletes their own
//   weigh-in or cardio entry, watches the row vanish, and it is still there on
//   the next load — a lie about their own data, which is the one place it is
//   least forgivable.
//
// `MessageReactions` was checked and left alone on purpose: it re-reads the
// truth in a `finally` and undoes the optimistic change, which is a legitimate
// way to solve this and needs no error branch.

const TAKEOVERS = read("src/components/ClientTakeovers.tsx");
const LOGCLIENT = read("src/app/(app)/log/LogClient.tsx");

test("the takeover join forgives a duplicate and nothing else", () => {
  const i = TAKEOVERS.indexOf("async function joinAndGo");
  const body = TAKEOVERS.slice(i, i + 900);
  assert.match(body, /const \{ error \} = await supabase/, "the insert is unchecked again");
  assert.match(body, /error\.code !== "23505"/, "it swallows every error again");
  const guard = body.indexOf("if (error");
  const done = body.indexOf('fx("complete")');
  assert.ok(guard > 0 && guard < done, "the client is congratulated before the join is known to have landed");
});

for (const [what, table] of [
  ["a weigh-in", "metrics"],
  ["a cardio entry", "cardio_logs"],
] as const) {
  test(`deleting ${what} that did not delete leaves it on screen`, () => {
    const i = LOGCLIENT.indexOf(`from("${table}").delete()`);
    assert.ok(i > 0, `${table} delete not found`);
    const around = LOGCLIENT.slice(Math.max(0, i - 120), i + 400);
    assert.match(around, /const \{ error \} = await supabase/, `the ${table} delete is unchecked again`);
    const guard = around.indexOf("if (error)");
    const remove = around.indexOf("prev.filter");
    assert.ok(guard > 0 && guard < remove, "the row leaves the screen before the delete is known to have landed");
    assert.match(around.slice(guard, guard + 220), /window\.alert\(/);
  });
}

test("MessageReactions is left alone, because reconciling is a real answer", () => {
  // Its optimistic change is undone by re-reading in a finally. An error branch
  // on top would be a second mechanism for the same guarantee.
  const react = read("src/components/MessageReactions.tsx");
  assert.match(react, /await loadAll\(true\);/);
});
