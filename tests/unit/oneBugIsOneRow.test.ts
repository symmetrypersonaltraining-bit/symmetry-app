import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  errorFingerprint,
  normalizeErrorMessage,
  normalizePath,
} from "../../src/lib/errorFingerprint";

/**
 * ONE BUG IS ONE ROW.
 *
 * Dustin, 10 Sep 2026, asking for the log: *"anytime something goes wrong or
 * errors or there's a bug, you can look back at the actual log of when it
 * happened and what happened ... and we don't keep running into the same
 * problems."*
 *
 * The reason the app did not already have this is written into the migration
 * that declined to build it. 20260826e, deliberately narrow: *"Anything broader
 * becomes a table nobody reads, which is where the integrity checker sat for
 * ten days."*
 *
 * That fear is correct, and the fingerprint is the entire answer to it. One
 * screen a client opens forty times a day, failing every time, must be ONE row
 * saying 40 — not forty rows burying the fault underneath them.
 *
 * So this file pins the two ways the grouping can break, because they are
 * opposite failures and a plausible-looking normaliser can have either:
 *
 *   TOO SPECIFIC — every occurrence lands in its own row and the log is the
 *   table nobody reads. This is the likely one: real error messages carry row
 *   ids, set numbers and timestamps, and every one of those varies per hit.
 *
 *   TOO LOOSE — two genuinely different faults share a row, so the count is a
 *   lie and fixing one appears to fix both.
 */

test("the SAME fault with different ids groups into one row", () => {
  // The shape of a real postgrest refusal: same fault, different row each time.
  const first = errorFingerprint({
    scope: "set_log",
    message:
      'new row violates row-level security policy for table "set_logs" (id 3f2a91c4-77bd-4e1a-9c31-5d8e2b0f4a76)',
    path: "/workout/9a1c7e52-3b44-4d8f-a1e2-7c6b5f0d9e33",
  });
  const second = errorFingerprint({
    scope: "set_log",
    message:
      'new row violates row-level security policy for table "set_logs" (id 81be0d37-2c95-4f6a-b0d1-e4a7c93f2b58)',
    path: "/workout/44f0a9d1-8e27-4b53-9fa6-2c1d7e08b465",
  });

  assert.equal(
    first,
    second,
    "two hits of one RLS refusal must group — otherwise every failed set is its own row",
  );
});

test("set numbers and counts do not split one fault across rows", () => {
  const a = errorFingerprint({ scope: "bulk_set_log", message: "upsert affected 0 of 3 rows", path: "/workout/x" });
  const b = errorFingerprint({ scope: "bulk_set_log", message: "upsert affected 0 of 12 rows", path: "/workout/x" });
  assert.equal(a, b, "'0 of 3' and '0 of 12' are the same bug with different sets");
});

test("two genuinely different faults do NOT share a row", () => {
  const rls = errorFingerprint({
    scope: "set_log",
    message: 'new row violates row-level security policy for table "set_logs"',
    path: "/workout/x",
  });
  const network = errorFingerprint({
    scope: "set_log",
    message: "Failed to fetch",
    path: "/workout/x",
  });
  assert.notEqual(rls, network, "an RLS refusal and a dropped request are not the same problem");
});

test("the same message from different scopes stays separate", () => {
  const render = errorFingerprint({ scope: "render", message: "undefined is not a function", path: "/nutrition" });
  const rejection = errorFingerprint({ scope: "rejection", message: "undefined is not a function", path: "/nutrition" });
  assert.notEqual(render, rejection, "a render crash and an unhandled rejection are different faults");
});

test("the same fault on two different screens stays separate", () => {
  const onNutrition = errorFingerprint({ scope: "render", message: "cannot read properties of null", path: "/nutrition" });
  const onSchedule = errorFingerprint({ scope: "render", message: "cannot read properties of null", path: "/schedule" });
  assert.notEqual(onNutrition, onSchedule, "the screen is part of what the fault IS");
});

test("a route param is one screen, not one screen per id", () => {
  assert.equal(normalizePath("/workout/9a1c7e52-3b44-4d8f-a1e2-7c6b5f0d9e33"), "/workout/:id");
  assert.equal(normalizePath("/clients/12345/notes"), "/clients/:n/notes");
  // A query string is not part of the screen's identity.
  assert.equal(normalizePath("/workout/abc?forClient=99"), "/workout/abc");
});

test("normalisation strips what varies and keeps what identifies", () => {
  const n = normalizeErrorMessage(
    'insert into "meal_items" failed at 2026-09-10T14:22:05Z for 3f2a91c4-77bd-4e1a-9c31-5d8e2b0f4a76, 27 rows',
  );
  // The varying parts are gone...
  assert.ok(!n.includes("3f2a91c4"), "uuid must be stripped");
  assert.ok(!n.includes("2026-09-10"), "timestamp must be stripped");
  assert.ok(!/\b27\b/.test(n), "row count must be stripped");
  // ...and the part that says which fault this is survives.
  assert.ok(n.includes("insert into"), "the fault's own words must survive");
  assert.ok(n.includes("failed at"), "the fault's own words must survive");
});

test("a fingerprint is stable and short enough to index", () => {
  const fp = errorFingerprint({ scope: "render", message: "boom", path: "/home" });
  assert.match(fp, /^[0-9a-f]{8}$/, "8 hex chars, so the unique index stays cheap");
  assert.equal(fp, errorFingerprint({ scope: "render", message: "boom", path: "/home" }), "must be deterministic");
});

/**
 * THE REPORTER MUST NOT BE ABLE TO BREAK THE APP.
 *
 * logClientError has always ended in a bare catch, and the reason is in its own
 * header: *"a logger that can be broken by its own error reporting is worse
 * than one that reports nothing."* The new reporter is mounted in the ROOT
 * layout and runs on every screen, so that property matters more now than it
 * did when three call sites used it.
 *
 * A source-reading test cannot tell code from comments — a lesson already paid
 * for in this repo — so the comments come out before anything is asserted.
 */
function withoutComments(file: string): string {
  return readFileSync(join(process.cwd(), file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("every path that reports an error swallows its own failure", () => {
  for (const file of ["src/lib/logAppError.ts", "src/components/ErrorReporter.tsx"]) {
    const src = withoutComments(file);
    assert.ok(/catch\s*(\([^)]*\))?\s*\{/.test(src), `${file} must catch its own failures`);
    assert.ok(!/\bthrow\b/.test(src), `${file} must never throw — it runs on the error path`);
  }
});

test("the browser reporter survives the navigation that follows a crash", () => {
  const src = withoutComments("src/lib/logAppError.ts");
  // A plain fetch is abandoned when the page goes away, and a crash is very
  // often followed by a reload — so the worst faults would be the ones least
  // likely to be reported.
  assert.ok(src.includes("sendBeacon"), "must use sendBeacon so the browser finishes the request");
  assert.ok(src.includes("keepalive"), "the fetch fallback must set keepalive");
});

test("one bug cannot flood a client's phone data", () => {
  const src = withoutComments("src/lib/logAppError.ts");
  // An error inside a React render fires on EVERY render. Without a throttle
  // that is a network request per frame, on a phone, on mobile data.
  assert.ok(/THROTTLE_MS|throttle/i.test(src), "repeat reports must be throttled client-side");
});

test("the client is never trusted to say which client it is", () => {
  const src = withoutComments("src/app/api/log-error/route.ts");
  assert.ok(
    src.includes("auth.getUser"),
    "identity must come from the session, not the payload — a log writable into someone else's name is worse than none",
  );
});
