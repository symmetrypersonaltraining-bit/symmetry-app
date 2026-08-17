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

// Slice the WHOLE function, not a magic number of characters.
//
// These two took `BANNER.slice(i, i + 1600)`. On 17 Aug, comments added to
// doSwap pushed `window.location.href` past 1600, so `indexOf` returned -1 and
// the order assertion failed on code that was correct. The same brittleness
// runs the other way, which is the dangerous direction: a -1 sails through
// plenty of `<` comparisons. Bound it at the next declaration instead, and
// prove every marker was found before comparing positions.
function fnBody(src: string, name: string): string {
  const i = src.indexOf(name);
  assert.ok(i >= 0, `${name} is gone — this guard is testing nothing`);
  const after = i + name.length;
  const rest = src.slice(after);
  const end = rest.search(/\n {2}(?:async )?function |\n {2}const \w+ = |\nexport /);
  return src.slice(i, end === -1 ? src.length : after + end);
}

function at(body: string, needle: string, what: string): number {
  const idx = body.indexOf(needle);
  assert.ok(idx >= 0, `${what} is not there at all`);
  return idx;
}

// A COMMENT MUST NOT SATISFY A STRUCTURAL ASSERTION.
//
// Found by the mutation harness on 17 Aug: deleting the real `.select("id")`
// from AddWorkoutButton left the suite green, because the explanatory comment
// two lines above it says `.select("id")` in prose. The guard was matching its
// own documentation. Same family as the four mutations that were silent no-ops
// because they targeted lines with trailing comments — whenever a test reads
// source as text, the comments are not part of the program.
//
// Deliberately conservative: it only understands quotes well enough for these
// files, and its job is to delete comments, not to parse TypeScript.
function code(src: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === "\\") { out += src[++i] ?? ""; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; continue; }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

test("the comment stripper actually strips, or every guard below is theatre", () => {
  assert.equal(code('a // .select("id")\nb').includes('.select("id")'), false);
  assert.equal(code('a /* .select("id") */ b').includes('.select("id")'), false);
  assert.ok(code('const u = "https://x//y"; // gone').includes("https://x//y"),
    "a URL inside a string is not a comment");
  assert.ok(code('x.select("id"); // note').includes('x.select("id")'),
    "real code must survive");
});

// Anchor the proof to the SKIP, not to the function.
//
// The mutation harness caught this on 17 Aug too: deleting the real `.select`
// from the skip left the suite green, because `addLibrary` contains an
// unrelated `.select("id").single()` on the workout_logs insert in its
// backdating branch. "Somewhere in this function" is not an assertion about the
// statement that matters.
function skipStatement(body: string, what: string): string {
  const from = at(body, 'status: "skipped"', `${what}: the skip`);
  const to = at(body, "skipVerdict(", `${what}: the verdict`);
  assert.ok(from < to, `${what}: the verdict is read before the skip runs`);
  return body.slice(from, to);
}

test("a swap that could not be scheduled does not skip the original", () => {
  const body = code(fnBody(BANNER, "async function doSwap"));
  assert.match(body, /const \{ error: addErr \}/, "the insert is unchecked again");
  const guard = at(body, "if (addErr)", "the insert's failure branch");
  const skip = at(body, 'status: "skipped"', "the skip of the original");
  const navigate = at(body, "window.location.href", "the navigation to the new workout");
  assert.ok(guard < skip, "the original is skipped before the replacement is known to exist");
  assert.ok(guard < navigate, "the client is sent to a workout that may not be scheduled");
});

test("a swap that left both workouts on the day says so", () => {
  const body = code(fnBody(BANNER, "async function doSwap"));
  assert.match(body, /error: skipErr/, "the skip discards its error again");
  assert.match(body, /still on today as well/);
  // Stronger than it was. An update matching ZERO rows returns no error at all,
  // so checking skipErr alone still cannot tell a real replacement from a
  // no-op — which is exactly how Dustin's 17 Aug ended up with two cardio
  // sessions on it. The update has to ask which rows it actually changed and
  // put them through skipVerdict.
  assert.match(body, /skipVerdict\(/, "the skip's result is never checked against what it meant to skip");
  assert.match(skipStatement(body, "doSwap"), /\.select\("id"\)/,
    "the skip cannot prove it changed anything");
});

test("adding a workout onto an occupied day asks before it replaces", () => {
  const add = read("src/components/AddWorkoutButton.tsx");
  const body = code(fnBody(add, "async function addLibrary"));
  // Same guard, second caller. This is the path Dustin actually used.
  assert.match(body, /skipVerdict\(/, "the skip's result is never checked against what it meant to skip");
  assert.match(skipStatement(body, "addLibrary"), /\.select\("id"\)/,
    "the skip cannot prove it changed anything");
  const insert = at(body, 'from("scheduled_workouts").insert', "the insert of the new session");
  const guard = at(body, "if (ins.error)", "the insert's failure branch");
  const skip = at(body, 'status: "skipped"', "the skip of what it replaces");
  assert.ok(insert < skip, "the day is cleared before the replacement is known to exist — a failure would leave it empty");
  assert.ok(guard < skip, "a failed insert falls through to the skip, emptying the day it was meant to fill");
  assert.match(body.slice(guard, skip), /return;/,
    "the failure branch does not stop — it alerts and carries on into the skip");

  // The question itself must survive. Always-replace was explicitly rejected by
  // Dustin on 17 Aug: doubling up on a day and swapping a day out are both
  // things he does, so the app must not guess between them.
  const asker = code(fnBody(add, "async function askOrAdd"));
  assert.match(asker, /sessionsReplacedBy\(/,
    "adding no longer checks what is already on the day, so it can only guess");
  assert.match(asker, /replacing\.length === 0/,
    "an occupied day no longer reaches the question");
  assert.match(asker, /setAsk\(/, "nothing asks — this is always-replace or always-add again");
  // Backlogging a finished workout is a record of something that already
  // happened. It must never offer to clear the day's plan.
  assert.match(asker, /if \(markDone\)/, "backdating a completed workout can now wipe the day it is filed under");
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
