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
// UPDATE, 1 Sep. "Keep engine for later" did not survive contact with how many
// times this had to be said. Dustin, five separate occasions, most recently:
// "nudge shoukd be gone period. 4th time this has come up."
//
// So the engine is gone too — route.ts and segment.ts are deleted, and this
// file now guards the ABSENCE. The database freeze that stopped it sending has
// been holding since 27 Aug (zero rows written; the all-time sent count has not
// moved off 20) and is left in place, because a table that nothing writes to is
// a cheaper guarantee than a file nobody has re-added yet.
//
// If this file ever fails, read it as "the sweep came back", and check that was
// on purpose.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
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

  it("has no route left to run", () => {
    // The strongest form of off. A flag can be flipped and a schedule can be
    // re-added; a file that does not exist has to be written again first.
    for (const f of ["src/app/api/ai-nudges/route.ts", "src/app/api/ai-nudges/segment.ts"]) {
      assert.ok(!fs.existsSync(path.join(ROOT, f)), f + " is back. Was that deliberate?");
    }
  });

  it("nothing in the app writes to the nudge ledger any more", () => {
    // ai_nudge_log survives as history. Nothing should add to it: the table was
    // the cooldown state for a sweep that no longer exists.
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir)) {
        const full = path.join(dir, e);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e)) {
          const src = fs.readFileSync(full, "utf8");
          if (/from\(["']ai_nudge_log["']\)[\s\S]{0,80}\.(insert|upsert|update)\(/.test(src)) {
            hits.push(path.relative(ROOT, full));
          }
        }
      }
    };
    walk(path.join(ROOT, "src"));
    assert.deepEqual(hits, [], "something is writing nudge cooldowns again");
  });
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
