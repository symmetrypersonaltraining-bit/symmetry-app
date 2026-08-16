// Guard: this repository can be cloned to another instance without the copy
// reaching back and acting on LIVE.
//
// symmetry-app-v2 is meant to be this repository byte for byte — that is what
// makes Dylan's testing worth anything, and src/lib/trainer.ts records what the
// fork alternative cost. But "byte for byte" cuts both ways: anything in here
// that names a live resource gets copied too.
//
// The one that would have bitten immediately: .github/workflows/vercel-deploy.yml
// hard-codes the LIVE Vercel deploy hook and fires on every push to main. Seed
// v2 from live verbatim and every dev push redeploys symmetry-app-omega — the
// app 27 real clients use. Nobody would have noticed from the dev side; it
// reports a green tick either way.
//
// So: a workflow step may only touch a live-specific resource behind a check on
// github.repository. These tests assert that, and assert the sync workflow can
// never run on live at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const DIR = join(process.cwd(), ".github/workflows");
const LIVE = "symmetrypersonaltraining-bit/symmetry-app";

/** Strings that name something only the live instance owns. */
const LIVE_RESOURCE = [
  /api\.vercel\.com\/v1\/integrations\/deploy\//, // a deploy hook is one project
  /symmetry-app-omega/,
  /mkfiginpiesospsnktea/, // the live Supabase project ref
];

type Step = { name?: string; if?: string; run?: string; uses?: string; with?: Record<string, unknown> };
type Job = { if?: string; steps?: Step[] };
type Workflow = { on?: unknown; jobs?: Record<string, Job> };

const files = readdirSync(DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

test("there are workflows to check at all", () => {
  // A rename or a moved directory would otherwise make every test below pass
  // by iterating over nothing.
  assert.ok(files.length >= 3, `only ${files.length} workflow files found in ${DIR}`);
});

for (const file of files) {
  const raw = readFileSync(join(DIR, file), "utf8");

  test(`${file} is valid YAML`, () => {
    // The gcal workflow was once overwritten with a git error message, which
    // made it invalid YAML — so it silently stopped running and the calendar
    // sync went dead. Nothing reported that; it just stopped.
    assert.doesNotThrow(() => yaml.load(raw), `${file} does not parse`);
  });

  test(`${file} only touches live resources behind a repository check`, () => {
    const doc = yaml.load(raw) as Workflow;
    for (const [jobName, job] of Object.entries(doc?.jobs || {})) {
      const jobGuard = String(job?.if || "");
      for (const step of job?.steps || []) {
        const body = `${step.run || ""} ${JSON.stringify(step.with || {})}`;
        const hit = LIVE_RESOURCE.find((re) => re.test(body));
        if (!hit) continue;
        const guard = `${jobGuard} ${String(step.if || "")}`;
        assert.match(
          guard,
          new RegExp(`github\\.repository\\s*==\\s*['"]${LIVE.replace("/", "\\/")}['"]`),
          `${file} › ${jobName} › "${step.name || step.run?.slice(0, 40)}" touches a live-only ` +
            `resource (${hit}) with no github.repository == '${LIVE}' guard. Copied to another ` +
            `instance, that step acts on Dustin's production app.`
        );
      }
    }
  });
}

test("the sync workflow refuses to run on live, at the job level", () => {
  // This one force-pushes main. On live that is unthinkable, so the guard is
  // not "prefer not to" — the job must not run there at all.
  const doc = yaml.load(readFileSync(join(DIR, "sync-from-live.yml"), "utf8")) as Workflow;
  const job = doc?.jobs?.sync;
  assert.ok(job, "the sync job must exist");
  assert.match(
    String(job.if || ""),
    new RegExp(`github\\.repository\\s*!=\\s*['"]${LIVE.replace("/", "\\/")}['"]`),
    "sync-from-live must be gated OFF on the live repository"
  );
});

test("the sync workflow pushes to origin, never to a configurable remote", () => {
  // Belt and braces: `origin` is always the repository the workflow runs in, so
  // even with the job guard removed there is no secret or variable that could
  // aim this at live.
  const raw = readFileSync(join(DIR, "sync-from-live.yml"), "utf8");
  assert.match(raw, /git push --force origin/, "the push target must be literal `origin`");
  assert.doesNotMatch(
    raw.replace(/^\s*#.*$/gm, ""),
    /git push[^\n]*\blive\b/,
    "it must never push TO the live remote — live is only ever fetched from"
  );
});

test("the live deploy hook fires only on live, and a dev instance has its own path", () => {
  const raw = readFileSync(join(DIR, "vercel-deploy.yml"), "utf8");
  assert.match(raw, /secrets\.VERCEL_DEPLOY_HOOK/, "a non-live instance needs its own hook");
  assert.match(
    raw,
    /github\.repository\s*!=\s*'symmetrypersonaltraining-bit\/symmetry-app'/,
    "…on a step gated to non-live"
  );
});

test("the sync needs no secret anyone has to remember to create", () => {
  // The reason this is a test and not a preference. symmetry-app-v2 ALREADY had
  // a sync-from-live mechanism. It ran on schedule for twelve consecutive
  // nights — 12 green runs, Aug 5 through Aug 16 — and dev's main never moved
  // off its 20 July commit the entire time, because each run opened a
  // `sync/live-YYYYMMDD-HHMM` branch marked "needs review" and no human ever
  // reviewed one. Twelve successful runs, one month of drift, no failure
  // anywhere to notice.
  //
  // So: no review step, and no secret that has to be created by hand either.
  // The built-in GITHUB_TOKEN can push to the repository it runs in.
  const raw = readFileSync(join(DIR, "sync-from-live.yml"), "utf8");
  const doc = yaml.load(raw) as Workflow;
  const job = doc?.jobs?.sync;
  assert.ok(job, "the sync job must exist");
  assert.match(
    String((job.steps || [])[0]?.with?.token ?? ""),
    /secrets\.GITHUB_TOKEN/,
    "the checkout must fall back to the built-in token, or the sync silently depends on setup"
  );
  assert.equal(
    (job as unknown as { permissions?: Record<string, string> }).permissions?.contents,
    "write",
    "GITHUB_TOKEN cannot push without contents: write"
  );
  assert.doesNotMatch(
    raw.replace(/^\s*#.*$/gm, ""),
    /pull_request|gh pr create|needs review/i,
    "no review step — that is precisely what stalled the previous mechanism"
  );
});

test("a deploy that fails is not reported as a success", () => {
  // This was a bare `curl -X POST`. curl exits 0 on an HTTP 404, so a rotated
  // or deleted hook shows a green tick on every push while nothing deploys —
  // and you learn about it from a client, days later.
  const raw = readFileSync(join(DIR, "vercel-deploy.yml"), "utf8");
  const runs = raw.split("\n").filter((l) => l.includes("curl") && l.includes("api.vercel.com"));
  assert.ok(runs.length > 0, "expected a curl to the deploy hook");
  for (const line of runs) {
    assert.match(line, /curl\s+-fsS/, `unchecked curl: ${line.trim()}`);
  }
});
