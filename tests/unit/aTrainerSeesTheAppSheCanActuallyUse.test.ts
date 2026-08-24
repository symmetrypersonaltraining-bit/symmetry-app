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

test("AI health is every trainer's page, showing them their own", () => {
  // This used to assert the page REDIRECTED a non-owner. That was my fix for a
  // real leak — the page read the whole business's costs with the service role
  // behind a mere "is a trainer" check — and it was the wrong fix. Silence is
  // the failure mode for every AI surface in this app, so a trainer with no
  // health page cannot tell "nobody uses this" from "this has been broken for
  // my clients all week": exactly the blindness the page exists to end.
  //
  // Health is now per-trainer; the month-to-date SPEND stays owner-only,
  // because there is one key, one cap, and the number is the business's.
  const src = read("src/app/(app)/settings/ai-health/page.tsx");
  assert.ok(!/redirect\("\/settings"\)/.test(src), "a trainer is being turned away from her own health page");
  assert.match(src, /const isOwner = !!me\?\.isOwner;/);
  assert.match(src, /if \(!isOwner\) q = q\.eq\("trainer_id",/, "a non-owner would read every trainer's rows");
  assert.match(src, /monthUsd=\{isOwner \? /, "spend is not owner-gated");
  // Fail closed: an unresolvable trainer must match nothing, not everything.
  const i = src.indexOf('if (!isOwner) q = q.eq("trainer_id",');
  assert.match(src.slice(i, i + 200), /me\?\.id \?\? "00000000-0000-0000-0000-000000000000"/);
});

test("the spend card is not rendered at all without a number", () => {
  const ui = read("src/app/(app)/settings/ai-health/AiHealthTable.tsx");
  assert.match(ui, /monthUsd: number \| null;/);
  assert.match(ui, /\{monthUsd != null \? \(/, "a trainer would see a $0.00 of $95 bar that means nothing");
});

test("every usage row is stamped with the coach it belongs to", () => {
  const sql = read("supabase/migrations/20260823e_ai_health_is_every_trainers.sql");
  assert.match(sql, /add column if not exists trainer_id uuid references public\.trainers/);
  // A trigger, not an argument: logUsage has many call sites and an argument
  // is one chance to forget at each of them.
  assert.match(sql, /create trigger trg_stamp_ai_usage_trainer\s*\n\s*before insert on public\.ai_usage_log/);
  assert.match(sql, /update public\.ai_usage_log l/, "existing rows are left unattributed");
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
