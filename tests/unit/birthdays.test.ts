import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  centralToday, effectiveMonthDay, fallbackLine, isPrintable, joinNames, monthDay, nextDay,
} from "../../src/lib/birthdays.ts";

/**
 * THE BIRTHDAY BOT.
 *
 * Dustin, 2026-08-04: "lets activate an automatic fun bday msg for everyone in
 * the group chat on the app." Coach Bot's voice, at his choice.
 *
 * Two things can go wrong here and both are the kind you only find out about
 * after they have happened in front of thirty-five people, so both are asserted
 * rather than trusted:
 *
 *   Announcing an age. The date of birth is in this app so intake forms and
 *   programming know it. Nobody ever agreed to have their age read out in a
 *   group chat. The prompt says don't; this checks.
 *
 *   Posting twice. A daily cron plus a retry is a doubled birthday message, and
 *   there is no un-sending it.
 */

test("a birthday is a month and a day, not a date", () => {
  assert.equal(monthDay("1987-05-19"), "05-19");
  assert.equal(monthDay(""), "");
});

test("29 February still gets a birthday in the other three years", () => {
  // 2028 is a leap year, 2026 and 2027 are not. Someone born on the 29th would
  // otherwise be silently skipped 3 years in 4 — the precise failure this
  // feature exists to prevent, quietly reintroduced.
  assert.equal(effectiveMonthDay("02-29", "2028-02-29"), "02-29");
  assert.equal(effectiveMonthDay("02-29", "2026-02-28"), "02-28");
  assert.equal(effectiveMonthDay("02-29", "2027-02-28"), "02-28");
  // 2100 is divisible by 4 but not a leap year. Nobody will be alive to notice,
  // but the rule is the rule.
  assert.equal(effectiveMonthDay("02-29", "2100-02-28"), "02-28");
  // Everyone else is untouched.
  assert.equal(effectiveMonthDay("05-19", "2026-08-04"), "05-19");
});

test("tomorrow is tomorrow, including across months and years", () => {
  assert.equal(nextDay("2026-08-04"), "2026-08-05");
  assert.equal(nextDay("2026-08-31"), "2026-09-01");
  assert.equal(nextDay("2026-12-31"), "2027-01-01");
  assert.equal(nextDay("2028-02-28"), "2028-02-29"); // leap
  assert.equal(nextDay("2027-02-28"), "2027-03-01"); // not
});

test("two people sharing a day are wished together, in one message", () => {
  // Dustin has two clients on 19 May and two on 27 December. Two messages ten
  // seconds apart reads like a malfunction; one naming both reads like someone
  // remembered.
  assert.equal(joinNames(["Stacie"]), "Stacie");
  assert.equal(joinNames(["Stacie", "Gerard"]), "Stacie and Gerard");
  assert.equal(joinNames(["Stacie", "Gerard", "Todd"]), "Stacie, Gerard and Todd");
  assert.equal(joinNames([]), "");
});

test("there is always a message, even with no model", () => {
  // A birthday message that fails to arrive is a worse outcome than one that is
  // merely nice. The fallback is not a placeholder; it is what ships when the
  // API is down.
  const line = fallbackLine([{ id: "1", firstName: "Stacie" }]);
  assert.ok(line.includes("Stacie"));
  assert.ok(isPrintable(line, [{ id: "1", firstName: "Stacie" }]), "the fallback must itself pass the filter");
  const two = fallbackLine([{ id: "1", firstName: "Stacie" }, { id: "2", firstName: "Gerard" }]);
  assert.ok(two.includes("Stacie") && two.includes("Gerard"));
});

const STACIE = [{ id: "1", firstName: "Stacie" }];

test("nothing that names an age is printable", () => {
  for (const bad of [
    "Happy 40th birthday Stacie!",
    "Stacie turns 40 today 🎂",
    "Stacie is 40 years old today",
    "Happy birthday Stacie — half a century!",
    "Stacie's over the hill today 🎂",
    "Happy birthday Stacie, you old timer",
  ]) {
    assert.equal(isPrintable(bad, STACIE), false, `should have been refused: ${bad}`);
  }
});

test("nothing about a body is printable, on a birthday least of all", () => {
  for (const bad of [
    "Happy birthday Stacie — 20 pounds lighter than last year!",
    "Happy birthday Stacie, cake won't hurt that belly",
    "Stacie, happy birthday, weight looking great",
  ]) {
    assert.equal(isPrintable(bad, STACIE), false, `should have been refused: ${bad}`);
  }
});

test("backhanded is not a birthday wish", () => {
  assert.equal(isPrintable("Happy birthday Stacie — she finally showed up this week 😂", STACIE), false);
});

test("a message that does not name anyone has no reason to exist", () => {
  assert.equal(isPrintable("Happy birthday to our birthday person!", STACIE), false);
  assert.equal(isPrintable("🎂 Happy birthday, Stacie. Rest day granted.", STACIE), true);
});

test("the filter does not refuse a perfectly good message", () => {
  for (const good of [
    "🎂 Happy birthday Stacie — the squat rack is observing a moment of silence.",
    "Happy birthday, Stacie. Cake counts as carbs, and carbs are fuel.",
    "It's Stacie's birthday. Rest day granted, and only because we like you.",
  ]) {
    assert.equal(isPrintable(good, STACIE), true, `should have been allowed: ${good}`);
  }
});

test("the day turns in Central time, where the gym is", () => {
  // 04:30 UTC on the 5th is still the evening of the 4th in Chicago. Getting
  // this wrong wishes somebody a day early, in public.
  assert.equal(centralToday(new Date("2026-08-05T04:30:00Z")), "2026-08-04");
  assert.equal(centralToday(new Date("2026-08-05T13:00:00Z")), "2026-08-05");
});

/* ── The parts that live in the route ─────────────────────────────────────── */

const ROUTE = readFileSync(join(process.cwd(), "src/app/api/cron/birthdays/route.ts"), "utf8");

test("it records every post, so a retry cannot double-post", () => {
  assert.match(ROUTE, /birthday_posts/);
  assert.match(ROUTE, /alreadyDone\(db, people\.map\(\(p\) => p\.id\), year, "group"\)/);
  assert.match(ROUTE, /const fresh = people\.filter\(\(p\) => !done\.has\(p\.id\)\)/);
  assert.match(ROUTE, /if \(!fresh\.length\)/, "everyone already wished must be a no-op, not a second message");
});

test("the group post is a normal group message, never a broadcast", () => {
  // Standing rule: broadcasts take over every client's screen. A birthday is
  // not an announcement.
  assert.match(ROUTE, /is_group: true,\s*is_broadcast: false,/);
  assert.match(ROUTE, /sender_kind: "coachbot"/, "Coach Bot's badge, not Dustin's photo — his own choice");
});

test("the heads-up to Dustin is invisible to the client", () => {
  // from_id = to_id = Dustin. The RLS on messages is
  // (auth.uid() = from_id OR auth.uid() = to_id), so nobody else can read it —
  // verified against the live policy. A client seeing "worth a word from you in
  // person" would undo the entire point of it.
  const block = ROUTE.slice(ROUTE.indexOf("Tomorrow: the quiet nudge"), ROUTE.indexOf("Today: the group chat"));
  assert.match(block, /from_id: trainerUid,\s*to_id: trainerUid,/);
  assert.match(block, /is_group: false,/);
  assert.match(block, /kind: "heads_up"/);
});

test("the model is never told the date of birth", () => {
  // It cannot leak an age it was never given. The prompt asks for restraint;
  // this makes it structural.
  // Against CODE — the comment beside the call explains the rule and would
  // otherwise fail the check that enforces it.
  const CODE = ROUTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // From the call site, not the import line at the top of the file.
  const call = CODE.slice(CODE.indexOf("await callClaudeJson<"), CODE.indexOf("await logUsage("));
  assert.ok(!/date_of_birth/.test(call), "only first names go to the model");
  assert.match(call, /joinNames\(fresh\.map\(\(p\) => p\.firstName\)\)/);
});

test("a model failure falls back rather than skipping the birthday", () => {
  assert.match(ROUTE, /let body = fallbackLine\(fresh\);/, "the fallback is loaded BEFORE the model is called");
  assert.match(ROUTE, /if \(value && isPrintable\(value\.message, fresh\)\)/, "the model's line only ships if it passes the filter");
});

test("it can be switched off without a deploy", () => {
  assert.match(ROUTE, /birthday_bot_live/);
});

test("it is actually scheduled", () => {
  const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8"));
  const cron = vercel.crons.find((c: { path: string }) => c.path === "/api/cron/birthdays");
  assert.ok(cron, "a cron that is never called is not a feature");
  // 13:00 UTC = 08:00 Central — morning, so the group sees it during the day
  // rather than at 2am.
  assert.equal(cron.schedule, "0 13 * * *");
});

test("the client's own birthday screen never shows an age either", () => {
  const src = readFileSync(join(process.cwd(), "src/components/ClientTakeovers.tsx"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const block = code.slice(code.indexOf("Happy birthday, {pick.firstName}") - 900, code.indexOf("When&rsquo;s your birthday"));
  assert.match(block, /Happy birthday, \{pick\.firstName\}/);
  assert.ok(!/getFullYear|\bage\b/i.test(block), "no age arithmetic anywhere near this screen");
});

test("the ask-for-a-birthday screen comes back if it is skipped", () => {
  // Everything else in this component is seen-once-forever, which is right for
  // an announcement and wrong for a question. A month-stamped key means "not
  // now" costs nothing and asks again in thirty days.
  const src = readFileSync(join(process.cwd(), "src/components/ClientTakeovers.tsx"), "utf8");
  assert.match(src, /const askKey = "birthday-ask-" \+ todayCT\.slice\(0, 7\)/);
  // Order of the setPick calls in the query pass — the Pick type union at the
  // top of the file lists them in a different order and is not the priority.
  const order = [...src.matchAll(/setPick\(\{\s*kind: "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    order,
    ["birthday", "winner", "challenge", "announcement", "askdob"],
    "priority is by shelf life: a birthday is true for one day and goes first; asking for something goes last",
  );
});
