// Guard: the AI can see what the client actually lifted.
//
// Dustin, 15 Aug: the AI "should know everything about every client... cut back
// massive amounts of busy work for me answering questions the ai could just
// answer using the real data in the system."
//
// Audited that night. Every client-facing AI surface knew the programme, the
// meal plan, the targets and the goal — and NOT ONE could see a single logged
// set. The database holds 8,406 of them, 5,524 in the last thirty days, across
// 29 clients. "What did I press last time?" — the most ordinary question anyone
// asks in a gym, and one the app already knew the answer to — got a deflection,
// or got asked of Dustin.
//
// These tests are behavioural where it matters: the formatter runs against real
// row shapes rather than being described. A context builder tested only by
// grepping for an import is a context builder that can silently render nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { trainingHistoryBlock } from "../../src/lib/ai/trainingHistory";

/** Minimal stand-in for the query chain the block uses. */
function fakeDb(rows: unknown[] | null, opts: { throws?: boolean } = {}) {
  const result = { data: rows };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order"]) {
    chain[m] = () => {
      if (opts.throws) throw new Error("db exploded");
      return chain;
    };
  }
  chain.limit = async () => {
    if (opts.throws) throw new Error("db exploded");
    return result;
  };
  return { from: () => chain } as never;
}

const set = (over: Record<string, unknown> = {}) => ({
  logged_at: "2026-08-13T10:00:00+00:00",
  set_number: 1,
  reps: 8,
  weight_lbs: 185,
  duration_seconds: null,
  distance_meters: null,
  rpe: null,
  exercises: { name: "Barbell Bench Press" },
  ...over,
});

test("a client with no logged sets contributes nothing, not an empty heading", async () => {
  // An empty section is worse than no section: it tells the model the data was
  // looked for and found absent, which reads as 'they have not trained'.
  assert.equal(await trainingHistoryBlock(fakeDb([]), "c1"), "");
  assert.equal(await trainingHistoryBlock(fakeDb(null), "c1"), "");
});

test("a database failure degrades to nothing, never to an exception", async () => {
  // An AI answer missing this block is worse than one with it. An AI answer
  // that never arrives because a history query threw is worse than both.
  assert.equal(await trainingHistoryBlock(fakeDb(null, { throws: true }), "c1"), "");
});

test("it answers 'what did I use last time' with the load and the date", async () => {
  const out = await trainingHistoryBlock(fakeDb([set()]), "c1");
  assert.match(out, /LAST LOGGED SET PER MOVEMENT/);
  assert.match(out, /Barbell Bench Press — 185 lb × 8 \(2026-08-13\)/);
});

test("the heaviest set of the most recent day wins, not the first or the warm-up", async () => {
  // "What did I use" means the working set. Ordering by whatever the database
  // returned would answer with a warm-up about a third of the time.
  const out = await trainingHistoryBlock(
    fakeDb([
      set({ set_number: 1, weight_lbs: 135, reps: 10 }),
      set({ set_number: 2, weight_lbs: 225, reps: 5 }),
      set({ set_number: 3, weight_lbs: 185, reps: 8 }),
    ]),
    "c1"
  );
  assert.match(out, /Barbell Bench Press — 225 lb × 5/);
  assert.ok(!/Bench Press — 135 lb/.test(out.split("LAST LOGGED SET")[1]));
});

test("a more recent lighter day beats an older heavier one, whatever order rows arrive in", async () => {
  // Recency first, weight only as the tie-break WITHIN a day. Otherwise a PR
  // from two months ago is reported as "last time".
  //
  // The rows are deliberately fed OLDEST FIRST. The first version of this test
  // fed them newest-first — matching the query's own `order(logged_at desc)` —
  // and so it passed even with the recency comparison disabled. It was proving
  // the query's ORDER BY, not the code's logic, and it did not bite under
  // mutation. If someone later drops or changes that ordering, this is the test
  // that has to notice.
  const oldestFirst = [
    set({ logged_at: "2026-06-01T10:00:00+00:00", weight_lbs: 275, reps: 3 }),
    set({ logged_at: "2026-08-13T10:00:00+00:00", weight_lbs: 155, reps: 10 }),
  ];
  const out = await trainingHistoryBlock(fakeDb(oldestFirst), "c1");
  assert.match(out, /Barbell Bench Press — 155 lb × 10 \(2026-08-13\)/);

  // And newest-first gives the same answer, so the result does not depend on
  // which way the rows came back.
  const newestFirst = await trainingHistoryBlock(fakeDb([...oldestFirst].reverse()), "c1");
  assert.match(newestFirst, /Barbell Bench Press — 155 lb × 10 \(2026-08-13\)/);
});

test("sets with no load are described honestly rather than as zero", async () => {
  // Bands and bodyweight have reps and no weight; rendering "0 lb" is a small
  // lie the model will repeat with confidence.
  const out = await trainingHistoryBlock(
    fakeDb([set({ exercises: { name: "Band Pull Apart" }, weight_lbs: null, reps: 20 })]),
    "c1"
  );
  assert.match(out, /Band Pull Apart — 20 reps/);
  assert.ok(!/0 lb/.test(out), "a set with no recorded load must not read as zero pounds");
});

test("a timed set reads as a time, not as a rep count", async () => {
  const out = await trainingHistoryBlock(
    fakeDb([
      set({ exercises: { name: "Outdoor Walk" }, weight_lbs: null, reps: null, duration_seconds: 1384 }),
    ]),
    "c1"
  );
  assert.match(out, /Outdoor Walk — 23:04/);
});

test("sets are grouped by session and by movement, not listed one per line", async () => {
  // Five sets of one exercise should read as one entry. Otherwise a single
  // session floods the context and crowds out everything else.
  const out = await trainingHistoryBlock(
    fakeDb([
      set({ set_number: 1, weight_lbs: 185, reps: 8 }),
      set({ set_number: 2, weight_lbs: 185, reps: 8 }),
      set({ set_number: 3, weight_lbs: 185, reps: 7 }),
    ]),
    "c1"
  );
  const sessions = out.split("LAST LOGGED SET")[0];
  const lines = sessions.split("\n").filter((l) => l.startsWith("· "));
  assert.equal(lines.length, 1, "one session should be one line");
  assert.match(lines[0], /Barbell Bench Press 185 lb × 8, 185 lb × 8, 185 lb × 7/);
});

test("it tells the model what its silence means", async () => {
  // Without this the model treats 'not in the list' as 'no information' and
  // invents a plausible number, which is the failure this whole file is about.
  const out = await trainingHistoryBlock(fakeDb([set()]), "c1");
  assert.match(out, /say so rather than guessing a number/);
});

test("both client-facing contexts actually assemble it", () => {
  // The formatter being right is useless if nothing calls it. Both surfaces:
  // the ✦ drawer (assistantContext) and the ✦ Coach (coach-context).
  const A = readFileSync(join(process.cwd(), "src/lib/ai/assistantContext.ts"), "utf8");
  assert.match(A, /trainingHistoryBlock\(db, clientId\)/, "the ✦ drawer no longer loads training history");
  assert.match(A, /if \(history\) lines\.push\(history\)/, "the ✦ drawer loads it but never adds it");

  const C = readFileSync(join(process.cwd(), "src/lib/ai/coach-context.ts"), "utf8");
  assert.match(C, /trainingHistoryBlock\(db, clientId\)/, "the ✦ Coach no longer loads training history");
  assert.match(C, /if \(trainingHistory\) lines\.push\(trainingHistory\)/, "the ✦ Coach loads it but never adds it");
});
