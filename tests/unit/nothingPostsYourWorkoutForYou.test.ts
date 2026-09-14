import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Dustin, 11 Sep 2026: *"Currently we have PRs, finished workouts. Things like
 * that are all shared as messages in the group chat. I don't want any of that
 * posted in that group chat anymore."*
 *
 * And on 14 Sep, acting on it: *"Go ahead n get rid of sharing the prs n
 * completed workout options for group chat. This will need to be adjusted in
 * celebration screen at end of workouts to remove that option as well."*
 *
 * The worst of it was not a button. A PR posted itself into a thread thirty-five
 * people read, the moment the celebration screen rendered, with no way to
 * decline and a sessionStorage key so closing the screen could not undo it. A
 * button is a choice; that was not.
 *
 * These tests are here because the group chat is about to be rebuilt as a
 * Community feed (docs/audit/AI-WALK-NOTES.md), and "wins should land where
 * people see them" is exactly the reasoning that will put this back.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const CELEBRATION = read("src/components/CelebrationScreen.tsx");
const ACHIEVEMENT = read("src/components/AchievementCard.tsx");

/** Comments discuss what was removed; only real code can post. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

test("finishing a workout posts NOTHING to the group on its own", () => {
  const src = code(CELEBRATION);
  assert.doesNotMatch(src, /sendGroupMessage\s*\(/, "the automatic PR post is gone");
  assert.doesNotMatch(src, /<ShareToGroup/, "and so is the button beside it");
  assert.doesNotMatch(src, /import .*ShareToGroup/, "with no import left to make it easy");
});

test("the week card keeps every way out EXCEPT the group", () => {
  const src = code(ACHIEVEMENT);
  assert.doesNotMatch(src, /<ShareToGroup/, "no group post");
  // The point is that the win still leaves the app — he objected to the
  // destination, not to sharing.
  assert.match(src, /nav\.share\(/, "the native share sheet stays");
  assert.match(src, /Save image/, "and so does the download");
});

test("no sessionStorage key is left arming a post that no longer happens", () => {
  assert.doesNotMatch(code(CELEBRATION), /sym:prshare/);
});

test("the head photo is gone from the halo card, but the card is not", () => {
  // Dustin: "get rid of the one w my actual face/head only its too goofy" —
  // and then, on what to do instead: "swap it w another avatar." The card was
  // never the problem; the cutout of his head in the middle of it was.
  const src = code(CELEBRATION);
  assert.doesNotMatch(src, /coach-head\.webp/, "the head cutout");
  assert.match(src, /A DISTURBANCE IN THE GYM/, "the card itself stays");
  assert.match(src, /<Face mood="pr" size=\{124\} \/>/, "with the PR avatar in the halo");
  assert.match(src, /coach-flex\.webp/, "variant 26 stays — he did not ask for that one");
});

test("the halo card no longer needs a coach photograph to fire", () => {
  // It used to be gated on hasCoachFace, because without one there was nothing
  // to put in the halo that was not a stranger's face. An avatar is always
  // there, so a client of any trainer can now get the best card in the set.
  const src = code(CELEBRATION);
  assert.match(src, /if \(bigPr && topPr\) \{/);
  assert.doesNotMatch(src, /if \(bigPr && topPr && hasCoachFace\)/);
});

test("EVERY celebration variant carries an avatar", () => {
  // Dustin: "I want all those celebrations to have an avatar. Those screens
  // need to look polished n professional." Ten of thirty-seven had one, so the
  // rotation swung between a card with a character on it and a bare slab of
  // copy — two different apps rather than one with a sense of humour.
  const src = code(CELEBRATION);
  const parts = src.split(/\n  (?:\} else )?if \(variant === (\d+)\)/);
  const bare: string[] = [];
  for (let i = 1; i < parts.length - 1; i += 2) {
    const body = parts[i + 1];
    if (!/<Face|<CardFace|AiBadge|coach-flex/.test(body)) bare.push(parts[i]);
  }
  assert.ok(parts.length > 20, "the variant matcher has stopped matching");
  assert.deepEqual(bare, [], `variants with no avatar: ${bare.join(", ")}`);
});

test("the avatar reacts to the session, not to the card's joke", () => {
  // One mood for the whole screen. A card picking its own would have the
  // avatar celebrating a PR on a day there was not one.
  const src = code(CELEBRATION);
  assert.match(src, /const cardMood = winMood\(\{ isPr: prCount > 0, streakDays, hitGoal: bigPr, fullDayLogged: true \}\)/);
  assert.match(src, /const CardFace = \(\) => \(/);
});

test("the decision is written down where the AI walk will find it", () => {
  // Four other surfaces still post to the group on purpose. They are not PRs
  // or finished workouts, and they are the walk's to rule on — recorded so the
  // next session does not either delete them unasked or miss them.
  const notes = read("docs/audit/AI-WALK-NOTES.md");
  for (const still of ["Leaderboard", "GroupChallenge", "FunMoments", "ProgressPhotos"]) {
    assert.ok(notes.includes(still), `${still} still posts and is not recorded`);
  }
  assert.match(notes, /Community/, "the rename he floated");
  assert.match(notes, /Mock-up\s*\*?\*?\s*only|mock-up only/i, "the notification split is mock-up only");
});
