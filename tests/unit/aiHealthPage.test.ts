import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AI_FEATURE_KEYS } from "../../src/lib/ai/meter-core";

const ROOT = process.cwd();
const PAGE = fs.readFileSync(path.join(ROOT, "src/app/(app)/settings/ai-health/page.tsx"), "utf8");
const TABLE = fs.readFileSync(path.join(ROOT, "src/app/(app)/settings/ai-health/AiHealthTable.tsx"), "utf8");
const SETTINGS = fs.readFileSync(path.join(ROOT, "src/app/(app)/settings/SettingsClient.tsx"), "utf8");

// The whole point of this page is that it lists EVERY surface, including the
// ones with no rows in the log. Building it from the log instead of from the
// registry would silently omit exactly the features it exists to surface: the
// trainer agent, which had run once ever, and the nudge sweep, which had never
// run at all, both had no usable log history when this was written.
test("the page enumerates the registry, not the log", () => {
  assert.match(
    PAGE,
    /AI_FEATURE_KEYS\.map/,
    "the page builds its list from log rows — a feature that has never worked will not appear, " +
      "which is the one case this page exists for"
  );
  assert.ok(AI_FEATURE_KEYS.length >= 20, "the registry shrank; check nothing was dropped");
});

test("it leads with never-used and failing, not with a wall of healthy rows", () => {
  const neverAt = TABLE.indexOf("Never used");
  const failingAt = TABLE.indexOf('title="Failing"');
  const workingAt = TABLE.indexOf('title="Working"');
  assert.ok(neverAt > -1 && failingAt > -1 && workingAt > -1, "a section is missing");
  assert.ok(neverAt < workingAt, "the never-used section moved below the working list");
  assert.ok(failingAt < workingAt, "the failing section moved below the working list");
});

test("failing means RECENTLY failing", () => {
  // A surface that failed twice in March and has worked daily since is not
  // failing. One that has failed its last three calls is, whatever its
  // lifetime count looks like.
  assert.match(
    TABLE,
    /recentFailed/,
    "the failing bucket is computed from lifetime failures, so anything with an old error is permanently red"
  );
  assert.match(PAGE, /mine\.slice\(0, 10\)/, "the recent window is gone; failures are being judged over all time");
});

test("it is trainer-only and read-only", () => {
  assert.match(PAGE, /isTrainerEmail\(user\.email\)/, "a client can open the trainer's spend page");
  assert.match(PAGE, /redirect\("\/home"\)/);
  for (const verb of [".insert(", ".update(", ".delete(", ".upsert("]) {
    assert.ok(!PAGE.includes(verb) && !TABLE.includes(verb), `AI health writes to the database (${verb}) — it must only read`);
  }
});

test("there is a way to reach it", () => {
  assert.match(SETTINGS, /\/settings\/ai-health/, "nothing links to the page, so nobody will ever see it");
  const linkAt = SETTINGS.indexOf("/settings/ai-health");
  const gate = SETTINGS.lastIndexOf("isTrainer && !isInClientMode", linkAt);
  assert.ok(linkAt - gate < 900, "the AI health link is not behind the trainer gate — clients can see it in Settings");
});
