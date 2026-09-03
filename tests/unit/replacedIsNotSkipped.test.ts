import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p: string) => readFileSync(p, "utf8");

// A SWAP IS A WORKOUT YOU DID. A SKIP IS ONE YOU MISSED.
//
// Dustin, 3 Sep: "if i swap a walk for stair climber, i still did a workout and
// logged it so that counts on adherence. if i skip, i missed it and didnt make
// it up or move it to log it so it counts against me."
//
// Every path that retires a session because something replaced it must write
// 'replaced', never 'skipped'. The moment one of them writes 'skipped' again,
// the two meanings collapse back together and adherence either punishes swaps
// or forgives misses — the app cannot do both.

const REPLACE_PATHS = [
  "src/components/AddWorkoutButton.tsx",
  "src/components/OffPlanBanner.tsx",
  "src/app/api/workout-ai/route.ts",
];

test("nothing retires a session by calling it 'skipped'", () => {
  for (const p of REPLACE_PATHS) {
    const src = read(p);
    assert.ok(
      !/status:\s*"skipped"/.test(src),
      `${p} marks a replaced session 'skipped' — that is the collapse this guards`
    );
    assert.match(src, /status:\s*"replaced"/, `${p} should mark the original replaced`);
  }
});

test("adherence excludes replaced sessions, not skipped ones", () => {
  // Excluding 'skipped' would forgive a genuine miss, which is the whole point.
  for (const p of ["src/app/(app)/home/page.tsx", "src/app/(app)/workout/page.tsx"]) {
    const src = read(p);
    assert.ok(
      !/\.neq\("status",\s*"skipped"\)/.test(src),
      `${p} still filters out 'skipped' — a missed session would not count against anybody`
    );
    assert.match(src, /\.neq\("status",\s*"replaced"\)/, `${p} should filter out replaced sessions`);
  }
});
