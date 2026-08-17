// Guard: Client View shows the same things the real client app shows.
//
// ── WHAT HAPPENED ──────────────────────────────────────────────────────────
//
// Dustin, 16 Aug: "what happened to the goal setting feature we added for
// clients? i don't see it in my client app..."
//
// It was never missing. `/progress` — the screen an actual client opens — has
// mounted GoalsSection since 938e1a8, and his own goal (weight → 185 by 30 Sep)
// has been sitting in `client_goals` as `active` since 14 Aug.
//
// `/client-preview/progress` is the Client View copy of that screen, and it is
// where HE looks. It mounted MetricCards, ConsistencyCalendar, AchievementCard,
// ProgressPhotos, ThenVsNow and PersonalBests — everything except the one thing
// added most recently.
//
// The file already carried this warning, in its own words, from the last time
// the two drifted:
//
//   "This is the Client View copy of the same screen and it was missed the
//    first time, which is why the Streak tile was still sitting against the
//    Consistency card here after the other page was fixed. Any change to one of
//    these two belongs in both."
//
// A comment asking people to remember is not a mechanism. This is the mechanism.
//
// ── WHY A SET COMPARISON RATHER THAN A LIST OF NAMES ───────────────────────
//
// Hard-coding "these six components must appear" would need editing every time
// a card is added, and the edit that gets forgotten is exactly the one this is
// meant to catch. Comparing the two screens to each other means a new card is
// covered the moment it lands on either one, with no test change at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const CLIENT = read("src/app/(app)/progress/page.tsx");
const PREVIEW = read("src/app/(app)/client-preview/progress/page.tsx");

/** Components imported from @/components AND actually rendered. */
function rendered(src: string): Set<string> {
  const imported = new Set<string>();
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+"@\/components\/[^"]+"/g)) {
    imported.add(m[1]);
  }
  const out = new Set<string>();
  for (const name of imported) {
    if (new RegExp(`<${name}[\\s/>]`).test(src)) out.add(name);
  }
  return out;
}

// Trainer-only furniture. ClientSelector is the "Viewing: <client>" dropdown,
// which by definition has no place on a screen pretending to be the client's.
const TRAINER_ONLY = new Set(["ClientSelector"]);

test("Client View renders every card the real client screen renders", () => {
  const client = rendered(CLIENT);
  const preview = rendered(PREVIEW);
  const missing = [...client].filter((c) => !preview.has(c) && !TRAINER_ONLY.has(c));
  assert.deepEqual(
    missing,
    [],
    `Client View is missing ${missing.join(", ")} — Dustin looks at this screen, so anything absent here reads as the feature not existing`,
  );
});

test("Client View does not grow cards the real client screen lacks", () => {
  // The other direction matters too: a card only Dustin can see, on a screen
  // whose entire purpose is showing him what his clients see, is a worse lie
  // than a missing one.
  const client = rendered(CLIENT);
  const preview = rendered(PREVIEW);
  const extra = [...preview].filter((c) => !client.has(c));
  assert.deepEqual(extra, [], `Client View shows ${extra.join(", ")}, which no client can see`);
});

test("goals are on both, by name", () => {
  // The specific regression that prompted this. Named explicitly as well as
  // covered by the set comparison, so the failure message says "goals" rather
  // than something generic if it ever comes back.
  assert.match(CLIENT, /<GoalsSection/, "the real client Progress screen lost goals");
  assert.match(PREVIEW, /<GoalsSection/, "Client View lost goals — this is the bug Dustin reported on 16 Aug");
});

test("the trainer cannot answer a goal proposal from either screen", () => {
  // viewerIsThisClient gates the accept/decline buttons. A proposal exists so
  // the CLIENT can agree to it; a trainer clicking accept on their behalf makes
  // the whole state meaningless.
  assert.match(CLIENT, /viewerIsThisClient=\{!isTrainer\}/,
    "/progress no longer gates answering on who is looking");
  assert.match(PREVIEW, /viewerIsThisClient=\{false\}/,
    "Client View lets the trainer accept a goal on the client's behalf");
});
