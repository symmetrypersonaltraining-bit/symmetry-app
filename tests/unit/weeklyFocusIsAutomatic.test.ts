// ============================================================================
// The weekly focus writes itself, and says so when it doesn't.
//
// Dustin, 21 Aug: "correct i dont need to approve if the ai is set up to be
// accurate based on real numbers", and on the failure case: "notify me to find
// the cause of failure and get it fixed asap."
//
// The history this pins:
//   - 9 Aug  the Sunday publish crashed on `text = date`; drafts never landed.
//   - 15 Aug the Saturday sweep did not run at all.
//   - 21 Aug nobody had noticed either, for six and twelve days respectively,
//            because a missing focus looked exactly like a quiet week.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));
// Comments here quote the very words being asserted on. Strip them.
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the sweep is scheduled for late Saturday and publishes directly", () => {
  const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };
  const cron = vercel.crons.find((c) => c.path.startsWith("/api/cron/weekly-ai"));

  it("is still scheduled", () => {
    assert.ok(cron, "the weekly-ai cron is gone from vercel.json");
  });

  it("no longer runs in draft mode", () => {
    assert.ok(
      !cron!.path.includes("draft"),
      "weekly-ai is back on ?draft=1. The approval step was retired on 21 Aug; drafts go to a review screen that is no longer mounted, so this would publish nothing to anyone.",
    );
  });

  it("runs after the Sun-Sat week has finished, not partway through it", () => {
    // 03:00 UTC Sunday = 22:00 CT Saturday (21:00 CST in winter). The old slot
    // was 0 11 * * 6 — Saturday 6am — which graded a week that still had a day
    // and a half left in it.
    assert.equal(
      cron!.schedule,
      "0 3 * * 0",
      "the sweep moved off its Saturday-night slot. It must run after the week it grades has ended.",
    );
  });
});

describe("the sweep route has no approval path left", () => {
  const src = strip(read("src/app/api/cron/weekly-ai/route.ts"));

  it("does not write focus drafts", () => {
    assert.ok(
      !/weekly_focus_drafts/.test(src),
      "the sweep is writing to weekly_focus_drafts again — nothing publishes that table any more",
    );
  });

  it("has no draft mode", () => {
    assert.ok(!/draftFocus/.test(src), "draftFocus is back in the sweep");
  });

  it("stamps the week that is STARTING, not the one that just ended", () => {
    // Running late Saturday, weekStartOf(today) is the Sunday of the week now
    // ENDING. A focus stamped with it would be filtered out as stale by
    // ClientWeekSummary the instant it was published.
    assert.ok(
      /const week = weekStartOf\(nextDay\(today\)\)/.test(src),
      "the target week is no longer derived from tomorrow. On a Saturday-night run that publishes every line already stale.",
    );
  });

  it("still refuses to overwrite a focus the trainer wrote himself", () => {
    assert.ok(/trainerOwnsFocus/.test(src), "the trainer-wins guard is gone");
  });
});

describe("the approval takeover is off the home screen but not deleted", () => {
  const home = strip(read("src/app/(app)/home/TrainerHome.tsx"));

  it("SaturdayReview is not rendered", () => {
    assert.ok(
      !/<SaturdayReview\b/.test(home),
      "the full-screen focus-approval takeover is back on trainer home. There is nothing to approve — the sweep publishes directly.",
    );
  });

  it("nor imported", () => {
    assert.ok(!/from ["']@\/components\/SaturdayReview["']/.test(home), "SaturdayReview is imported again");
  });

  it("but the component still exists on disk", () => {
    assert.ok(
      exists("src/components/SaturdayReview.tsx"),
      "SaturdayReview was deleted. Keep it — same reasoning as TrainerWeekDigest: reinstating approval should not mean rebuilding it.",
    );
  });

  it("and the health card replaced it", () => {
    assert.ok(/<WeeklyFocusHealth\b/.test(home), "WeeklyFocusHealth is not on trainer home");
  });
});

describe("the watchdog lives outside the thing it watches", () => {
  const wd = "src/app/api/cron/focus-watchdog/route.ts";

  it("exists", () => {
    assert.ok(exists(wd), "the focus watchdog is gone");
  });

  const src = strip(read(wd));

  it("is not part of the weekly-ai route", () => {
    // The 15 Aug failure was the sweep never being invoked. An alert inside it
    // would have been just as absent as the run it was reporting on.
    const sweep = strip(read("src/app/api/cron/weekly-ai/route.ts"));
    assert.ok(
      !/RESEND_API_KEY/.test(sweep),
      "alerting moved into the sweep. It has to run somewhere the sweep is not, or a sweep that never fires never alerts.",
    );
  });

  it("is scheduler-authenticated", () => {
    assert.ok(
      /isCronRequest/.test(src) && /isDbSchedulerRequest/.test(src),
      "the watchdog is not gated to schedulers",
    );
  });

  it("alerts per trainer, not just the owner", () => {
    assert.ok(
      /from\("trainers"\)/.test(src),
      "the watchdog no longer reads the trainers table. Stephanie's one client is 100% of her roster and must not be rounded away inside Dustin's thirty.",
    );
  });

  it("records its marker before sending, so a failure cannot storm", () => {
    const markerAt = src.indexOf("ai_usage_log");
    const sendAt = src.indexOf("RESEND_API_URL,");
    assert.ok(markerAt > -1 && sendAt > -1 && markerAt < sendAt, "the dedupe marker is written after the send");
  });
});

describe("a trainer cannot switch off the alert that says the app broke", () => {
  const src = strip(read("src/lib/notificationEvents.ts"));

  it("SYSTEM_ALERT exists, is trainer-only and forced", () => {
    const block = src.slice(src.indexOf("SYSTEM_ALERT:"), src.indexOf("REACTION_ON_MY_MESSAGE:"));
    assert.ok(block.includes("trainerOnly: true"), "SYSTEM_ALERT is on clients' settings screens");
    assert.ok(
      block.includes("forced: true"),
      "SYSTEM_ALERT is switchable. A preference that silences it recreates the exact failure it reports.",
    );
  });
});
