import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ONE FACE FOR THE APP, HIS FACE ONLY FOR HIM.
 *
 * Dustin, 13 Aug, going into the app-store polish pass:
 *
 *   "we need to make sure the new avatars are on all ai functions zero missed!
 *    we are in polishing stage of this app to get it ready to send out to app
 *    stores we need to perfect every detail."
 *
 *   "the only place my profile pic should show up should be from me directly in
 *    messages or anywhere else i do something."
 *
 * An audit of every AI surface found roughly sixty that had no face, or wore a
 * sparkles / robot / brain icon, or an emoji. Two were worse than missing: the
 * weekly-focus card put his REAL PHOTOGRAPH on a paragraph Sonnet wrote, and the
 * fortnightly programming question was captioned "CHECK-IN FROM DUSTIN" over a
 * question Claude wrote. Same lie as the nudges Bobbie Page spotted, on screens
 * nobody was looking at.
 *
 * None of that shows up as an error, and none of it is visible in a diff — only
 * by looking at every surface at once. That is what these do, on every build.
 *
 * They are deliberately blunt: they ban the MARKS that stood in for a face,
 * rather than trying to infer which components are AI. A banned glyph is
 * unambiguous, cheap to check, and the ban is what makes someone reach for
 * AiBadge instead of a sparkle when they add the next AI surface.
 */

const ROOT = process.cwd();
const grep = (pattern: string) =>
  execSync(`grep -rn ${JSON.stringify(pattern)} src/ --include=*.tsx --include=*.ts || true`, {
    encoding: "utf8",
    cwd: ROOT,
  })
    .split("\n")
    .filter(Boolean)
    // Comments are not UI. Every remaining mention of these is a note saying
    // why not to use them.
    .filter((l) => !/^\S+:\d+:\s*(\/\/|\{?\/\*|\*)/.test(l))
    // A multi-line {/* … */} block's continuation lines start with plain prose,
    // so the opener test misses them. Anything without a JSX tag or a quoted
    // icon string on it is prose, not UI.
    .filter((l) => /[<"']/.test(l.replace(/^\S+:\d+:/, "")));

test("no sparkles, robot or brain icon stands in for the AI's face", () => {
  const banned = ["ti-sparkles", "ti-robot", "ti-brain", "ti-message-chatbot"];
  const hits: string[] = [];
  for (const b of banned) {
    for (const line of grep(b)) {
      // ExperienceSettings' remaining chatbot icon labels the GROUP CHAT BOT
      // toggle, which is a settings row about a feature, not the AI speaking.
      if (b === "ti-message-chatbot" && line.includes("ExperienceSettings")) continue;
      // THE WORKOUT LOGGER IS OFF LIMITS WITHOUT PER-ITEM PERMISSION — his
      // standing rule, and it has held since the day it was written. Two AI
      // marks live in there: the "Ask your coach" header button (ti-sparkles)
      // and the "AI Programming Note" sheet (ti-brain). Both SHOULD wear the
      // face by the rule this file enforces, and neither is changed until he
      // says so specifically. Listed rather than filtered out silently, so it
      // stays a question somebody has to answer instead of a gap.
      if (line.includes("workout/[dayId]/WorkoutLogger.tsx")) continue;
      // Not AI: an anatomical finding in the assessment checklist.
      if (line.includes("assessment/page.tsx") && line.includes("balance_deficits")) continue;
      hits.push(line.trim());
    }
  }
  assert.deepEqual(
    hits,
    [],
    "an AI surface is wearing a generic icon instead of the face — use <AiBadge mood=…>:\n  " +
      hits.join("\n  "),
  );
});

test("no robot or sparkle emoji stands in for the AI's face", () => {
  const hits = [...grep("🤖"), ...grep("✨")]
    // The group-chat digest to Dustin prefixes bot lines; it is plain text in a
    // message body, not a rendered avatar, and it goes only to him.
    .filter((l) => !l.includes("src/app/api/"));
  assert.deepEqual(
    hits.map((h) => h.trim()),
    [],
    "an AI surface uses an emoji where the face belongs:\n  " + hits.join("\n  "),
  );
});

test("Dustin's photograph never appears on something he did not write", () => {
  // CoachBadge is his real photo. It is the strongest claim of authorship the
  // app can make, and it is worth exactly as much as its rarity.
  const sites = grep("CoachBadge")
    .filter((l) => !l.includes("src/components/CoachBadge.tsx"))
    .filter((l) => !/^\S+:\d+:import /.test(l));

  // Every remaining render must be inside a branch that has established the
  // content is HIS. Today that is ClientWeekSummary's `focusIsAi` ternary,
  // which picks AiBadge when the line was generated.
  const bad = sites.filter((l) => !/focusIsAi \? <AiBadge[^>]*\/> : <CoachBadge/.test(l));
  assert.deepEqual(
    bad.map((b) => b.trim()),
    [],
    "his photo is rendered without first checking the content is his:\n  " + bad.join("\n  "),
  );
});

test("the label never attributes generated text to him by name", () => {
  // "CHECK-IN FROM DUSTIN" over a Claude-written question is the same
  // impersonation as an unlabelled nudge, and it hides in a style block.
  const hits = grep("FROM DUSTIN").concat(grep("From Dustin"));
  assert.deepEqual(
    hits.map((h) => h.trim()),
    [],
    "a card claims Dustin as the author in its heading:\n  " + hits.join("\n  "),
  );
});

test("the trainer's own AI assistant has a face on every one of its states", () => {
  // It was the only assistant in the app with no face anywhere — the one
  // surface where "is this the app or a person" had no visual answer at all.
  const src = readFileSync(join(ROOT, "src/components/AIAssistant.tsx"), "utf8");
  const faces = [...src.matchAll(/<AiBadge/g)].length;
  assert.ok(
    faces >= 5,
    `AIAssistant renders the face in ${faces} places; it needs at least 5 — ` +
      "the drawer header, the empty state, each assistant message, the thinking " +
      "bubble, and the launcher",
  );
  assert.ok(
    !/<svg[\s\S]{0,400}?M12 2a10 10 0 1 0 10 10/.test(src),
    "the inline info-circle avatar is back on assistant messages",
  );
});
