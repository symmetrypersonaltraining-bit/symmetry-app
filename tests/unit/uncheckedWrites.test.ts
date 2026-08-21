// ============================================================================
// The unchecked-write ratchet.
//
// supabase-js RESOLVES with { data, error } — it does not throw. So
// `await db.from(t).update(...)` with the result discarded cannot fail
// visibly, and a try/catch around it catches nothing. Every incident in
// docs/UNCHECKED-WRITES-INVENTORY.md is that one shape: a screen, a reply or a
// cron summary reporting success for a write that was refused.
//
// The inventory has been swept by hand three times. This test is what stops it
// needing a fourth. It re-runs the sweep on every commit and fails if a write
// appears anywhere that is not on the list below.
//
// ADDING TO THE ALLOWLIST IS A DECISION, NOT A FORMALITY. Before you do, answer
// the one question the inventory turns on:
//
//     If this write fails, does anyone find out — or does the screen, the
//     reply, or the summary say it succeeded?
//
// If anybody is told it worked, check the write instead of listing it here.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

/**
 * Files permitted to contain unchecked writes, with the count as of the sweep
 * on 21 Aug 2026 and the reason. The count is a CEILING: adding another
 * unchecked write to one of these files fails too.
 */
const ALLOWED: Record<string, { max: number; why: string }> = {
  // ── Off limits by standing rule. Not to be touched without per-item
  //    permission, so they are listed to stay visible, not to be fixed.
  "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx": { max: 7, why: "workout logger — off limits" },
  "src/app/(app)/nutrition/MealPlanClient.tsx": { max: 3, why: "meal plan logger — off limits" },
  "src/app/(app)/nutrition/v3/NutritionV3Client.tsx": { max: 1, why: "nutrition logger — off limits" },

  // ── Telemetry and audit rows. A missing row here misleads nobody: the worst
  //    case is a gap in a log that only ever gets read after the fact.
  "src/lib/ai/clientMemory.ts": { max: 3, why: "ai_chat_turns / ai_client_memory — telemetry" },
  "src/lib/ai/agent-tools.ts": { max: 2, why: "ai_action_log — audit rows" },
  "src/app/api/workout-assist/route.ts": { max: 1, why: "ai_action_log — audit row" },
  "src/app/api/agent/route.ts": { max: 2, why: "ai_chat_sessions — conversation cache" },
  "src/app/api/agent/session/route.ts": { max: 1, why: "ai_chat_sessions — conversation cache" },
  "src/app/api/feedback/describe/route.ts": { max: 2, why: "app_feedback enrichment — internal queue only" },
  "src/app/api/cron/check-videos/route.ts": { max: 1, why: "files its own feedback row; the sweep result is reported separately" },

  // ── Seen-markers and read receipts. Failure means something shows once more
  //    than it should, which is the safe direction.
  "src/components/ClientTakeovers.tsx": { max: 1, why: "client_announcements_seen — seen marker" },
  "src/app/api/weekly-brief/route.ts": { max: 1, why: "week_brief_seen_week — the card reopens once at worst" },
  "src/app/(app)/messages/page.tsx": { max: 2, why: "read receipts" },
  "src/app/(app)/home/messageActions.ts": { max: 1, why: "markMessageRead — read receipt" },
  "src/components/MessageReactions.tsx": { max: 2, why: "message_reactions — optimistic emoji, corrects itself on reload" },

  // ── The sweep cannot see through a ternary. Both of these ARE checked:
  //    the result is assigned and the error inspected on the following lines.
  "src/app/(app)/schedule/scheduleActions.ts": { max: 2, why: "checked via a ternary the regex cannot follow" },
  "src/app/api/workout-manual/route.ts": { max: 1, why: "checked via a ternary the regex cannot follow" },
};

interface Site { file: string; line: number; op: string; table: string }

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function sweep(): Site[] {
  const hits: Site[] = [];
  for (const file of sourceFiles(SRC)) {
    const src = fs.readFileSync(file, "utf8");
    const re = /\bawait\s+[A-Za-z_$][\w$.()]*\s*\.from\(\s*["'](\w+)["']\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      // Captured? Then the caller has the { data, error } and can inspect it.
      const lineStart = src.lastIndexOf("\n", m.index) + 1;
      const pre = src.slice(lineStart, m.index);
      if (pre.includes("=") || pre.trimStart().startsWith("return")) continue;

      const tail = src.slice(m.index + m[0].length, m.index + m[0].length + 900);
      const op = /\.(insert|update|upsert|delete)\s*\(/.exec(tail);
      if (!op) continue;

      hits.push({
        file: path.relative(ROOT, file).split(path.sep).join("/"),
        line: src.slice(0, m.index).split("\n").length,
        op: op[1],
        table: m[1],
      });
    }
  }
  return hits;
}

describe("unchecked database writes", () => {
  const hits = sweep();

  it("the sweep still finds writes at all", () => {
    // If a refactor changes how queries are written, this regex stops matching
    // and the whole test passes vacuously. That would be worse than failing.
    assert.ok(hits.length > 10, `the sweep found only ${hits.length} unchecked writes — it has probably stopped matching, rather than the codebase having been cleaned`);
  });

  it("no unchecked write in a file that is not on the allowlist", () => {
    const strays = hits
      .filter((h) => !ALLOWED[h.file])
      .map((h) => `  ${h.file}:${h.line}  ${h.op} → ${h.table}`);
    assert.deepEqual(
      strays,
      [],
      "unchecked writes in files with no exemption.\n" +
        "Capture the result and check BOTH error and rows — an update matching\n" +
        "zero rows is not an error. Only add to ALLOWED if nobody is told it worked:\n" +
        strays.join("\n"),
    );
  });

  it("no allowlisted file has grown more unchecked writes", () => {
    const counts: Record<string, number> = {};
    for (const h of hits) counts[h.file] = (counts[h.file] || 0) + 1;
    const grown = Object.entries(counts)
      .filter(([f, n]) => ALLOWED[f] && n > ALLOWED[f].max)
      .map(([f, n]) => `  ${f}: ${n} now, ${ALLOWED[f].max} allowed (${ALLOWED[f].why})`);
    assert.deepEqual(grown, [], `these files gained unchecked writes:\n${grown.join("\n")}`);
  });

  it("the allowlist has no dead entries", () => {
    // A file that no longer has unchecked writes should lose its exemption, or
    // the ceiling silently permits new ones later.
    const counts: Record<string, number> = {};
    for (const h of hits) counts[h.file] = (counts[h.file] || 0) + 1;
    const dead = Object.keys(ALLOWED).filter((f) => !counts[f]);
    assert.deepEqual(dead, [], `allowlist entries with nothing left to exempt — remove them:\n  ${dead.join("\n  ")}`);
  });

  it("every exemption says why", () => {
    for (const [f, v] of Object.entries(ALLOWED)) {
      assert.ok(v.why.length > 10, `${f} is exempt with no reason given`);
    }
  });
});

describe("the writes that were fixed stay fixed", () => {
  // Named individually because each one was a specific lie on a specific
  // screen, and a future refactor that drops the check would restore it.
  const MUST_CHECK: [string, RegExp, string][] = [
    ["src/app/(app)/home/actions.ts", /\.select\('id'\)/, "pausing a payment reminder"],
    ["src/app/(app)/home/notifActions.ts", /\.select\('id'\)/, "dismissing a client notification"],
    ["src/app/(app)/payments/PaymentsClient.tsx", /delete\(\)\s*\.eq\("id", c\.reminderId\)\s*\.select\("id"\)/s, "deleting a payment record"],
    ["src/app/api/reminders/send/route.ts", /warning:/, "marking a reminder sent after the email went out"],
    ["src/components/MetricCards.tsx", /\.select\('client_id'\)/, "logging a weigh-in"],
    ["src/components/ProgressPhotos.tsx", /delete\(\)[\s\S]{0,80}\.select\("id"\)/, "deleting a progress photo"],
    ["src/app/(app)/home/TrainerCalendar.tsx", /moveErr/, "dragging a session to a new time"],
    ["src/app/(app)/clients/[clientId]/AssignProgramModal.tsx", /deactivateErr/, "closing the previous programme before assigning"],
    ["src/app/(app)/welcome/WelcomeClient.tsx", /flagErr/, "finishing a new client's first login"],
    ["src/app/(app)/settings/SettingsClient.tsx", /setGcalSync\(!val\)/, "turning calendar sync on or off"],
    ["src/app/api/recipes/route.ts", /clearErr/, "replacing a recipe's ingredients"],
    ["src/app/api/nutrition/plan-restore/route.ts", /arcErr/, "archiving the meal plan a restore displaces"],
    ["src/app/api/cron/goals/route.ts", /hitErr/, "marking a goal reached"],
    ["src/app/api/cron/birthdays/route.ts", /ledgerErr/, "recording that a birthday was wished"],
  ];

  // Comments are stripped before matching, and that is not fussiness. The
  // first version of this test matched the source as written, and the doc
  // comment above pausePaymentReminder happens to contain the literal string
  // `.select('id')` explaining why it is there. Deleting the actual call left
  // the test green. A guard that a comment can satisfy is not a guard.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  for (const [file, re, what] of MUST_CHECK) {
    it(`${what} is still checked`, () => {
      const src = stripComments(fs.readFileSync(path.join(ROOT, file), "utf8"));
      assert.match(src, re, `${file} no longer checks the write behind "${what}" — see docs/UNCHECKED-WRITES-INVENTORY.md`);
    });
  }
});
