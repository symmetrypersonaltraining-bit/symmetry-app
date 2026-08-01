import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAFT_STALE_MS, isDraftStale } from "../../src/lib/workoutDraft";

const NOW = 1_800_000_000_000;

test("the staleness window is 8 hours, matching what SessionDock has always used", () => {
  assert.equal(DRAFT_STALE_MS, 8 * 60 * 60 * 1000);
});

test("a draft saved seconds ago is live; one saved just past the window is not", () => {
  assert.equal(isDraftStale(NOW - 5_000, NOW), false);
  assert.equal(isDraftStale(NOW - (DRAFT_STALE_MS - 1), NOW), false);
  // Exactly at the boundary is still live — the check is strictly greater-than.
  assert.equal(isDraftStale(NOW - DRAFT_STALE_MS, NOW), false);
  assert.equal(isDraftStale(NOW - (DRAFT_STALE_MS + 1), NOW), true);
});

test("yesterday's abandoned session is stale — this is the case that locked Gerard in", () => {
  // He left a session open the previous evening; every relaunch restored sessionMode:true
  // and dropped him back into the full-screen logger with no way out.
  assert.equal(isDraftStale(NOW - 20 * 60 * 60 * 1000, NOW), true);
});

test("a draft with no usable savedAt is treated as stale, never as a live session", () => {
  // Drafts written before savedAt existed, or corrupted ones. Failing this direction hands
  // the client back to the overview with their sets intact; failing the other direction
  // re-locks them into a screen they cannot leave.
  for (const bad of [undefined, null, 0, NaN, Infinity, "1800000000000", {}, []]) {
    assert.equal(isDraftStale(bad, NOW), true, `expected stale for ${String(bad)}`);
  }
});

test("a savedAt in the future (device clock skew) is not stale", () => {
  assert.equal(isDraftStale(NOW + 60 * 60 * 1000, NOW), false);
});

test("defaults to the real clock when no now is supplied", () => {
  assert.equal(isDraftStale(Date.now()), false);
  assert.equal(isDraftStale(Date.now() - (DRAFT_STALE_MS + 10_000)), true);
});
