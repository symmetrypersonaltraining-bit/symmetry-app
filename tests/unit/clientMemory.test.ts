import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { memoryBlock, shouldFold, type ClientMemory } from "../../src/lib/ai/clientMemory";

const ROOT = process.cwd();
const ACT = fs.readFileSync(path.join(ROOT, "src/app/api/nutrition-ai/act/route.ts"), "utf8");
const MEM = fs.readFileSync(path.join(ROOT, "src/lib/ai/clientMemory.ts"), "utf8");

const base: ClientMemory = { summary: "", facts: [], foldedThrough: null, turnCount: 0 };

// Dustin, 2026-08-13: "It needs to be permanent, so it always remembers what
// it talked about with them and uses that data for each client individually."
//
// Before this, ai_chat_sessions had zero rows for every client, ever, and the
// coach sheet said so in a comment: "Fresh conversation each open (no
// persistence tonight)."

test("a client with nothing said yet gets no memory heading at all", () => {
  // An empty "WHAT YOU REMEMBER: (nothing)" block invites the model to open by
  // remarking on how little it knows them, which is the opposite of the point.
  assert.equal(memoryBlock(base), "");
  assert.equal(memoryBlock({ ...base, summary: "   " }), "");
});

test("facts carry the date they were said, so the coach can place them in time", () => {
  const block = memoryBlock({
    ...base,
    summary: "Trains four mornings a week before work.",
    facts: [{ fact: "Travels for work most Tuesdays", said_on: "2026-09-04" }],
  });
  assert.match(block, /Trains four mornings/);
  assert.match(block, /Travels for work most Tuesdays/);
  assert.match(block, /2026-09-04/, "a fact with no date reads as a timeless assertion");
  assert.match(block, /Do not recite it back/, "without this the coach opens every chat by listing what it remembers");
});

test("a fact with no date still renders, without a dangling bracket", () => {
  const block = memoryBlock({ ...base, facts: [{ fact: "Hates cottage cheese", said_on: "" }] });
  assert.match(block, /- Hates cottage cheese$/m);
  assert.doesNotMatch(block, /\(they said this on \)/);
});

test("the first exchange folds immediately; after that it waits", () => {
  // The first thing someone says is usually the thing that shapes everything
  // after it. Waiting sixteen turns to notice it is sixteen turns of a coach
  // that does not know them.
  assert.equal(shouldFold(base, 2), true, "a brand-new client's first exchange is not being folded");
  assert.equal(shouldFold(base, 0), false, "folding with nothing new burns a call for no reason");

  const known = { ...base, foldedThrough: "2026-08-01T00:00:00Z" };
  assert.equal(shouldFold(known, 4), false, "folding on every message would cost a call per question");
  assert.equal(shouldFold(known, 16), true, "a long conversation is outrunning its own summary");
});

test("earlier conversations survive the second message of a session", () => {
  // The first cut loaded the transcript only when no live thread existed. That
  // meant the coach remembered you on your first question of a session and
  // forgot you on your second — the worst of both, and invisible in testing
  // because the first message always worked.
  assert.doesNotMatch(
    ACT,
    /const priorTurns = history\.length \? \[\] :/,
    "the transcript is dropped as soon as a live thread exists; earlier conversations vanish mid-session"
  );
  assert.match(ACT, /liveText\.has/, "prior turns are no longer de-duplicated against the live thread");
});

test("the exchange is stored, and awaited, before the response returns", () => {
  assert.match(ACT, /await persist\(/, "persisting is not awaited — a serverless function is frozen the moment it responds");
  const persistAt = ACT.indexOf("await persist(");
  const returnAt = ACT.indexOf("return NextResponse.json({ intent: \"none\", message: coach.value.message");
  assert.ok(persistAt > -1 && returnAt > -1);
  assert.ok(persistAt < returnAt, "the turn is recorded after the response is already sent, so it never lands");
});

test("nothing about memory can cost a client their answer", () => {
  // Every read degrades to "remembers nothing this time"; every write is
  // swallowed. The reply is already in hand by then.
  for (const fn of ["loadMemory", "loadRecentTurns", "recordTurns", "foldMemory", "countUnfolded"]) {
    const at = MEM.indexOf(`export async function ${fn}`);
    assert.ok(at > -1, `${fn} is gone`);
    const body = MEM.slice(at, MEM.indexOf("\n}", at));
    assert.match(body, /catch/, `${fn} can throw, and it runs on the path that answers a client`);
  }
});

test("a failed fold retries the same turns instead of losing them", () => {
  const fold = MEM.slice(MEM.indexOf("export async function foldMemory"));
  const setAt = fold.indexOf("folded_through: newest");
  const upsertAt = fold.indexOf('.upsert(');
  assert.ok(setAt > -1 && upsertAt > -1);
  assert.ok(
    fold.indexOf("if (!res.value) return false;") < upsertAt,
    "folded_through advances before the model has produced anything — those turns would be skipped forever"
  );
});

test("the memory prompt refuses to duplicate what the coach already reads live", () => {
  // Summarising macros and adherence into memory means the coach carries a
  // month-old copy of numbers it can read fresh, and the stale one wins
  // arguments it should not.
  assert.match(MEM, /Memory is for what they SAID, not what they DID/);
  assert.match(MEM, /Medical conclusions/, "the fold is free to write a diagnosis into a client's permanent record");
});
