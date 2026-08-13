import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  AI_FEATURES,
  AI_FEATURE_KEYS,
  DEFAULT_LIMITS,
  LIMIT_COLUMNS,
  assertUnderCap,
  resolveDailyLimit,
  CapExceeded,
} from "../../src/lib/ai/meter-core";

// Until 13 Aug the app had 23 routes calling Claude and SEVEN labels between
// them — fourteen surfaces all logged as the single word "chat". The effect was
// that "is the AI working everywhere?" could not be answered from the data at
// all: 487 rows of `chat` told you nothing about which surface produced them,
// so spend could not be attributed and a broken surface could not be spotted.
//
// These tests exist so that collapse cannot happen again quietly. The first one
// is the important one: it reads the routes off disk, so a new AI route that
// borrows an existing label fails the build instead of disappearing into a
// bucket for three weeks.

const API_DIR = path.join(process.cwd(), "src/app/api");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

/** Routes that call Anthropic AND meter/log their spend. */
function aiRoutes(): { file: string; src: string }[] {
  return walk(API_DIR)
    .map((file) => ({ file, src: fs.readFileSync(file, "utf8") }))
    .filter(
      (r) =>
        /anthropic|messages\.create/i.test(r.src) &&
        /(logUsage|enforceMeter|checkAndLog)\s*\(/.test(r.src)
    );
}

/** The feature labels a route passes to logUsage / enforceMeter / checkAndLog. */
function labelsIn(src: string): string[] {
  const found = new Set<string>();
  const calls = src.match(/(?:logUsage|enforceMeter|checkAndLog)\s*\([\s\S]{0,400}?\)/g) || [];
  for (const call of calls) {
    for (const m of call.matchAll(/["']([a-z][a-z0-9_]*)["']/g)) {
      if ((AI_FEATURE_KEYS as string[]).includes(m[1])) found.add(m[1]);
    }
  }
  return [...found];
}

test("every AI route logs under a feature name that exists in the registry", () => {
  const offenders: string[] = [];
  for (const { file, src } of aiRoutes()) {
    if (labelsIn(src).length === 0) offenders.push(path.relative(process.cwd(), file));
  }
  assert.deepEqual(
    offenders,
    [],
    `These routes call Claude but log under no registered feature name.\n` +
      `Add an entry to AI_FEATURES in src/lib/ai/meter-core.ts and use it:\n  ${offenders.join("\n  ")}`
  );
});

test("no two AI routes share a feature name", () => {
  const byLabel = new Map<string, string[]>();
  for (const { file, src } of aiRoutes()) {
    for (const label of labelsIn(src)) {
      const rel = path.relative(process.cwd(), file);
      byLabel.set(label, [...(byLabel.get(label) || []), rel]);
    }
  }
  const shared = [...byLabel.entries()].filter(([, files]) => files.length > 1);
  assert.deepEqual(
    shared.map(([label, files]) => `${label}: ${files.join(", ")}`),
    [],
    "Two routes logging the same feature name is exactly the fault this registry " +
      "was built to fix — their spend and their failures become indistinguishable."
  );
});

test("no route reintroduces one of the old catch-all labels", () => {
  // These are the seven names the whole app used to share. If one shows up in a
  // metering call again, somebody has copied an old route as a template.
  const RETIRED = ["chat", "parse", "photo", "verify"];
  const offenders: string[] = [];
  for (const { file, src } of aiRoutes()) {
    const calls = src.match(/(?:logUsage|enforceMeter|checkAndLog)\s*\([\s\S]{0,400}?\)/g) || [];
    for (const call of calls) {
      for (const m of call.matchAll(/["']([a-z][a-z0-9_]*)["']/g)) {
        if (RETIRED.includes(m[1])) {
          offenders.push(`${path.relative(process.cwd(), file)} → "${m[1]}"`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `Retired catch-all label used:\n  ${offenders.join("\n  ")}`);
});

test("every callClaudeJson call passes a meter, so its failures get recorded", () => {
  // `logUsage` only ever ran on the SUCCESS path. A call that threw, or came
  // back as unparseable JSON three attempts running, spent tokens and left no
  // trace — indistinguishable in the data from nobody using the feature. The
  // `meter` option closes that, and this test stops the next route forgetting
  // it: the failure would be invisible again and nobody would notice for weeks.
  const offenders: string[] = [];
  for (const { file, src } of aiRoutes()) {
    const calls = src.match(/callClaudeJson(?:<[^>]*>)?\(\{[\s\S]{0,600}/g) || [];
    for (const call of calls) {
      // Look only at the head of the options object, before any nested call.
      const head = call.slice(0, call.indexOf("validate:") + 1 || 600);
      if (!/meter\s*:/.test(head)) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }
  }
  assert.deepEqual(
    [...new Set(offenders)],
    [],
    `These routes call callClaudeJson without a meter, so their failures are invisible:\n  ` +
      `${[...new Set(offenders)].join("\n  ")}\n` +
      `Add: meter: { clientId, feature: "<your feature>" }`
  );
});

test("a route's meter feature matches the feature it logs usage under", () => {
  // A mismatch would file the successes under one name and the failures under
  // another, which is worse than not recording failures at all — the health
  // page would show a surface that is always fine next to one that always
  // fails, and both would be the same route.
  const offenders: string[] = [];
  for (const { file, src } of aiRoutes()) {
    const meterFeatures = new Set(
      [...src.matchAll(/meter\s*:\s*\{[^}]*feature\s*:\s*["']([a-z_]+)["']/g)].map((m) => m[1])
    );
    const logged = new Set(labelsIn(src));
    for (const f of meterFeatures) {
      if (logged.size > 0 && !logged.has(f)) {
        offenders.push(`${path.relative(process.cwd(), file)}: meter "${f}" not in ${[...logged]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("every AI route checks the kill switch before it spends", () => {
  // Six routes could spend past the $95 cap: ai-nudges, the three crons,
  // feedback/describe and recipes/ai. Four of those are UNATTENDED jobs, which
  // is the worst possible exemption — they run on a schedule with nobody
  // watching, so an overspend is discovered on the invoice. A cap that four
  // scheduled jobs ignore is not a cap.
  const offenders: string[] = [];
  for (const { file, src } of aiRoutes()) {
    const gated = /(enforceMeter|checkAndLog|assertNotPaused)\s*\(/.test(src);
    if (!gated) offenders.push(path.relative(process.cwd(), file));
  }
  assert.deepEqual(
    offenders,
    [],
    `These routes call Claude without checking the kill switch:\n  ${offenders.join("\n  ")}\n` +
      `Add: const paused = await enforceMeter(clientIdOrNull, "<feature>"); if (paused) return paused;`
  );
});

test("every registry entry is complete and internally consistent", () => {
  for (const key of AI_FEATURE_KEYS) {
    const spec = AI_FEATURES[key];
    assert.ok(spec.label.length > 0, `${key} has no human label — the health page renders it`);
    assert.ok(
      ["client", "trainer", "scheduled"].includes(spec.surface),
      `${key} has an unknown surface`
    );
    if (spec.defaultLimit !== null) {
      assert.ok(spec.defaultLimit > 0, `${key} has a default limit of 0, which blocks it entirely`);
    }
    // A settings column with no default would silently fall through to null.
    if (spec.limitColumn) {
      assert.notEqual(spec.defaultLimit, null, `${key} has a cap column but no default limit`);
    }
  }
});

test("the caps that applied before the rename still apply", () => {
  // The rename must not have changed a single client's ceiling. These are the
  // exact values the old labels carried.
  assert.equal(DEFAULT_LIMITS.coach_action, 15);
  assert.equal(DEFAULT_LIMITS.food_parse, 15);
  assert.equal(DEFAULT_LIMITS.food_photo, 20);
  assert.equal(DEFAULT_LIMITS.plan_build, 1);
  assert.equal(DEFAULT_LIMITS.verify_food, 20);
  assert.equal(DEFAULT_LIMITS.workout_build, 8);
  assert.equal(DEFAULT_LIMITS.feedback_image, 30);

  assert.equal(LIMIT_COLUMNS.coach_action, "ai_daily_chat_limit");
  assert.equal(LIMIT_COLUMNS.food_parse, "ai_daily_parse_limit");
  assert.equal(LIMIT_COLUMNS.food_photo, "ai_daily_photo_limit");
  assert.equal(LIMIT_COLUMNS.plan_build, "ai_daily_plan_build_limit");
  assert.equal(LIMIT_COLUMNS.verify_food, "ai_daily_verify_limit");
  assert.equal(LIMIT_COLUMNS.workout_build, "workout_build_daily_limit");
});

test("a null limit means no cap, NOT a cap of zero", () => {
  // Getting this backwards would brick every trainer surface and every cron
  // job at once, which is the worst possible way to find out.
  assert.doesNotThrow(() => assertUnderCap("trainer_agent", 9999, null));
  assert.throws(() => assertUnderCap("food_photo", 20, 20), CapExceeded);
  assert.doesNotThrow(() => assertUnderCap("food_photo", 19, 20));

  // And a genuine zero still blocks.
  assert.throws(() => assertUnderCap("food_photo", 0, 0), CapExceeded);
});

test("resolveDailyLimit honours a per-client override and falls back to the default", () => {
  assert.equal(resolveDailyLimit({ ai_daily_photo_limit: 3 }, "food_photo"), 3);
  assert.equal(resolveDailyLimit({ ai_daily_photo_limit: 0 }, "food_photo"), 0);
  assert.equal(resolveDailyLimit(null, "food_photo"), 20);
  assert.equal(resolveDailyLimit({}, "food_photo"), 20);
  // Uncapped surfaces stay uncapped even if a stray column exists.
  assert.equal(resolveDailyLimit({ ai_daily_chat_limit: 5 }, "trainer_agent"), null);
});
