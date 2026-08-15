// Guard: pages under (app) resolve auth locally, not with a network call each.
//
// Every page in this group renders inside `(app)/layout.tsx`, which has already
// established who the user is. Their own `auth.getUser()` was therefore a
// SECOND network round trip to Supabase per page load, for an answer the layout
// already had.
//
// That was invisible while Supabase Auth was fast. On 15 Aug it was not: the
// service took 10–65s and returned 504 on about half of all calls, and every
// one of those round trips was a chance to hang.
//
// Measured that night — a database probe and six page loads in the same minute:
//
//   database, 500,000 rows, pure CPU:  10.86s   (its worst reading of the night)
//   app, six consecutive page loads:   304 / 111 / 98 / 88 / 102 / 103 ms
//
// The app did not notice, because it no longer asks.
//
// DELIBERATELY NOT CONVERTED, and this test knows it:
//   · `workout/**` — both workout loggers are off limits without per-item
//     permission from Dustin. Not touched, not listed, not counted.
//   · the `.ts` server-action files (messageActions, schedule/actions,
//     assessmentActions) and `nutrition/print/route.ts` — write paths, and a
//     write path deserves its own read rather than a sweep.
//   · three `movement/**` pages that build their Supabase client a different
//     way, and `log-bodyfat` whose call is written in a shape the sweep did not
//     recognise. Left alone rather than half-converted by a regex.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = join(process.cwd(), "src/app/(app)");

/** Deliberately unconverted, with the reason. Anything else must be converted. */
const EXEMPT = new Set([
  // Off limits without Dustin's per-item say-so.
  "workout/page.tsx",
  "workout/[dayId]/page.tsx",
  // Read-only preview that redirects to the trainer's own session — arguably
  // not a "logger" at all, and converting it would be safe. Left anyway: the
  // standing rule says anything to do with the workout loggers needs Dustin's
  // per-item permission, an 11-commit batch was once reverted for testing that
  // boundary, and 3am with him asleep is the wrong time to decide my reading of
  // the rule is the right one. Costs one network call on one page.
  "client-preview/workout/page.tsx",
  // Builds its Supabase client differently; left rather than half-converted.
  "movement/page.tsx",
  "movement/testers/page.tsx",
  "movement/results/page.tsx",
  // Call written in a shape the sweep did not recognise.
  "log-bodyfat/page.tsx",
]);

function pageFiles(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    const rel = base ? `${base}/${e}` : e;
    if (statSync(full).isDirectory()) out.push(...pageFiles(full, rel));
    else if (e === "page.tsx") out.push(rel);
  }
  return out;
}

test("no (app) page makes its own network auth call", () => {
  const offenders: string[] = [];
  for (const rel of pageFiles(APP)) {
    if (EXEMPT.has(rel)) continue;
    const src = readFileSync(join(APP, rel), "utf8");
    if (/await supabase\.auth\.getUser\(\)/.test(src)) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `these pages ask Supabase over the network for something the layout already knows: ${offenders.join(", ")}. ` +
      `Use getServerUser(supabase) from @/lib/auth/serverUser, or add the file to EXEMPT with a reason.`
  );
});

test("the exemptions are real files, so the list cannot rot", () => {
  // An exemption for a file that no longer exists is a hole nobody can see.
  const present = new Set(pageFiles(APP));
  const stale = [...EXEMPT].filter((f) => !present.has(f));
  assert.deepEqual(stale, [], `EXEMPT names files that no longer exist: ${stale.join(", ")}`);
});

test("the workout logger pages are still exempt, and still untouched", () => {
  // Named separately from the list above so that removing them from EXEMPT is a
  // deliberate act with a failing test attached, not a tidy-up.
  for (const f of ["workout/page.tsx", "workout/[dayId]/page.tsx"]) {
    assert.ok(EXEMPT.has(f), `${f} must stay exempt — the loggers are off limits without asking`);
  }
});

test("getServerUser is what they use, and it still falls back", () => {
  // The conversion is only safe because getServerUser degrades to the same
  // network call when local verification cannot answer.
  const S = readFileSync(join(process.cwd(), "src/lib/auth/serverUser.ts"), "utf8");
  assert.match(S, /getUserFast\(supabase, store\.getAll\(\)\)/);
  const F = readFileSync(join(process.cwd(), "src/lib/auth/getUserFast.ts"), "utf8");
  assert.match(F, /supabase\.auth\.getUser\(\)/, "the fallback is gone — a verifier bug would now lock everyone out");
});
