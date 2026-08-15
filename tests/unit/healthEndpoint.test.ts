// Guard: /api/health must fail on SLOWNESS, not only on errors.
//
// This is the whole reason the endpoint exists. During the 15 Aug outage every
// dependency returned the CORRECT answer — auth took 10–65 seconds to do it and
// the database took 4.6s to plan a 31-page index scan, but nothing errored. A
// health check that only asks "did it answer" would have been green all night
// while clients got 504s.
//
// So the tests that matter here are the slow ones.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { probe, PROBE_TIMEOUT_MS, PROBE_SLOW_MS } from "../../src/lib/health";

const SRC = readFileSync(join(process.cwd(), "src/app/api/health/route.ts"), "utf8");
const LIB = readFileSync(join(process.cwd(), "src/lib/health.ts"), "utf8");

/** A fetch that resolves after `ms` of fake time, respecting the abort signal. */
function slowFetch(ms: number, status = 200) {
  return (signal: AbortSignal) =>
    new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => resolve(new Response(null, { status })), ms);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
}

test("a fast healthy dependency passes, and is not marked slow", async () => {
  const r = await probe(slowFetch(0), Date.now, 200, 100);
  assert.equal(r.ok, true);
  assert.equal(r.slow, undefined);
});

test("an answer that arrives slowly is flagged slow but still ok", async () => {
  // The amber case: working, but not the way it works on a good day.
  let t = 0;
  const r = await probe(slowFetch(0), () => (t += 2_000), 60_000, 1_500);
  assert.equal(r.ok, true, "a slow answer is still an answer");
  assert.equal(r.slow, true, "…but the monitor has to be able to see it");
});

test("an answer slower than the deadline FAILS — the outage case", async () => {
  // 15 Aug: auth answered in 10–65s. This is that, compressed.
  const r = await probe(slowFetch(10_000), Date.now, 120, 50);
  assert.equal(r.ok, false, "if this passes, the monitor sleeps through the next outage");
  assert.match(r.error || "", /timeout after 120ms/);
});

test("an HTTP error fails, and says which status", async () => {
  const r = await probe(slowFetch(0, 503), Date.now, 500, 200);
  assert.equal(r.ok, false);
  assert.equal(r.error, "http 503");
});

test("a thrown connection fault fails without taking the endpoint down with it", async () => {
  const r = await probe(() => Promise.reject(new Error("ECONNREFUSED")), Date.now, 500, 200);
  assert.equal(r.ok, false);
  assert.equal(r.error, "ECONNREFUSED");
  assert.doesNotMatch(r.error, /timeout/, "a refused connection is not a timeout — they lead elsewhere");
});

test("probe never rejects, whatever the fetch does", async () => {
  // The endpoint's own robustness: a health check that 500s is not a health check.
  for (const bad of [
    () => Promise.reject(new Error("boom")),
    () => Promise.reject("a string, not an Error"),
    () => Promise.reject(undefined),
  ]) {
    const r = await probe(bad as (s: AbortSignal) => Promise<Response>, Date.now, 500, 200);
    assert.equal(r.ok, false);
  }
});

test("the two probes run concurrently, not one after the other", () => {
  // Serially, two 5s deadlines make a 10s health check — and a monitor with a
  // 10s timeout of its own would then report an outage caused by the check.
  assert.match(
    SRC.replace(/^\s*\*.*$/gm, ""),
    /await Promise\.all\(\[/,
    "the auth and db probes must be awaited together"
  );
});

test("the deadline is tighter than a typical monitor's own timeout", () => {
  // Better Stack / UptimeRobot default to 10–30s. If our deadline were looser
  // than theirs, they would time us out first and we would learn nothing.
  assert.ok(PROBE_TIMEOUT_MS <= 10_000, "deadline must beat the monitor's own");
  assert.ok(PROBE_SLOW_MS < PROBE_TIMEOUT_MS, "the amber line has to sit below the red one");
});

test("missing env vars are an outage, not a pass", () => {
  // A deploy that lost its Supabase keys serves 500s to every client. If the
  // health check shrugged at that it would be green through the worst case.
  const body = SRC.replace(/^\s*\*.*$/gm, "");
  assert.match(body, /missing env/, "the endpoint must report missing configuration");
  assert.match(body, /status: 503/, "…and report it as a failure");
});

test("the endpoint returns 503 when a check fails, so status-code monitors see it", () => {
  const body = SRC.replace(/^\s*\*.*$/gm, "");
  assert.match(body, /status: ok \? 200 : 503/);
});

test("no client data is returned", () => {
  // This URL is public — middleware allowlists all of /api/ — and may end up on
  // a status page. The db probe proves a round trip; it must not read a body.
  const body = (SRC + LIB).replace(/^\s*\*.*$/gm, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(body, /\.json\(\)/, "the probe response body must never be parsed");
  assert.doesNotMatch(body, /\.text\(\)/, "the probe response body must never be parsed");
  assert.match(body, /select=id&limit=1/, "the db probe should ask for as little as possible");
});

test("the service key is used for the db probe and never put in the response", () => {
  const body = SRC.replace(/^\s*\*.*$/gm, "").replace(/\/\/.*$/gm, "");
  // It has to be used — anon hits RLS and would fail for reasons unrelated to health.
  assert.match(body, /SUPABASE_SERVICE_ROLE_KEY/);
  // …but the only things that reach the JSON body are these.
  const returned = body.match(/NextResponse\.json\(\s*\{[^}]*/g) || [];
  for (const r of returned) {
    assert.doesNotMatch(r, /service|anon|KEY/i, `a key leaked into a response: ${r}`);
  }
});
