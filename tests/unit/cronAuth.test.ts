import test from "node:test";
import assert from "node:assert/strict";
import { isCronRequest } from "../../src/lib/cron-auth";

// Four cron-gated routes had four different answers to "is this the scheduler?",
// and two were wrong in opposite directions — one 401'd Vercel itself, one let
// the whole internet in. These tests pin both failure modes shut.

function req(headers: Record<string, string> = {}, url = "https://x.test/api/thing"): {
  headers: { get(n: string): string | null };
  url: string;
} {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { headers: { get: (n: string) => lower[n.toLowerCase()] ?? null }, url };
}

function withSecret<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.CRON_SECRET;
  if (value === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
}

test("Vercel's own scheduler is recognised even with no secret configured", () => {
  // The weekly-ai bug: `if (!secret) return false` 401'd the platform's own
  // cron, so the Sunday sweep silently never ran. CRON_SECRET is not set on
  // this project, so this is the state that actually matters.
  withSecret(undefined, () => {
    assert.equal(isCronRequest(req({ "x-vercel-cron": "1" })), true);
  });
});

test("an unset secret grants nothing — it must never fail open", () => {
  // The gcal-sync bug: `if (SECRET && auth !== ...)` skipped the guard entirely
  // when the variable was missing, leaving a route that writes appointments and
  // payment rows callable by anyone.
  withSecret(undefined, () => {
    assert.equal(isCronRequest(req()), false);
    assert.equal(isCronRequest(req({ authorization: "Bearer hunter2" })), false);
    assert.equal(isCronRequest(req({ "x-cron-secret": "hunter2" })), false);
    assert.equal(isCronRequest(req({}, "https://x.test/api/thing?secret=hunter2")), false);
  });
});

test('"Bearer undefined" never authenticates', () => {
  // The reminders/send bug: comparing against `Bearer ${process.env.CRON_SECRET}`
  // with the variable unset compared against this literal string, so sending it
  // was the password.
  withSecret(undefined, () => {
    assert.equal(isCronRequest(req({ authorization: "Bearer undefined" })), false);
  });
  // And the same if someone sets the variable to the string "undefined".
  withSecret("undefined", () => {
    assert.equal(isCronRequest(req({ authorization: "Bearer undefined" })), false);
    assert.equal(isCronRequest(req({ "x-cron-secret": "undefined" })), false);
  });
});

test("a configured secret is accepted in bearer, header and query form", () => {
  withSecret("s3cret", () => {
    assert.equal(isCronRequest(req({ authorization: "Bearer s3cret" })), true);
    assert.equal(isCronRequest(req({ "x-cron-secret": "s3cret" })), true);
    assert.equal(isCronRequest(req({}, "https://x.test/api/thing?secret=s3cret")), true);
    // Near-misses stay out.
    assert.equal(isCronRequest(req({ authorization: "Bearer s3cre" })), false);
    assert.equal(isCronRequest(req({ authorization: "s3cret" })), false);
    assert.equal(isCronRequest(req({}, "https://x.test/api/thing?secret=nope")), false);
  });
});

test("a malformed url does not throw its way past the guard", () => {
  withSecret("s3cret", () => {
    assert.equal(isCronRequest(req({}, "not a url")), false);
  });
});
