// Two trainers, one app.
//
// Stephanie Gautreaux added 20 Aug 2026. Dustin is the OWNER and sees every
// client; she sees only hers. Group chat and leaderboards stay shared; her
// clients pay HER directly.
//
// Everything here guards a place where "the trainer" was a single constant and
// would therefore have resolved to Dustin no matter who was signed in. Each one
// is a real thing a client would have seen: the wrong Venmo, the wrong name on
// their invite, their message in the wrong inbox, another trainer's data in
// their own client view.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TRAINER_EMAILS, isTrainerEmail, TRAINER_EMAIL } from "../../src/lib/trainer.ts";
import { buildVenmoLink, buildCashAppLink, OWNER_PAY_DESTINATION } from "../../src/lib/pay-links.ts";
import { buildTrainerMessageEmail, TRAINER_ALERT_EMAIL } from "../../src/lib/messageEmail.ts";
import { buildInviteEmailHtml } from "../../src/lib/inviteEmail.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const DUSTIN = "symmetrypersonaltraining@gmail.com";
const STEPH = "steph.rgautreaux@gmail.com";

// ─── who counts as a trainer ────────────────────────────────────────────────

test("both trainers are recognised", () => {
  assert.ok(isTrainerEmail(DUSTIN));
  assert.ok(isTrainerEmail(STEPH));
});

test("recognition is case-insensitive", () => {
  assert.ok(isTrainerEmail("Steph.RGautreaux@Gmail.com"));
});

test("a client is not a trainer", () => {
  assert.ok(!isTrainerEmail("palominohorses@proton.me"));
  assert.ok(!isTrainerEmail(""));
  assert.ok(!isTrainerEmail(null));
});

test("the list is a UNION, so setting the env var cannot silently drop a trainer", () => {
  // It used to be "env if set, otherwise defaults". Setting the variable to one
  // address would remove everyone else with nothing saying so — and a trainer
  // whose address fell out gets the CLIENT interface over rows she can read
  // perfectly well, which reads as a broken app rather than a missing setting.
  for (const e of [DUSTIN, STEPH]) {
    assert.ok(TRAINER_EMAILS.includes(e), e + " is not in the list");
  }
});

test("the owner is still first, because TRAINER_EMAIL means the business", () => {
  assert.equal(TRAINER_EMAIL, DUSTIN);
});

// ─── money — the one that must never be wrong ───────────────────────────────

test("a Venmo link goes to the account it is given", () => {
  assert.match(buildVenmoLink(640, "Personal Training", "symmetrypt"), /venmo\.com\/u\/symmetrypt\?/);
  assert.match(buildVenmoLink(640, "Personal Training", "dustingautreaux"), /venmo\.com\/u\/dustingautreaux\?/);
});

test("Venmo notes stay generic — they are public", () => {
  const l = buildVenmoLink(640, "Personal Training", "symmetrypt");
  assert.match(l, /note=Personal\+Training/);
  assert.match(l, /amount=640\.00/);
});

test("no account passed falls back to the owner rather than a broken link", () => {
  assert.match(buildVenmoLink(100), /venmo\.com\/u\/dustingautreaux/);
  assert.equal(OWNER_PAY_DESTINATION.venmoUsername, "dustingautreaux");
  assert.equal(OWNER_PAY_DESTINATION.zelleEmail, DUSTIN);
});

test("Cash App honours the tag it is given", () => {
  assert.equal(buildCashAppLink(50, "sometag"), "https://cash.app/$sometag/50.00");
});

test("the pay row renders the destination it is handed, not module constants", () => {
  const c = code(read("src/components/PayLinksRow.tsx"));
  assert.match(c, /const dest = to \?\? OWNER_PAY_DESTINATION;/);
  for (const bad of ["{VENMO_USERNAME &&", "ZELLE.recipientName", "ZELLE.email", "ZELLE.phone", "{CASHTAG &&"]) {
    assert.ok(!c.includes(bad), "still reads the module constant: " + bad);
  }
});

test("both client-facing pay surfaces resolve the client's own trainer", () => {
  for (const f of ["src/components/PaymentDueBanner.tsx", "src/components/PaymentsSettingsCard.tsx"]) {
    const c = read(f);
    assert.match(c, /from\("trainers"\)/, f + " never looks up a trainer");
    assert.match(c, /venmo_username/, f + " does not read the payment details");
    assert.match(c, /to=\{payTo\}/, f + " does not pass the destination to PayLinksRow");
  }
});

// ─── a client's message reaches THEIR coach ─────────────────────────────────

test("the alert email goes where it is told", () => {
  const p = buildTrainerMessageEmail("Lesly", "hi", false, "https://x.test", STEPH);
  assert.deepEqual(p.to, [STEPH]);
});

test("no address falls back to the owner rather than nowhere", () => {
  const p = buildTrainerMessageEmail("Lesly", "hi", false, "https://x.test", null);
  assert.deepEqual(p.to, [TRAINER_ALERT_EMAIL]);
  assert.equal(TRAINER_ALERT_EMAIL, DUSTIN);
});

test("the message action resolves the sender's own trainer", () => {
  const c = code(read("src/app/(app)/home/messageActions.ts"));
  assert.match(c, /rpc\("my_trainer_user_id"\)/, "a client message still goes to THE trainer");
  assert.match(c, /rpc\("my_trainer_email"\)/, "the alert email is not resolved per client");
  assert.match(c, /emailTrainerNewMessage\(who, body \|\| '', !!imageUrl, trainerEmail as string \| null\)/);
});

// ─── the invite names the right coach ───────────────────────────────────────

test("an invite is signed by the inviting coach", () => {
  const html = buildInviteEmailHtml({
    firstName: "Sam", email: "s@x.test", tempPassword: "pw", apkUrl: "https://a.test",
    coachFirstName: "Stephanie",
  });
  assert.match(html, /Stephanie has set up your Symmetry Training App account/);
  assert.ok(!/Dustin has set up/.test(html), "it still names the owner");
});

test("no coach passed falls back rather than leaving a blank", () => {
  const html = buildInviteEmailHtml({
    firstName: "Sam", email: "s@x.test", tempPassword: "pw", apkUrl: "https://a.test",
  });
  assert.match(html, /Dustin has set up your Symmetry Training App account/);
});

test("the invite route passes the client's own trainer", () => {
  const c = code(read("src/app/api/invite-client/route.ts"));
  assert.match(c, /coachFirstName: inviteCoachFirstName/);
  assert.match(c, /from\("trainers"\)/);
});

// ─── a trainer's own client view is THEIRS ──────────────────────────────────

test("the trainer's own client row is found by account, never by email", () => {
  // TRAINER_EMAIL is a single constant. Stephanie's own client view would have
  // shown Dustin's weight, meals and workouts.
  for (const f of [
    "src/app/(app)/home/page.tsx",
    "src/app/(app)/schedule/page.tsx",
    "src/app/(app)/client-preview/page.tsx",
    "src/app/(app)/client-preview/schedule/page.tsx",
    "src/app/(app)/client-preview/progress/page.tsx",
  ]) {
    const c = code(read(f));
    assert.ok(!c.includes('.eq("email", TRAINER_EMAIL)'), f + " still resolves the owner's client row");
  }
});

test("the coach badge shows the viewer's own coach", () => {
  const c = code(read("src/components/CoachBadge.tsx"));
  assert.ok(!c.includes("TRAINER_EMAIL"), "every client saw the owner's face");
  assert.match(c, /from\("trainers"\)/);
  assert.match(c, /trainer_id/);
});

// ─── a new client lands on the right roster ─────────────────────────────────

test("both create-client routes stamp the creating trainer", () => {
  // These run with the ADMIN client, where auth.uid() is null, so the database
  // trigger cannot see who is creating and falls back to the owner. Every
  // client Stephanie created would have appeared on Dustin's roster.
  for (const f of ["src/app/api/create-client/route.ts",
                   "src/app/api/create-client-from-assessment/route.ts"]) {
    const c = code(read(f));
    assert.match(c, /creatorTrainerId/, f + " does not resolve the creator");
    assert.match(c, /\.\.\.\(creatorTrainerId \? \{ trainer_id: creatorTrainerId \} : \{\}\)/,
      f + " does not stamp trainer_id on the insert");
  }
});

// ─── what stays shared, on purpose ──────────────────────────────────────────

test("the notification settings label names no one", () => {
  const c = read("src/lib/notificationEvents.ts");
  assert.match(c, /label: "Messages from your coach"/,
    "a client of Stephanie's saw Dustin's name in their notification settings");
  assert.ok(!code(c).includes("COACH_FIRST_NAME"));
});

test("the group chat is NOT scoped — that is the decision, not an oversight", () => {
  // Dustin, 20 Aug: "All clients can go in there since they're all going to
  // train with Symmetry Personal Training." A future reader finding an
  // unscoped roster read here should know it is deliberate.
  const c = read("src/app/(app)/home/messageActions.ts");
  assert.match(c, /GROUP CHAT below is deliberately NOT scoped/);
});
