// Guard: the group thread shows a face beside every name.
//
// Dustin, 15 Aug: "in group chat, our profile icons shoukd show on msges".
//
// Coach Bot had a face in that slot and nobody else did, so the one participant
// who isn't a person was the only one you could identify at a glance.
//
// Two things here are easy to get wrong and both are guarded below, because
// both produce something that looks fine in a screenshot and is useless in use:
//
//   1. initials from the FIRST name. senderNames holds first names only, so
//      reaching for it is the obvious move — and it puts "S" on both Sharons
//      and "G" on every Gautreaux. Initials come from the full name.
//   2. an initials circle coloured --brand-primary. Your own bubble IS
//      --brand-primary, so your own circle would disappear into it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initialsOf } from "../../src/lib/initials";

const PAGE = readFileSync(join(process.cwd(), "src/app/(app)/messages/page.tsx"), "utf8");
const CLIENT = readFileSync(join(process.cwd(), "src/app/(app)/messages/MessagesClient.tsx"), "utf8");

/** Strip comments so a test can never pass by matching its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("initials come from the full name, so two Sharons are not both 'S'", () => {
  assert.equal(initialsOf("Sharon Gautreaux"), "SG");
  assert.equal(initialsOf("Sharon Rambo"), "SR");
  assert.notEqual(initialsOf("Sharon Gautreaux"), initialsOf("Sharon Rambo"));
  // The four Gautreauxs are the real case in this roster.
  assert.equal(initialsOf("Dustin Gautreaux"), "DG");
  assert.equal(initialsOf("Steph Gautreaux"), "SG");
  // Hyphenated surname is one word, not two initials from the hyphen.
  assert.equal(initialsOf("Krysta Ruiz-Schnitzler"), "KR");
  // Never blank — an empty circle reads as a broken image.
  assert.equal(initialsOf(""), "?");
});

test("the page computes initials from the full name, not from senderNames", () => {
  const src = code(PAGE);
  // senderNames is assigned `.split(" ")[0]` — the first name. If initialsOf
  // were fed that, every circle in the group would be one letter.
  assert.match(src, /initialsOf\(full\)/, "initials must be built from the full name");
  assert.doesNotMatch(
    src,
    /initialsOf\(\s*senderNames/,
    "initials built from senderNames would be first-name-only"
  );
  assert.doesNotMatch(
    src,
    /initialsOf\([^)]*\.split\(" "\)\[0\]/,
    "that is the first name again, by another route"
  );
});

test("the page actually passes the avatars down", () => {
  const src = code(PAGE);
  assert.match(src, /senderAvatars\[cc\.auth_user_id\] = \{/, "the map must be built");
  assert.match(src, /url: cc\.avatar_url \|\| null/, "the photo must come from clients.avatar_url");
  assert.match(src, /senderAvatars=\{senderAvatars\}/, "…and reach the component");
});

test("a face renders only in the group thread", () => {
  // In a one-to-one thread there are two people and the bubble side already
  // says which is which. A face there is decoration, and it would change every
  // existing DM for no gain.
  const src = code(CLIENT);
  assert.match(src, /isGroup && \(senderAvatars\[m\.from_id\]\?\.url/, "gate the face on isGroup");
});

test("the initials circle stays visible on your OWN bubble", () => {
  // Your own bubble background is --brand-primary. A --brand-primary circle on
  // it is invisible, and it would only be wrong on your own messages — the ones
  // you look at least carefully when checking a change.
  const src = code(CLIENT);
  // Bound the window to the circle's OWN style block. Slicing to end-of-file
  // caught `isMe ?` from the bubble, the radii and the timestamp, so the
  // assertion passed with the circle hard-coded to --brand-primary — i.e. it
  // passed on exactly the bug it exists to catch. Found by mutation, not by
  // reading it.
  const start = src.indexOf("<span aria-hidden");
  assert.ok(start > 0, "the initials circle should be a <span aria-hidden>");
  const end = src.indexOf("}}>", start);
  assert.ok(end > start, "could not find the end of the circle's style block");
  const circle = src.slice(start, end);
  assert.ok(
    circle.includes("senderAvatars") === false,
    "sanity: the style block should end before the initials are rendered"
  );
  assert.match(circle, /background: isMe \?/, "the circle background must depend on isMe");
  assert.match(circle, /color: isMe \? "#fff"/, "…and so must the text colour");
  assert.doesNotMatch(
    circle,
    /background: "var\(--brand-primary\)"/,
    "that is the colour of your own bubble — the circle would vanish into it"
  );
});

test("a sender with no entry still gets a circle rather than a gap", () => {
  // Someone who posted and has since been archived is not in the map at all.
  const src = code(CLIENT);
  assert.match(src, /senderAvatars\[m\.from_id\]\?\.initials \|\| "\?"/, "fall back, never render empty");
});

test("Coach Bot keeps its own face and is not given a client avatar", () => {
  // The bot posts from the trainer's auth user id, so a lookup by from_id would
  // hand it Dustin's photo and it would look like him posting.
  const src = code(CLIENT);
  const botIdx = src.indexOf('faceSrc("messages")');
  const avatarIdx = src.indexOf("senderAvatars[m.from_id]");
  assert.ok(botIdx > 0 && avatarIdx > 0);
  assert.ok(botIdx < avatarIdx, "the isBot branch must come first and short-circuit");
});
