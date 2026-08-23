// A NEW TRAINER GETS THE WHOLE APP, NOT MOST OF IT.
//
// Dustin, 23 Aug: "When I said I wanted it to function like my app, I literally
// meant I want every single feature to function like my literal app in terms of
// using it. The only thing that changes is I have certain owner rights that
// they do not."
//
// Creating a trainer built an auth login, a trainers row and a feature-flag
// row. It did NOT build the one thing that makes the Client View toggle work:
// a clients row on the same auth user. Dustin and Steph each have one. Four
// trainers — Justin, Ian, Alan, Brooke — did not, so the toggle appeared,
// flipping it showed an empty app, and nothing errored or logged. Blank, not
// broken, which is the hardest kind of bug to be handed.
//
// The rule this pins: everything a trainer needs is created WITH the trainer.
// Not by a follow-up, not by somebody noticing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const INVITE = readFileSync(join(ROOT, "src/app/api/invite-trainer/route.ts"), "utf8");

test("creating a trainer also creates their own client view", () => {
  assert.match(
    INVITE,
    /ensure_trainer_self_client/,
    "invite-trainer no longer sets up the trainer's own client row — their Client View toggle will open an empty app",
  );
});

test("a failure to set up the client view is reported, not swallowed", () => {
  // The pattern this file already learned the hard way on the auth link: an
  // unchecked write leaves an account that exists and is linked to nothing,
  // and the invite reports success anyway.
  const idx = INVITE.indexOf("ensure_trainer_self_client");
  assert.ok(idx > 0);
  const after = INVITE.slice(idx, idx + 900);
  assert.match(after, /selfErr/, "the rpc result is not captured");
  assert.match(after, /status:\s*500/, "the failure does not surface to the caller");
});

test("the trainer's feature defaults are still written", () => {
  // Everything on by default, so their app behaves like his until they change
  // it. Regression guard: this and the client row are the two things that make
  // a new trainer's app match Dustin's on first open.
  assert.match(INVITE, /trainer_features/);
});

test("only the owner may create a trainer", () => {
  // The one thing that is deliberately NOT the same as his app.
  assert.match(INVITE, /if \(!me\?\.isOwner\)/);
});
