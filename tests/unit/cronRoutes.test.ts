import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// `/api/ai-nudges` was scheduled in vercel.json from the day it was written and
// NEVER ONCE RAN. Vercel Cron issues a GET; the route exported only POST, so
// Next answered 405 before a line of it executed. Every other cron route
// exported both verbs — this one was the exception, and nothing surfaced it,
// because a job that never runs and a job with nothing to do look identical
// from the outside.
//
// The whole class of fault is "scheduled, but not reachable by the scheduler".
// This test makes it a build failure instead of a silence.

const ROOT = process.cwd();

function crons(): { path: string }[] {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  return cfg.crons ?? [];
}

function routeFileFor(cronPath: string): string {
  // "/api/cron/weekly-ai?draft=1" → src/app/api/cron/weekly-ai/route.ts
  const clean = cronPath.split("?")[0].replace(/^\//, "");
  return path.join(ROOT, "src/app", clean, "route.ts");
}

test("vercel.json is not empty — the schedule is the point", () => {
  assert.ok(crons().length > 0, "vercel.json declares no crons at all");
});

test("every scheduled path has a route file behind it", () => {
  const missing = crons()
    .filter((c) => !fs.existsSync(routeFileFor(c.path)))
    .map((c) => c.path);
  assert.deepEqual(
    missing,
    [],
    `Scheduled paths with no route: ${missing.join(", ")}. A cron pointing at a ` +
      `404 fails silently forever.`
  );
});

test("every scheduled route exports GET, because that is what Vercel Cron sends", () => {
  const offenders: string[] = [];
  for (const c of crons()) {
    const file = routeFileFor(c.path);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    const hasGet = /export\s+(async\s+)?function\s+GET\b|export\s+const\s+GET\b/.test(src);
    if (!hasGet) offenders.push(`${c.path} (${path.relative(ROOT, file)})`);
  }
  assert.deepEqual(
    offenders,
    [],
    `These routes are scheduled but export no GET handler, so Vercel Cron gets a\n` +
      `405 and the job never runs:\n  ${offenders.join("\n  ")}`
  );
});

test("every scheduled route opts out of static rendering", () => {
  // A statically rendered route would be served from cache and never execute.
  const offenders: string[] = [];
  for (const c of crons()) {
    const file = routeFileFor(c.path);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    if (!/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(src)) {
      offenders.push(`${c.path} (${path.relative(ROOT, file)})`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Scheduled routes missing \`export const dynamic = "force-dynamic"\`:\n  ${offenders.join("\n  ")}`
  );
});
