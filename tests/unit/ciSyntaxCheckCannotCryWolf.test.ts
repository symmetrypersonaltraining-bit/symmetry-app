import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE "SYNTAX CHECK" JOB MUST ONLY FAIL ON ACTUAL SYNTAX ERRORS.
 *
 * Dustin, 14 Aug 2026, looking at an inbox of GitHub failure mail:
 * "wtf is scheduled that keeps failing and sending me emails!?"
 *
 * Nothing was scheduled. `Syntax Check` runs on every push to main, and it had
 * been failing on every push for weeks — one email per commit, twenty-two of
 * them from a single night's work — while the code parsed perfectly and every
 * local gate was green.
 *
 * Two independent faults had to line up:
 *
 *   1. `tsconfig.json` targeted **ES2017**, but two guard tests use the regex
 *      `s` (dotAll) flag, which needs ES2018+. tsc emitted TS1501 for each.
 *   2. The workflow matched failures with a bare `grep "error TS1"`. That is
 *      not "TS1xxx parse errors" — it is any code STARTING with TS1, so it also
 *      swept up TS15xx/TS16xx/TS17xx/TS18xx, which are CONFIG errors. TS1501 is
 *      a config error. The job failed itself on its own compiler settings.
 *
 * Neither test was wrong. `noDuplicateRows` is the guard that stops anyone
 * adding a NULL-covering unique index to `workout_logs` — the near-miss that
 * would have deleted Robert Miller's four real training sessions from 31 Aug
 * 2024. Weakening either regex to appease the target would have been fixing the
 * wrong end.
 *
 * So: the target moved to ES2018 (making the flags legal) AND the grep was
 * bounded to TypeScript's genuinely syntactic range, TS1000–TS1499.
 *
 * The cost of this class of bug is not the red X, it is the habituation. A gate
 * that fails on every green commit teaches you to ignore the mail, and the next
 * failure — a real one — arrives looking exactly like the noise.
 */

const ROOT = process.cwd();

test("tsconfig targets ES2018 or later, so the dotAll guard regexes stay legal", () => {
  const raw = readFileSync(join(ROOT, "tsconfig.json"), "utf8");
  const m = raw.match(/"target"\s*:\s*"([^"]+)"/i);
  assert.ok(m, "tsconfig.json no longer declares a target");

  const target = m![1].toUpperCase();
  // ESNEXT and the year-named targets from ES2018 on are all fine.
  if (target === "ESNEXT") return;

  const year = Number(target.replace(/^ES/, ""));
  assert.ok(
    Number.isFinite(year) && year >= 2018,
    `tsconfig target is ${m![1]}; the dotAll (/s) regexes in metricSheetReach and ` +
      `noDuplicateRows need ES2018+. Dropping below it makes tsc emit TS1501 and ` +
      `fails CI on every push.`,
  );
});

test("the Syntax Check grep is bounded to the parse-error range, not open-ended TS1", () => {
  const raw = readFileSync(join(ROOT, ".github/workflows/syntax-check.yml"), "utf8");

  // Strip YAML comments before searching. The workflow's own comment QUOTES the
  // bad pattern in order to explain it, and on the first run of this test that
  // comment satisfied the check it was documenting — the exact trap the project
  // notes list first under "things that will bite you".
  const wf = raw
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");

  assert.doesNotMatch(
    wf,
    /grep\s+"error TS1"/,
    'the bare grep "error TS1" is back — it matches TS15xx/16xx/17xx/18xx config ' +
      "errors too, which is what made this job fail on every push for weeks",
  );
  assert.match(
    wf,
    /error TS1\[0-4\]\[0-9\]\[0-9\]:/,
    "the bounded TS1000-TS1499 pattern is gone; the job can go back to failing on " +
      "config errors it was never meant to police",
  );
});

test("the two guard regexes that triggered this still use the dotAll flag", () => {
  // If someone 'fixes' CI by stripping the flags instead, the tests silently
  // stop spanning newlines and quietly match less than they claim to.
  const metric = readFileSync(join(ROOT, "tests/unit/metricSheetReach.test.ts"), "utf8");
  const dupes = readFileSync(join(ROOT, "tests/unit/noDuplicateRows.test.ts"), "utf8");

  assert.match(
    metric,
    /from\\\("metrics"\\\)[^\n]*\/s/,
    "metricSheetReach's upsert regex lost its /s flag — it no longer spans lines",
  );
  assert.match(
    dupes,
    /nulls not distinct\/is/,
    "noDuplicateRows' workout_logs guard lost its /is flags — this is the test that " +
      "protects four real training sessions from being deleted as duplicates",
  );
});
