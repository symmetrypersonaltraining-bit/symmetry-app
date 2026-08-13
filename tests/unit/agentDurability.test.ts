import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// The trainer agent had ONE recorded call in the app's entire history, and
// ai_chat_sessions had zero rows. Dustin: "I tried it once and after the first
// sentence it couldn't recall what I needed it to do."
//
// It was three faults stacked, and they covered for each other:
//
//   1. the tool loop gave up after N rounds and returned a canned line that
//      SOUNDED like an offer to continue — "That took several steps, tell me
//      the next thing and I'll keep going";
//   2. that give-up branch was the ONE exit path that never called
//      saveSession, so the conversation was discarded at the exact moment the
//      reply promised to continue it;
//   3. the route set no maxDuration at all, so fourteen sequential Sonnet
//      calls ran on the platform default — while every cron in the app sets
//      60s or 300s.
//
// None of that is visible in a diff of any single line. These tests pin the
// shape of the fix.

const ROOT = process.cwd();
const AGENT = fs.readFileSync(path.join(ROOT, "src/app/api/agent/route.ts"), "utf8");
const SESSION = fs.readFileSync(path.join(ROOT, "src/app/api/agent/session/route.ts"), "utf8");

test("the agent sets a maxDuration — it is the longest-running route in the app", () => {
  const m = AGENT.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
  assert.ok(m, "no maxDuration on /api/agent: a multi-round tool loop on the platform default will be cut off mid-task");
  assert.ok(
    Number(m![1]) >= 120,
    `maxDuration is ${m![1]}s — too short for a tool loop that can make ${"MAX_TOOL_ROUNDS"} Sonnet calls`
  );
});

test("every exit path saves the conversation", () => {
  // Count the ways out of the handler and the saves that cover them. The
  // failure mode here is subtle: a NEW early return that skips saveSession
  // reintroduces exactly the amnesia this test exists to prevent.
  const returns = (AGENT.match(/return NextResponse\.json/g) || []).length;
  const saves = (AGENT.match(/await saveSession\(/g) || []).length;
  assert.ok(
    saves >= 3,
    `only ${saves} saveSession call(s) for ${returns} returns — the success path, the ` +
      `out-of-rounds path and the error path must each persist the thread`
  );
});

test("the out-of-rounds reply is not the canned line that discarded the work", () => {
  // Strip comments first: the fix documents the old line by quoting it, and a
  // naive search matches its own explanation. Only real code counts.
  const code = AGENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(
    code,
    /tell me the next thing and I'll keep going/i,
    "the old give-up line is back in the code — it reads as an offer to continue while the route throws the thread away"
  );
});

test("the error path records the failure and the tokens it already spent", () => {
  assert.match(AGENT, /logFailure\(/, "agent failures are not recorded");
  const failCall = AGENT.slice(AGENT.indexOf("logFailure("));
  assert.match(
    failCall.slice(0, 300),
    /tokensIn/,
    "tokens spent before the failure must be recorded, or the kill switch under-counts"
  );
});

test("the session is a rolling thread, not one that silently expires", () => {
  // The old behaviour returned `{ messages: [] }` past 12 hours — the thread
  // vanished with no indication it had existed.
  assert.doesNotMatch(
    SESSION,
    /return NextResponse\.json\(\{\s*messages:\s*\[\],\s*stale:\s*true\s*\}\)/,
    "the session route still throws away a stale thread instead of flagging it"
  );
  assert.match(SESSION, /stale/, "the route should still tell the client when a thread is old");
});
