// ============================================================================
// The re-engagement sweep is OFF, and stays off until somebody decides it is on.
//
// Dustin, 21 Aug: "stop that for now. keep engine for later if i decide to add
// it back."
//
// What it was doing: writing a message about every active client, in his voice,
// every night — ~30 drafts a run, 657 rows — and then storing them somewhere
// nothing in the app reads. The Settings row called it a digest that "sends the
// list to you". No such list exists. The client-DM path was deleted on 13 Aug
// and nothing replaced it, so every draft since has been written and buried.
//
// TWO switches, because either alone is a way back on by accident:
//
//   1. It is unscheduled. vercel.json was what actually fired it — nightly, in
//      spite of a Monday cron string — so removing it is what stops the spend.
//   2. It is flag-gated on app_flags.nudges_live, which is false. That makes
//      reviving it one row rather than a deploy, and stops a stray manual call
//      from starting a sweep in the meantime.
//
// The ENGINE is deliberately untouched: segment.ts, the guardrails, the copy,
// and tests/unit/nudgeSegments.test.ts all stay. This file guards the OFF, not
// the engine — if it ever fails, read it as "the sweep came back on", and check
// that was on purpose.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const route = fs.readFileSync(path.join(ROOT, "src/app/api/ai-nudges/route.ts"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

describe("the nudge sweep is off", () => {
  it("is not on a schedule", () => {
    const scheduled = (vercel.crons ?? []).map((c: { path: string }) => c.path);
    assert.ok(
      !scheduled.some((p: string) => p.startsWith("/api/ai-nudges")),
      "/api/ai-nudges is scheduled again. This is the switch that actually spends money — " +
        "it ran NIGHTLY off this entry, not weekly as its cron string claimed.",
    );
  });

  it("refuses to run unless the flag says so", () => {
    assert.match(
      route,
      /readFlag\(admin, "nudges_live"\)/,
      "the route must read nudges_live before doing anything",
    );
    // And bail on it. A flag that is read and then ignored is the state this
    // route was already in for weeks.
    assert.match(
      route,
      /if \(!live\) \{[\s\S]{0,300}return NextResponse\.json/,
      "reading the flag is not enough — the route has to return early when it is off",
    );
  });

  it("checks the flag before it can spend anything", () => {
    const flagAt = route.indexOf('readFlag(admin, "nudges_live")');
    // The CALL, not the import at the top of the file.
    const spendAt = route.indexOf("await callClaudeJson<");
    assert.ok(flagAt > 0 && spendAt > 0, "expected both the flag check and the model call");
    assert.ok(
      flagAt < spendAt,
      "the flag is checked AFTER the model call — an off sweep would still pay for itself",
    );
  });
});

describe("the engine is kept, not deleted", () => {
  const kept = [
    "src/app/api/ai-nudges/segment.ts",
    "src/app/api/ai-nudges/route.ts",
    "tests/unit/nudgeSegments.test.ts",
  ];
  for (const f of kept) {
    it(`${f} still exists`, () => {
      assert.ok(
        fs.existsSync(path.join(ROOT, f)),
        `${f} was deleted. "Keep engine for later" means the segmentation survives being ` +
          "switched off — turning it back on must not mean rewriting it.",
      );
    });
  }
});

describe("settings do not promise a digest nobody receives", () => {
  // Comments stripped: the phrase survives in the note explaining why the claim
  // was removed, and an explanation must never fail a test about the code.
  const settings = fs
    .readFileSync(path.join(ROOT, "src/components/ExperienceSettings.tsx"), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  it("does not claim the list is sent to the trainer", () => {
    assert.doesNotMatch(
      settings,
      /sends the list to you/,
      "no such list exists — nothing in src/ reads ai_nudge_log. A settings row describing " +
        "delivery the code never performs is the one a person trusts.",
    );
  });
});
