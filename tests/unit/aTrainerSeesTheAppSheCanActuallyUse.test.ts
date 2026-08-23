// EVERY CONTROL A TRAINER IS SHOWN IS ONE SHE CAN USE.
//
// Dustin, 23 Aug: "when I add a new trainer... I want every single feature to
// function like my literal app in terms of using it. The only thing that
// changes is I have certain owner rights that they do not."
//
// The failure mode this file guards is the opposite of a missing feature: a
// control that IS drawn, looks live, and cannot work. Three of them existed.
//
//   * Two AUTOMATION switches in Settings write `app_flags`, restricted to the
//     owner since 20260821d. For anyone else they flipped, the update matched
//     no row, and the optimistic state snapped back with no message — the app
//     appearing to lose her setting.
//   * /settings/ai-health was gated as "trainer" and then read with the service
//     role: month-to-date AI spend for the whole business and 5,000 failure
//     rows across every trainer's clients.
//   * /api/gcal-sync accepted { reset: true } from any trainer, and the reset
//     calls gcal_clear_appointments(), which empties the table for everyone.
//
// And one that was drawn for everybody and worked for nobody: the sidebar's
// Schedule -> Calendar linked to /schedule, which redirects every trainer
// straight back to /home.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unrankedClientIds } from "../../src/lib/rankings.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

test("the owner-only automation switches are drawn only for the owner", () => {
  const src = read("src/components/ExperienceSettings.tsx");
  assert.match(src, /\{isTrainer && isOwner \? \(/, "the app_flags block is still shown to every trainer");
  assert.match(src, /AUTOMATION · OWNER ONLY/, "the section still calls itself trainer-only");
  // And the flag has to actually reach it.
  assert.match(read("src/app/(app)/settings/SettingsClient.tsx"), /isOwner=\{!!isOwner\}/);
  assert.match(read("src/app/(app)/settings/page.tsx"), /const isOwner = isTrainer/);
});

test("instance-wide AI spend is owner-only", () => {
  const src = read("src/app/(app)/settings/ai-health/page.tsx");
  const gate = src.indexOf("createAdminClient()");
  const owner = src.indexOf("me?.isOwner");
  assert.ok(owner > 0, "no owner check at all");
  assert.ok(owner < gate, "the service-role read happens before the owner check");
  assert.match(src, /if \(!me\?\.isOwner\) redirect\(/);
});

test("a calendar reset that empties every trainer's appointments is owner-only", () => {
  const src = read("src/app/api/gcal-sync/route.ts");
  assert.match(src, /const resetFirst = body\.reset === true && callerIsOwner;/,
    "any trainer can still wipe the whole appointments table");
  assert.match(src, /callerIsOwner = !!me\?\.isOwner;/);
});

test("an ordinary sync still works for a non-owner", () => {
  // The reset is dropped, not the request — refusing outright would break Sync Now.
  const src = read("src/app/api/gcal-sync/route.ts");
  const i = src.indexOf("callerIsOwner = !!me?.isOwner;");
  assert.ok(i > 0);
  const after = src.slice(i, i + 400);
  assert.ok(!/status:\s*403/.test(after), "a non-owner is now refused the whole sync");
});

test("the Schedule link goes somewhere that renders", () => {
  const sidebar = read("src/components/TrainerSidebar.tsx");
  assert.ok(
    !/\{ href: "\/schedule", label: "Calendar"/.test(sidebar),
    "Calendar still links to /schedule, which redirects every trainer to /home",
  );
  assert.match(sidebar, /href: "\/home#calendar"/);
  assert.match(read("src/app/(app)/home/page.tsx"), /id="calendar"/, "nothing on /home answers to #calendar");
});

test("a trainer added from inside the app is not ranked among her clients", () => {
  const rows = [
    { id: "c1", email: "client@example.com", name: "A Client", exclude_from_rankings: null },
    { id: "c2", email: "thefitranchhand@gmail.com", name: "Brooke Orton", exclude_from_rankings: null },
  ];
  // Without the trainers table she is just another email — this is the bug.
  assert.equal(unrankedClientIds(rows).has("c2"), false);
  // With it, she is off the board wherever the request happens to land.
  const trainers = new Set(["thefitranchhand@gmail.com"]);
  assert.equal(unrankedClientIds(rows, trainers).has("c2"), true);
  assert.equal(unrankedClientIds(rows, trainers).has("c1"), false, "a real client was dropped");
});

test("both boards read the trainers table rather than the build-time list", () => {
  for (const f of ["src/app/api/leaderboard/route.ts", "src/app/api/challenge/route.ts"]) {
    assert.match(read(f), /await trainerEmailSet\(/, `${f} still ranks from the build-time trainer list`);
  }
  assert.ok(!/TRAINER_EMAIL/.test(read("src/lib/rankings.ts")), "rankings still imports the owner constant");
});
