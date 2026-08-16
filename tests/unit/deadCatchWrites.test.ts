// Guard: the catches that could never fire, around writes that mattered.
//
// The recurring shape of this whole night, isolated and swept for:
//
//   try { await supabase.from(x).insert(...) } catch { /* handled */ }
//
// It reads as careful and is the opposite. **A PostgREST call RETURNS its
// error; it does not throw.** So the catch cannot fire, the code inside is
// completely unguarded while looking guarded, and every "best-effort, just log
// it" console line in the app had never once executed.
//
// A sweep for try-blocks containing an unchecked write and no other throw
// source found 25. Six are in the off-limits logger files and are listed at the
// bottom of docs/OVERNIGHT-2026-08-16.md rather than touched. Most of the rest
// are genuinely fire-and-forget — device tokens, seen-markers, chat memory —
// and are fine as they are.
//
// Three were not:
//
//   `CommunityPair.join` — the THIRD challenge-join path with this fault, after
//   GroupChallenge and ClientTakeovers. Every failure landed on
//   `setJoined(true)`. This is where "twenty-three people had joined and six
//   were showing" comes from.
//
//   `OffPlanBanner.doSwap` — a refused insert was followed by skipping the
//   ORIGINAL and navigating to the replacement anyway, so the client finished
//   the swap with no workout scheduled at all, standing on the page for one.
//   uq_scheduled_workout_one_per_day can reject that insert outright, so it is
//   a live possibility rather than a theoretical one.
//
//   `OffPlanBanner.deleteRow` — removing the row from the list is the only
//   confirmation the client gets.
//
// Two more were left best-effort ON PURPOSE and merely made capable of
// reporting: the skip in `saveOffPlan` (what they DID is already recorded, and
// losing that is worse) and the log_date move in `moveScheduledWorkout` (the
// schedule is authoritative; a stale log_date is the smaller problem). Both now
// log. Neither changes behaviour.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"));

const PAIR = read("src/components/CommunityPair.tsx");
const BANNER = read("src/components/OffPlanBanner.tsx");
const MOVE = read("src/lib/moveWorkout.ts");

test("the third join path forgives a duplicate and nothing else", () => {
  const i = PAIR.indexOf("async function join()");
  const body = PAIR.slice(i, i + 1100);
  assert.match(body, /const \{ error \} = await supabase/, "the insert is unchecked again");
  assert.match(body, /error\.code !== "23505"/, "it swallows every error again");
  const guard = body.indexOf("if (error");
  const joined = body.indexOf("setJoined(true)");
  assert.ok(guard > 0 && guard < joined, "the button says joined before the insert is known to have landed");
});

test("all three join paths agree on what counts as already-in", () => {
  // One of them treating a different set of errors as success is how these
  // drift back apart.
  for (const f of [
    "src/components/CommunityPair.tsx",
    "src/components/ClientTakeovers.tsx",
    "src/components/GroupChallenge.tsx",
  ]) {
    assert.match(read(f), /error\.code !== "23505"/, `${f} no longer matches the other join paths`);
  }
});

test("a swap that could not be scheduled does not skip the original", () => {
  const i = BANNER.indexOf("async function doSwap");
  const body = BANNER.slice(i, i + 1600);
  const guard = body.indexOf("if (addErr)");
  const skip = body.indexOf('status: "skipped"');
  const navigate = body.indexOf("window.location.href");
  assert.match(body, /const \{ error: addErr \}/, "the insert is unchecked again");
  assert.ok(guard > 0, "no failure branch");
  assert.ok(guard < skip, "the original is skipped before the replacement is known to exist");
  assert.ok(guard < navigate, "the client is sent to a workout that may not be scheduled");
});

test("a swap that left both workouts on the day says so", () => {
  const i = BANNER.indexOf("async function doSwap");
  const body = BANNER.slice(i, i + 1600);
  assert.match(body, /const \{ error: skipErr \}/);
  assert.match(body, /still on today as well/);
});

test("deleting an off-plan entry that did not delete leaves it on screen", () => {
  const i = BANNER.indexOf("async function deleteRow");
  const body = BANNER.slice(i, i + 600);
  const guard = body.indexOf("if (error)");
  const remove = body.indexOf("setPendingRows(");
  assert.match(body, /const \{ error \} = await supabase/);
  assert.ok(guard > 0 && guard < remove);
});

for (const [what, code, marker] of [
  ["the off-plan skip", BANNER, "skipErr"],
  ["the log_date move", MOVE, "logErr"],
] as const) {
  test(`${what} stays best-effort but can now report`, () => {
    assert.match(code, new RegExp(`const \\{ error: ${marker} \\}`), `${what} discards its error again`);
    assert.match(code, new RegExp(`if \\(${marker}\\) console\\.error`), `${what} cannot report`);
    // And must NOT have become fatal — that was the deliberate part.
    assert.doesNotMatch(code, new RegExp(`if \\(${marker}\\) return;`), `${what} became fatal, which it must not`);
  });
}
