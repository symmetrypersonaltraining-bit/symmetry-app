// CLIENT VIEW HAS TO MEAN WHAT IT SAYS.
//
// Dustin, 7 Sep, with another client's full profile page on his screen while
// signed into Client View: *"why am I seeing this while signed into my client
// view?"*
//
// Client View was chrome. The toggle swapped the header and the bottom nav and
// set `symmetry_client_mode=1`; the pages shared between both audiences read
// that cookie and rendered their client branch. The trainer-only pages never
// read it — they gate on WHO THE ACCOUNT IS, which is still a trainer in client
// view — so any way of reaching one of those URLs rendered the whole trainer
// page inside the client shell.
//
// No client could ever see it (the page redirects a non-trainer, and RLS gives
// a client only their own row), but a preview mode that shows you things a
// client cannot see is no use for checking what a client sees.
//
// Two halves, both checked here: the path matcher, and the fact that BOTH of
// the middleware's trainer early-returns go through the guard. The second is a
// source-order test in the spirit of middlewareAsksAuthLast — the property is
// "no way out of this function skips the check", and a refactor that adds a
// third early return is exactly what would undo it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isTrainerOnlyPath, TRAINER_ONLY_PREFIXES } from "../../src/middleware.ts";

test("the page he was actually looking at is blocked", () => {
  // /clients/<uuid> — the client profile page in the screenshot.
  assert.equal(isTrainerOnlyPath("/clients/84bd4728-e7f4-418a-ae6b-ddbb94c97654"), true);
  assert.equal(isTrainerOnlyPath("/clients"), true);
});

test("every trainer-only area is covered, not just the one that was reported", () => {
  for (const p of ["/payments", "/library/exercises", "/assessment",
                   "/settings/data-health", "/settings/ai-health",
                   "/clients/abc/program", "/clients/abc/day/xyz"]) {
    assert.equal(isTrainerOnlyPath(p), true, p + " should be trainer-only");
  }
});

test("the client's own screens are untouched", () => {
  for (const p of ["/home", "/nutrition", "/progress", "/messages", "/settings",
                   "/schedule", "/movement", "/recipes", "/profile", "/tutorial"]) {
    assert.equal(isTrainerOnlyPath(p), false, p + " must stay reachable in client view");
  }
});

test("the workout logger is deliberately NOT blocked", () => {
  // A trainer logs a client's session at /workout?forClient=<id>, and both
  // loggers are off limits without Dustin's per-item say-so. Blocking it would
  // break real work to fix a cosmetic boundary.
  assert.equal(isTrainerOnlyPath("/workout"), false);
  assert.equal(isTrainerOnlyPath("/workout/some-day-id"), false);
  assert.ok(!TRAINER_ONLY_PREFIXES.includes("/workout"));
});

test("a prefix does not swallow a longer unrelated path", () => {
  // "/clients" must not match "/clientsomething".
  assert.equal(isTrainerOnlyPath("/clientsomething"), false);
  assert.equal(isTrainerOnlyPath("/library-public"), false);
});

test("BOTH trainer early-returns in the middleware go through the guard", () => {
  const src = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");

  // The decision is settled before the first of them.
  const decidedAt = src.indexOf("const blockedInClientView =");
  const bakedInAt = src.indexOf("if (bakedIn) return");
  assert.ok(decidedAt > -1, "blockedInClientView is not computed");
  assert.ok(bakedInAt > decidedAt, "the guard is settled after the first trainer return");

  // Neither trainer return hands back the response unguarded.
  assert.ok(
    /if \(bakedIn\) return blockedInClientView \?/.test(src),
    "the build-time trainer list returns without the client-view guard",
  );
  const tableReturn = src.slice(src.indexOf("noteTrainerEmail(trainerRow.email"));
  assert.ok(
    tableReturn.slice(0, 200).includes("blockedInClientView ?"),
    "a trainer resolved from the trainers table returns without the client-view guard",
  );
});

test("the toggle replaces its history entry instead of pushing", () => {
  // He was ON the trainer page, toggled, and swiped Back to it. router.push
  // left it one gesture behind him.
  const wrapper = readFileSync(
    join(process.cwd(), "src/components/TrainerLayoutWrapper.tsx"), "utf8");
  assert.ok(wrapper.includes('router.replace(next ? "/home?as=client"'),
    "the view toggle still pushes, so Back returns to the page it left");
});
