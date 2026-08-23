// One name, one face, per viewer.
//
// Dustin, 20 Aug: "make sure that there is no crossover anywhere. So I am not
// mentioned anywhere that I should not be mentioned... I want only her clients
// to see her avatar. And on my trainer app, only my clients see my avatar."
//
// `COACH_NAME` / `COACH_FIRST_NAME` are read from NEXT_PUBLIC_COACH_NAME at
// BUILD time. 226 lines across 66 files used them to answer a question that is
// now per-viewer, and one environment variable on one deployment cannot be
// right for two trainers — whichever name it holds is wrong for half the
// clients. This is not a configuration problem and no value of that variable
// fixes it.
//
// The resolution happens once in the app layout and reaches client components
// through CoachProvider. These tests pin the parts of that which fail silently.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_COACH } from "../../src/lib/coachIdentity.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─── the fallback must never be a face ──────────────────────────────────────

test("the default identity carries a name but no photograph", () => {
  // A generic name is a small wrong. Another trainer's face on your coach's
  // badge is the thing this whole change exists to prevent, so the fallback
  // has no face at all.
  assert.equal(DEFAULT_COACH.avatarUrl, null);
  assert.equal(DEFAULT_COACH.isOwner, false);
  assert.ok(DEFAULT_COACH.firstName.length > 0, "a blank where a name goes is worse than a generic one");
});

// ─── the provider is actually mounted, on BOTH branches ─────────────────────

test("the app layout wraps both the trainer and the client tree", () => {
  const c = code(read("src/app/(app)/layout.tsx"));
  assert.match(c, /const coach = await coachForViewer\(/, "the layout does not resolve a coach");
  const opens = (c.match(/<CoachProvider value=\{coach\}>/g) || []).length;
  assert.equal(opens, 2,
    "expected the provider on both the trainer branch and the client branch, found " + opens);
  // NotificationProvider renders the "X messaged you" toast and reads the coach
  // name, so it has to be INSIDE.
  assert.ok(c.indexOf("<CoachProvider") < c.indexOf("<NotificationProvider>"),
    "NotificationProvider is outside CoachProvider — the toast falls back to the owner's name");
});

test("the in-app message toast names the viewer's own coach", () => {
  const c = code(read("src/lib/useNotificationFeed.tsx"));
  assert.match(c, /coachFirstName: coach\.firstName/,
    'a client of Stephanie\'s who is messaged by Stephanie is told "Dustin messaged you"');
});

// ─── no client-facing surface may name the owner unconditionally ────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(process.cwd(), dir))) {
    const rel = dir + "/" + e;
    if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

// Files that may legitimately still read the constant, each for a stated reason.
const ALLOWED = new Map<string, string>([
  // The workout logger is off limits without per-item permission, and its three
  // remaining hits are inside JSX comments quoting Dustin's design decisions —
  // not rendered to anybody.
  ["src/app/(app)/workout/[dayId]/WorkoutLogger.tsx", "comments only, and the file is off limits"],
]);

test("no rendered component names the coach from the build-time constant", () => {
  const offenders: string[] = [];
  for (const f of [...walk("src/components"), ...walk("src/app")]) {
    if (ALLOWED.has(f)) continue;
    const c = code(read(f));
    // The import line itself is fine — what matters is a USE in rendered output.
    const uses = c.replace(/^import .*$/gm, "");
    if (/\bCOACH_FIRST_NAME\b|\bCOACH_NAME\b/.test(uses)) offenders.push(f);
  }
  assert.deepEqual(offenders, [],
    "these render the owner's name to every client of every trainer:\n  " + offenders.join("\n  "));
});

test("nothing hardcodes the owner's surname where no setting can reach it", () => {
  // SlackerScreen had three: "Dr. Gautreaux, Head of Gains", "Dr. Gautreaux's
  // Diagnosis", "Detective Gautreaux is back on the case". Not even
  // NEXT_PUBLIC_COACH_NAME could change them, so a client of Stephanie's was
  // diagnosed and investigated by a man they have never met.
  //
  // The privacy policy is the one deliberate exception: it is a legal notice
  // that has to name the actual owner of the business, and it now does exactly
  // that ONCE, as the owner, while everything else in it says "your coach".
  const ALLOWED_SURNAME = new Set(["src/app/privacy/page.tsx"]);
  const offenders: string[] = [];
  for (const f of [...walk("src/components"), ...walk("src/app")]) {
    if (ALLOWED_SURNAME.has(f)) continue;
    const c = code(read(f));
    if (/Gautreaux/.test(c)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], "hardcoded surname in: " + offenders.join(", "));
});

test("the privacy policy describes a studio with more than one trainer", () => {
  // It told every client of every trainer that their progress photos and
  // messages were visible to Dustin. For Stephanie's clients that was either
  // false or an undisclosed disclosure, and it is a legal notice about health
  // data either way.
  const c = read("src/app/privacy/page.tsx");
  assert.match(c, /Where this policy says <b>your coach<\/b>/,
    "the policy does not define what 'your coach' means");
  assert.match(c, /Another trainer at the\s+studio cannot see any of it\./,
    "the policy does not state that trainers are separated from each other");
  assert.match(c, /<b>The studio owner<\/b> \(Dustin Gautreaux\)/,
    "the policy does not disclose the owner's access — which RLS does grant, so silence here would be the inaccurate version");
  assert.ok(!/visible to you and to Dustin/.test(c),
    "photos are still described as visible to the owner rather than to the client's coach");
});

// ─── the two photographs of the owner ───────────────────────────────────────

test("the celebration photos of the owner are shown only to the owner's clients", () => {
  const c = code(read("src/components/CelebrationScreen.tsx"));
  for (const f of ["/coach-flex.webp", "/coach-head.webp"]) {
    assert.ok(c.includes(f), f + " is gone — if it was removed on purpose, remove this assertion too");
  }
  // Both are cutouts of one specific man. Guarded, they are a nice card; not
  // guarded, they are a stranger's photograph captioned COACH APPROVED.
  assert.match(c, /coachIsOwnerWithCutout \? \(\s*<img\s*src="\/coach-flex\.webp"/,
    "the flex cutout is not gated on the viewer's coach being the owner");
  assert.match(c, /src=\{coachIsOwnerWithCutout \? "\/coach-head\.webp" : \(coachFaceUrl as string\)\}/,
    "the apparition is not gated on the viewer's coach being the owner");
  // And no face at all means no card, rather than an empty frame.
  assert.match(c, /if \(bigPr && topPr && hasCoachFace\)/,
    "the apparition still fires for a coach with no photograph on file");
});

test("the celebration bodyweight unit is the client's own coach", () => {
  const c = code(read("src/app/api/celebration/route.ts"));
  assert.ok(!/\.eq\("email", COACH_EMAIL\)/.test(c),
    "every client is told their volume in units of the OWNER's bodyweight — his health data, on their screen");
  assert.match(c, /from\("trainers"\)\.select\("email, first_name, name"\)\.eq\("id", tid\)/,
    "the coach is not resolved from the client's own trainer");
  assert.match(c, /system: SYSTEM\(coachFirstName\)/,
    "the celebration line is still written as the owner");
});

// ─── the group chat shows whoever posted ────────────────────────────────────

test("a coach's group post carries their coach photo", () => {
  const c = code(read("src/app/(app)/messages/page.tsx"));
  assert.match(c, /from\("trainers"\)[\s\S]{0,200}?avatar_url/,
    "group avatars are built from the clients table alone, so a coach appears only if they happen to also be a client, wearing whatever photo is on THAT row");
  // Applied after the client loop, so a coach's own client row cannot win.
  assert.ok(c.indexOf('senderAvatars[cc.auth_user_id]') < c.indexOf('senderAvatars[t.auth_user_id]'),
    "the trainer pass runs before the client pass and gets overwritten");
});

// ─── the AI coach speaks as the right person ────────────────────────────────

test("the nutrition coach prompt is a function of the coach's name", () => {
  const c = code(read("src/lib/ai/coach-context.ts"));
  assert.match(c, /export const COACH_SYSTEM_PROMPT = \(coachFirstName: string/,
    "a module constant names one trainer for every client in the business");
  assert.ok(!/\$\{COACH_FIRST_NAME\}/.test(c.slice(c.indexOf("COACH_SYSTEM_PROMPT"), c.indexOf("export interface DayTotal"))),
    "the prompt still interpolates the build-time constant");
  // Exported as coachNameForClient on 22 Aug so assistantContext can resolve the
  // same name — it needed one to address a self-coaching trainer correctly.
  assert.match(c, /async function coachNameForClient\(db: Db, clientId: string\)/,
    "there is no per-client resolution to feed it");
});

test("the group-chat birthday prompt interpolates rather than printing its own placeholder", () => {
  // It was `{COACH_FIRST_NAME}` — no `$` — inside a template literal, so the
  // model received those literal characters. Green tests throughout.
  const c = read("src/lib/birthdays.ts");
  assert.ok(!/[^$]\{COACH_FIRST_NAME\}/.test(c),
    "the missing $ is back: the model is being handed the placeholder text");
});

// ─── every prompt a client's words come out of names THEIR coach ────────────

test("no AI prompt bakes the coach's name in at import time", () => {
  // A `const X = \`...${COACH_FIRST_NAME}...\`` is evaluated once, when the
  // module loads. Whatever name it captures is the name every client of every
  // trainer gets — and these are the strings that decide whose voice the app
  // speaks in.
  const PROMPT_FILES = [
    "src/lib/ai/system-prompt.ts",
    "src/lib/ai/app-guide.ts",
    "src/lib/ai/coach-context.ts",
    "src/lib/ai/weekly-numbers.ts",
    "src/app/api/celebration/route.ts",
    "src/app/api/cron/weekly-ai/route.ts",
    "src/app/api/coach/focus-suggestions/route.ts",
    "src/app/api/ai-nudges/route.ts",
    "src/app/api/attention-drafts/route.ts",
    "src/app/api/workout-ai/route.ts",
    "src/app/api/agent/route.ts",
  ];
  const offenders: string[] = [];
  for (const f of PROMPT_FILES) {
    const c = code(read(f));
    // Anything still interpolating the CONSTANT rather than a parameter.
    for (const m of c.matchAll(/\$\{COACH_(?:FIRST_)?NAME\}/g)) {
      const line = c.slice(0, m.index).split("\n").length;
      offenders.push(`${f}:${line}`);
    }
  }
  assert.deepEqual(offenders, [],
    "these interpolate the build-time constant into a prompt:\n  " + offenders.join("\n  "));
});

test("the trainer agent addresses whoever is signed in", () => {
  // Dustin, 20 Aug: "her AI bots in her trainer app all act the exact same way
  // that mine do." Same rules, same tools — addressed to the right person. The
  // persona used to say the business was "his" and that the owner "is the only
  // user".
  const c = code(read("src/app/api/agent/route.ts"));
  assert.match(c, /const SYSTEM = \(coachFirstName: string\)/,
    "the agent persona is a module constant again");
  assert.ok(!/is the only user; act on his behalf/.test(c),
    "the agent still tells the model the owner is its only user");
  assert.match(c, /const base = SYSTEM\(me\.firstName\)/,
    "the persona is not built from the signed-in trainer");
});

// ─── the AI's face is per coach too ─────────────────────────────────────────

test("faceSrc puts the coach's set in the path, and no set means the original", async () => {
  const { faceSrc, ALL_MOODS } = await import("../../src/lib/ai/faces.ts");
  assert.equal(faceSrc("pr"), "/bots/pr.webp");
  assert.equal(faceSrc("pr", "steph"), "/bots/steph/pr.webp");
  assert.equal(faceSrc(null, "steph"), "/bots/steph/neutral.webp");
  // A trainer with no set of their own must land on the original art, never on
  // a 404 — a broken image on a coach badge is worse than the wrong cartoon.
  assert.equal(faceSrc("pr", null), "/bots/pr.webp");
  assert.equal(faceSrc("pr", ""), "/bots/pr.webp");
  assert.ok(ALL_MOODS.length >= 20);
});

test("every mood has artwork in every set that exists", async () => {
  // A half-copied folder is the failure mode here: the set resolves, most faces
  // load, and one mood 404s on whichever screen happens to use it. Cheap to
  // check, impossible to notice by eye across twenty moods.
  const { ALL_MOODS } = await import("../../src/lib/ai/faces.ts");
  const sets = readdirSync(join(process.cwd(), "public/bots"))
    .filter((e) => statSync(join(process.cwd(), "public/bots", e)).isDirectory());
  assert.ok(sets.includes("steph"), "Stephanie's set is missing from /public/bots");
  const missing: string[] = [];
  for (const set of ["", ...sets]) {
    for (const mood of ALL_MOODS) {
      const rel = set ? `public/bots/${set}` : "public/bots";
      // Two moods share one file by design (`quiet` reuses `thinking`), so
      // resolve through faceSrc rather than assuming mood === filename.
      const { faceSrc } = await import("../../src/lib/ai/faces.ts");
      const file = faceSrc(mood, set || null).replace(/^\//, "public/");
      try { statSync(join(process.cwd(), file)); }
      catch { missing.push(`${set || "(default)"}/${mood} → ${file}`); }
      void rel;
    }
  }
  assert.deepEqual(missing, [], "moods with no artwork:\n  " + missing.join("\n  "));
});

test("the client's own AI surfaces wear their coach's set; the group chat does not", () => {
  for (const f of ["src/components/AiBadge.tsx", "src/components/CoachFab.tsx",
                   "src/components/BigCoachBar.tsx"]) {
    const c = code(read(f));
    assert.match(c, /useCoach\(\)/, f + " does not resolve the viewer's coach");
    assert.match(c, /faceSrc\([^)]*botSet\)/, f + " draws a fixed set for everybody");
  }
  // The group chat is shared by decision, so Coach Bot is ONE voice in it. Two
  // different bots posting the same kind of message would read as two bots.
  const msgs = code(read("src/app/(app)/messages/MessagesClient.tsx"));
  assert.match(msgs, /faceSrc\("messages"\)/,
    "the group-chat bot became per-coach — the shared room should keep one bot");
});

test("the coach identity carries the set, and defaults to no set", async () => {
  const { DEFAULT_COACH } = await import("../../src/lib/coachIdentity.ts");
  assert.equal(DEFAULT_COACH.botSet, null);
  const c = code(read("src/lib/coachIdentity.ts"));
  assert.match(c, /bot_set/, "the trainers query does not select bot_set");
  assert.match(c, /botSet: \(row\.bot_set as string\) \|\| null/);
});

// ─── the last of the build-time constant, and two standing decisions ────────

test("no prompt anywhere still bakes a coach name in at import time", () => {
  // The widened version of the earlier check: every prompt file, including the
  // trainer-facing ones. `${COACH_FIRST_NAME}` inside a template literal is
  // evaluated once when the module loads, so whatever name it captures is the
  // name everyone gets.
  const PROMPTS = [
    "src/lib/ai/system-prompt.ts", "src/lib/ai/app-guide.ts",
    "src/lib/ai/coach-context.ts", "src/lib/ai/weekly-numbers.ts",
    "src/lib/ai/agent-tools.ts", "src/lib/birthdays.ts",
    "src/app/api/celebration/route.ts", "src/app/api/cron/weekly-ai/route.ts",
    "src/app/api/cron/coachbot/route.ts", "src/app/api/cron/birthdays/route.ts",
    "src/app/api/coach/focus-suggestions/route.ts", "src/app/api/ai-nudges/route.ts",
    "src/app/api/attention-drafts/route.ts", "src/app/api/workout-ai/route.ts",
    "src/app/api/agent/route.ts", "src/app/api/weekly-brief/route.ts",
    "src/app/api/workout-assist/route.ts", "src/app/api/nutrition-ai/plan-build/route.ts",
    "src/app/api/assessment-recommend/route.ts",
  ];
  const offenders: string[] = [];
  for (const f of PROMPTS) {
    const c = code(read(f));
    for (const m of c.matchAll(/\$\{COACH_(?:FIRST_)?NAME\}/g)) {
      offenders.push(`${f}:${c.slice(0, m.index).split("\n").length}`);
    }
  }
  assert.deepEqual(offenders, [], "interpolate the constant into a prompt:\n  " + offenders.join("\n  "));
});

test("nothing a client can read names a coach it has not resolved", () => {
  // Error copy is easy to forget because nobody reads it until something has
  // already gone wrong. These all said "Ask Dustin".
  for (const f of ["src/lib/ai/scope.ts", "src/lib/ai/meter.ts",
                   "src/app/api/workout-manual/route.ts", "src/app/api/recipes/route.ts",
                   "src/app/api/ai-assistant/route.ts", "src/app/api/nutrition-ai/plan-build/route.ts"]) {
    const c = code(read(f));
    assert.ok(!/error: `[^`]*\$\{COACH_(?:FIRST_)?NAME\}/.test(c),
      f + " names the owner in a message a client of either trainer can see");
  }
});

test("the install manifest names nobody", () => {
  // One manifest per deployment, fetched before any session exists and baked
  // into the home-screen install. It said "with Dustin" and offered a "Message
  // Dustin" shortcut, to every client of every trainer.
  const c = code(read("src/app/manifest.ts"));
  assert.ok(!/COACH_(?:FIRST_)?NAME/.test(c), "the manifest is back to naming a coach");
  assert.match(c, /description: "Your programme, your food, your progress\."/);
  assert.match(c, /name: "Message your coach"/);
});

test("an owner announcement reaching every client is recorded as a decision", () => {
  // Dustin, 21 Aug: "yes for announcements about the app all clients need to
  // get it." It looks exactly like a scoping hole — the owner branch of
  // trainer_can_see_client returning the whole business — so it is written down
  // where someone tightening the scoping will read it.
  const c = read("src/app/(app)/home/messageActions.ts");
  assert.match(c, /THE OWNER'S ANNOUNCEMENT REACHES EVERY CLIENT OF EVERY TRAINER, AND THAT IS\n\/\/ THE DECISION/,
    "the deliberate breadth of a broadcast is undocumented and reads as a bug");
});

test("the group bots are handed their room's coach explicitly", () => {
  // One room, one voice. Passing the name in rather than reading a constant is
  // what makes that a decision rather than a coincidence that survives only
  // while the constant happens to hold the right value — and it is what lets
  // these bots run per room later without touching the prompt files.
  //
  // The rooms were split per trainer on 21 Aug. Both bots still post in the
  // OWNER's room, so the coach they resolve is still the owner; birthdays now
  // reads it off the same `roomTrainer` row it stamps group_trainer_id from,
  // which is the same fact under a name that will survive the follow-up.
  for (const [f, sym] of [["src/app/api/cron/coachbot/route.ts", "SYSTEM"],
                          ["src/lib/birthdays.ts", "BIRTHDAY_SYSTEM"]] as const) {
    const c = code(read(f));
    assert.match(c, new RegExp(`(?:export )?const ${sym} = \\(coachFirstName: string\\)`),
      f + " builds the group prompt from a module constant again");
  }
  for (const f of ["src/app/api/cron/coachbot/route.ts", "src/app/api/cron/birthdays/route.ts"]) {
    assert.match(code(read(f)), /ownerTrainer\(db\)\)\?\.firstName|roomTrainer\?\.firstName/,
      f + " does not resolve a real coach for the room it posts in");
  }
});

test("the prank is gone, not merely expired", () => {
  // It was an expired one-off gag aimed at two family addresses, still mounted
  // on every client dashboard load at z-index 99999 — the highest in the app.
  // Removed 21 Aug in the takeover cull. Re-adding it would put a flashing fake
  // invoice back above every other screen.
  assert.ok(!existsSync(join(process.cwd(), "src/components/PrankInvoice.tsx")), "PrankInvoice is back");
});
