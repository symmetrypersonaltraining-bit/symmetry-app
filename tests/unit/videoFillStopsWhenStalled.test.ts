import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE MEASURE LOOP MUST STOP WHEN IT STOPS MAKING PROGRESS.
 *
 * Found live on 14 Aug 2026, driving "Measure and fill them in" against 237
 * pending candidates. The screen reported:
 *
 *     "Done — 2 videos added from 750 checked."
 *
 * 750 is not 237. It is 25 × 30 — the loop's own round cap times its batch
 * size. The route had handed back the SAME oldest thirty rows twenty-five
 * times, and the word "Done" was covering for it.
 *
 * The mechanism, and the reason a count cap alone cannot catch it:
 *
 *   1. `verifyOne` returns `unverified` when YouTube will not answer.
 *   2. On `unverified` the route deliberately WRITES NOTHING, so that a row
 *      lost to a transient blip is retried instead of being buried.
 *   3. Therefore `duration_sec` stays null, the row stays `pending`, and the
 *      next call's `.is("duration_sec", null).limit(30)` selects it again.
 *   4. `remaining` never falls. The loop's only exit was `!remaining`.
 *
 * When YouTube blocks Vercel's IPs wholesale — which is what was happening, a
 * verified `{checked:30, ok:0, dead:0, too_long:0, unverified:30}` — every row
 * takes that path. The result is 750 pointless outbound fetches, 25 function
 * invocations, zero writes, and a success message.
 *
 * That last part is the actual defect. This app has reported a save that did
 * not happen before, and the lesson written down then was that a run which
 * accomplished nothing must never render the same as a run with nothing left
 * to do. So:
 *
 *   - the loop breaks as soon as a round fails to reduce `remaining`
 *   - the stalled message says nothing was changed, and why
 *
 * If someone later removes the no-progress break to "simplify" the loop, this
 * test fails and explains what it cost.
 */

const ROOT = process.cwd();
const SRC = join(ROOT, "src/app/(app)/library/videos/VideoQueueClient.tsx");

/** Comments describe the rule; they must not be able to satisfy it. */
function codeOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !(
        t.startsWith("//") ||
        t.startsWith("*") ||
        t.startsWith("/*") ||
        t.startsWith("*/")
      );
    })
    .join("\n");
}

test("the fill loop still exists and is still bounded by a round cap", () => {
  const code = codeOnly(readFileSync(SRC, "utf8"));
  assert.match(
    code,
    /let\s+guard\s*=\s*\d+/,
    "the round cap is gone — a runaway loop is back on the table",
  );
  assert.match(
    code,
    /while\s*\(\s*guard--\s*>\s*0\s*\)/,
    "the loop no longer decrements the round cap",
  );
});

test("the loop tracks the previous remaining count", () => {
  const code = codeOnly(readFileSync(SRC, "utf8"));
  assert.match(
    code,
    /prevRemaining/,
    "nothing remembers last round's remaining count, so no-progress cannot be detected",
  );
});

test("the loop breaks when remaining fails to fall", () => {
  const code = codeOnly(readFileSync(SRC, "utf8"));
  assert.match(
    code,
    /remaining\s*>=\s*prevRemaining/,
    "the no-progress comparison is gone — the loop can spin its full cap against the same rows again",
  );
  // The comparison has to actually terminate the loop, not merely be computed.
  const idx = code.indexOf("remaining >= prevRemaining");
  assert.ok(idx > -1);
  assert.match(
    code.slice(idx, idx + 200),
    /break/,
    "the no-progress branch does not break out of the loop",
  );
});

test("a stalled run does not report success", () => {
  const src = readFileSync(SRC, "utf8");
  const code = codeOnly(src);
  assert.match(
    code,
    /stalled/,
    "the stalled state is gone — a run that measured nothing will read as 'Done' again",
  );
  // The stalled message must not open with the success word.
  assert.doesNotMatch(
    code,
    /stalled\s*\?\s*`Done/,
    "the stalled branch reports 'Done', which is the exact bug this test exists to prevent",
  );
  assert.match(
    code,
    /Stopped —/,
    "the stalled message no longer distinguishes itself from the success message",
  );
  assert.match(
    code,
    /nothing was changed/,
    "the stalled message no longer tells the trainer that nothing was written",
  );
});

test("'unverified' is still a no-write path in the route, which is what makes the guard necessary", () => {
  const route = readFileSync(
    join(ROOT, "src/app/api/video-candidates/verify/route.ts"),
    "utf8",
  );
  const code = codeOnly(route);
  assert.match(
    code,
    /v\.status\s*===\s*"unverified"\s*\)\s*return\s+Promise\.resolve\(\)/,
    "unverified no longer short-circuits without writing — if that changed deliberately, re-read the loop guard, " +
      "because the retry-forever behaviour it defends against may no longer be possible",
  );
});
