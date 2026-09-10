import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE TRAINER HOME COSTS ONE ROUND TRIP, AND THE TOGGLE RENDERS IT ONCE.
 *
 * Dustin, 10 Sep: *"the trainer view takes about 10 seconds to switch screen
 * over its laggy fix that too"*.
 *
 * Measured, not guessed. The trainer branch of /home made FIVE serial reads —
 * clients, appointments, today's workouts, the calendar's workouts, reminders —
 * and the calendar one pages through 5,697 rows at 1,000 a time, so that is
 * six round trips on its own. Ten PostgREST hops, one after another, per
 * render. Then the toggle called router.refresh() as well as router.replace(),
 * which renders the layout and page for the URL being LEFT and then the
 * destination: two full renders, about twenty hops, per tap.
 *
 * One screen over, the client branch already says it: "Promise.all so the
 * five leave together and the page costs one round trip." This holds the
 * trainer branch to the same standard, and holds the toggle to one render.
 *
 * Both are pinned by reading the source, because a serial `await` that creeps
 * back in looks exactly like working code and costs a second per hop.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Comments describe the old shape and name what the code must not contain. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PAGE = code(read("src/app/(app)/home/page.tsx"));
const WRAPPER = code(read("src/components/TrainerLayoutWrapper.tsx"));

/** Just the trainer branch: from its guard to where it hands off to TrainerHome. */
const TRAINER = PAGE.slice(
  PAGE.indexOf("if (isTrainer && !isInClientMode) {"),
  PAGE.indexOf("<TrainerHome"),
);

test("the trainer branch is where this file says it is", () => {
  assert.ok(TRAINER.length > 500, "the slice markers moved; fix the slice before trusting anything below");
});

test("both calendar reads are paged — a bounded window is not a bound", () => {
  // 2,491 appointments and 5,697 workouts in their windows, against a
  // 1,000-row cap that reports no error. Neither may go back to a bare read.
  assert.match(TRAINER, /fetchAllRowsSafe<any>\(\s*\(\)\s*=>\s*supabase\s*\.from\("appointments"\)/,
    "appointments must page: 1,491 rows past 1 December were silently dropped");
  assert.match(TRAINER, /fetchAllRowsSafe<any>\(\s*\(\)\s*=>\s*supabase\s*\.from\("scheduled_workouts"\)/,
    "the calendar's workouts must page (24 Aug)");
});

test("the five reads leave together, in ONE Promise.all", () => {
  const all = TRAINER.match(/await Promise\.all\(/g) || [];
  assert.equal(all.length, 1, "exactly one Promise.all; two is two round trips");
  const block = TRAINER.slice(TRAINER.indexOf("await Promise.all("));
  const close = block.indexOf("]);");
  const inside = block.slice(0, close);
  for (const table of ["clients", "appointments", "payment_reminders"]) {
    assert.match(inside, new RegExp(`\\.from\\("${table}"\\)`), `${table} must be inside the Promise.all`);
  }
  assert.equal((inside.match(/\.from\("scheduled_workouts"\)/g) || []).length, 2,
    "both scheduled_workouts reads — today's, and the calendar's — belong in it");
});

test("nothing in the trainer branch is awaited one at a time", () => {
  // The whole point. One await — the Promise.all — and no `await supabase`,
  // no `await fetchAllRowsSafe`, nothing that turns five reads back into a
  // queue.
  const awaits = TRAINER.match(/\bawait\b/g) || [];
  assert.equal(awaits.length, 1,
    `found ${awaits.length} awaits in the trainer branch; each one past the first is a serial round trip`);
  assert.doesNotMatch(TRAINER, /await supabase/);
  assert.doesNotMatch(TRAINER, /await fetchAllRowsSafe/);
});

test("the toggle renders the destination once — no router.refresh()", () => {
  assert.doesNotMatch(WRAPPER, /router\.refresh\(\)/,
    "refresh() renders layout+page for the URL being LEFT before replace() renders the destination — two full renders per tap");
  // The markers are what made refresh() unnecessary; they must stay.
  assert.match(WRAPPER, /\/home\?as=client/);
  assert.match(WRAPPER, /\/home\?as=trainer/);
});
