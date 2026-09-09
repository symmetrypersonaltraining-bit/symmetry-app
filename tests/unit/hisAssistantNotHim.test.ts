import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * HIS ASSISTANT, CLEARLY AND WARMLY — ruling 4 of the AI contract.
 *
 * Dustin, 5 Sep, approved again 9 Sep: *"Dustin's assistant — knows your
 * programme, your logs and how he trains you. Anything real goes to him."*
 *
 * Not "the coach" wearing his name, and not a cold AI badge on everything. The
 * reasoning recorded with the ruling: clients DISCOVERING they were talking to
 * a bot is a top-three risk to trust, and an undisclosed assistant means that
 * on the day it is discovered, every warm message he actually wrote gets
 * re-read as generated.
 *
 * Before this, the sheet labelled every reply "COACH" and two greetings opened
 * with "I'm your coach" — the app claiming, in the first line a client reads,
 * to BE him.
 */

const SHEET = readFileSync(
  join(process.cwd(), "src/app/(app)/nutrition/v3/CoachChatSheet.tsx"), "utf8");

test("nothing in the coach sheet claims to BE the coach", () => {
  assert.doesNotMatch(SHEET, /I'm your coach/,
    "a greeting that says \"I'm your coach\" is the impersonation ruling 4 forbids");
  assert.doesNotMatch(SHEET, />COACH</,
    "the per-message label must name the assistant, not the coach");
});

test("the disclosure says whose assistant it is, and what it defers", () => {
  assert.match(SHEET, /assistant/,
    "the sheet has to say it is an assistant");
  assert.match(SHEET, /knows your programme, your logs and how/,
    "his approved wording, kept");
  assert.match(SHEET, /Anything real goes to/,
    "the deferral is the half that makes the disclosure worth trusting");
});

test("it uses the coach's NAME, never a pronoun", () => {
  // His wording said "how HE trains you" because he was describing himself.
  // Half the clients on this deployment are Stephanie's -- coachIdentity exists
  // precisely because one name cannot serve two trainers -- and CoachIdentity
  // carries no pronoun to read. The name is right for every coach.
  // Only the RENDERED markup: the comment above it quotes his original wording,
  // pronouns and all, and that quote is the record of what he asked for.
  const start = SHEET.indexOf("WHO THIS IS");
  const block = SHEET.slice(
    SHEET.indexOf("*/}", start) + 3,
    SHEET.indexOf("{/* messages */}"));
  assert.ok(block.includes("assistant"), "the disclosure markup must exist");
  assert.doesNotMatch(block, /\bhe\b|\bhim\b|\bhis\b|\bshe\b|\bher\b/i,
    "no pronoun for the coach -- Stephanie's clients would be misgendered");
  const uses = block.match(/coachFirstName/g) ?? [];
  assert.ok(uses.length >= 3, "the coach's name carries every reference");
});

test("it is said once, standing, not repeated into every greeting", () => {
  // Rule 7 bans walls of obvious text, and a disclosure that repeats on every
  // message is the thing people learn to skip.
  const disclosures = SHEET.match(/knows your programme, your logs and how/g) ?? [];
  assert.equal(disclosures.length, 1);
});
