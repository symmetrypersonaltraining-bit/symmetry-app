// The logger must not re-render itself four times a second while you rest.
//
// Dustin, 18 Aug: "If I leave the app open in my workout logger for a few
// minutes without touching it while I'm rolling or doing an exercise, when I go
// to log the exercise, it's very laggy. Sometimes it takes minutes to actually
// click the movement."
//
// `timerNow` is state on the top-level component, so every tick re-rendered the
// whole screen — every section, exercise, set row and controlled input. The
// interval was 250ms, so that was four full renders a second for as long as any
// rest timer ran. Which is precisely the window he describes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAW = readFileSync(
  join(process.cwd(), "src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"),
  "utf8",
);

// Comments must not satisfy a structural assertion — the block above the tick
// quotes "250ms" and "four full renders" in prose.
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
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return out;
}
const SRC = code(RAW);

function tickEffect(): string {
  const i = SRC.indexOf("if (!anyTimerRunning) return;");
  assert.ok(i > 0, "the rest-timer tick has gone");
  const end = SRC.indexOf("}, [anyTimerRunning]);", i);
  assert.ok(end > i, "could not bound the tick effect");
  return SRC.slice(i, end);
}

test("the comment stripper strips, or the guards below are theatre", () => {
  assert.equal(code("a // setInterval(tick, 250)\nb").includes("setInterval(tick, 250)"), false);
  assert.ok(code("setInterval(tick, 1000); // note").includes("setInterval(tick, 1000)"));
});

// ─── the cost of a tick ─────────────────────────────────────────────────────

test("the clock ticks once a second, not four times", () => {
  const body = tickEffect();
  assert.doesNotMatch(body, /setInterval\([^)]*,\s*250\s*\)/,
    "back to a 250ms tick — that is four full re-renders of the whole logger every second while resting");
  assert.match(body, /setInterval\(tick, 1000\)/,
    "the tick is not on a one-second interval");
});

test("a tick that would redraw the same clock does not re-render", () => {
  // fmtSecs renders mm:ss. Setting a new timestamp that lands in the same
  // second re-renders the entire tree to produce an identical screen.
  const body = tickEffect();
  assert.match(
    body,
    /setTimerNow\(prev => \(Math\.floor\(prev \/ 1000\) === Math\.floor\(now \/ 1000\) \? prev : now\)\)/,
    "timerNow is set unconditionally again, so every tick re-renders whether the display changed or not",
  );
});

test("the timer state is not replaced when nothing changed", () => {
  const body = tickEffect();
  assert.match(body, /return changed \? next : prev;/,
    "setSetTimers returns a new object every tick, so anything keyed on its identity churns");
});

// ─── nothing runs while the screen is away ──────────────────────────────────

test("the tick stops when the screen is hidden", () => {
  const body = tickEffect();
  assert.match(body, /document\.addEventListener\("visibilitychange", onVis\)/,
    "the tick keeps running in his pocket again — the backlog lands when he comes back");
  assert.match(body, /if \(document\.visibilityState === "hidden"\) \{ stop\(\); return; \}/,
    "hiding the screen no longer stops the interval");
});

test("coming back re-syncs immediately rather than waiting for the next tick", () => {
  const body = tickEffect();
  const vis = body.indexOf("const onVis");
  const resume = body.indexOf("tick();", vis);
  const restart = body.indexOf("start();", resume);
  assert.ok(vis > 0 && resume > vis, "returning to the screen does not catch up — the clock shows a stale time");
  assert.ok(restart > resume, "it resumes ticking before catching up, so the missed second is skipped");
});

test("it does not start ticking on a screen that is already hidden", () => {
  const body = tickEffect();
  assert.match(body, /if \(document\.visibilityState === "hidden"\) stop\(\); else start\(\);/,
    "mounting while hidden starts the interval anyway");
});

test("both the interval and the listener are cleaned up", () => {
  const body = tickEffect();
  assert.match(body, /return \(\) => \{\s*stop\(\);/, "the interval leaks when the timer stops");
  assert.match(body, /removeEventListener\("visibilitychange", onVis\)/,
    "the visibility listener leaks — they accumulate across every timer start");
});

// ─── the property that must survive ─────────────────────────────────────────

test("the clock is still read from the wall, never accumulated from ticks", () => {
  // A phone that slept must come back with the right time regardless of how
  // many ticks it missed. That is the reason this effect only re-renders.
  const body = tickEffect();
  assert.match(body, /const now = Date\.now\(\);/,
    "the tick no longer reads the wall clock, so a slept phone comes back wrong");
  assert.doesNotMatch(body, /setTimerNow\(\s*(?:prev|t)\s*=>\s*[a-z]*\s*\+/i,
    "the clock is being incremented per tick — missed ticks now lose time");
});
