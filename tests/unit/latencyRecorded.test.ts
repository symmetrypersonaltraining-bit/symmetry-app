import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// The AI health page has a "typical time" field. It showed a dash for every
// surface, forever, because latency_ms was null on every successful row.
//
// callClaudeJson HAD the numbers the whole time — it times itself so a FAILURE
// can be recorded with its duration — and simply never returned them, so no
// caller could pass them to logUsage. The column existed, the plumbing existed,
// and the one link in the middle was missing.

const ROOT = process.cwd();
const ANTHROPIC = fs.readFileSync(path.join(ROOT, "src/lib/ai/anthropic.ts"), "utf8");

test("callClaudeJson hands back the timing it already measured", () => {
  const iface = ANTHROPIC.slice(
    ANTHROPIC.indexOf("export interface JsonCallResult"),
    ANTHROPIC.indexOf("}", ANTHROPIC.indexOf("startedAt: Date"))
  );
  assert.match(iface, /latencyMs: number/, "the result no longer carries how long the call took");
  assert.match(iface, /startedAt: Date/);

  // EVERY exit must carry it, not just the happy one — a route that retried
  // twice and salvaged a fallback is exactly the slow one worth seeing.
  const returns = [...ANTHROPIC.matchAll(/return \{ value: [^}]*\}/g)].map((m) => m[0]);
  assert.ok(returns.length >= 3, "expected several exits from callClaudeJson");
  for (const r of returns) {
    assert.match(r, /latencyMs/, `an exit path returns no timing: ${r.slice(0, 80)}`);
  }
});

test("the timing comes from inside the helper, not re-measured around it", () => {
  // Timing the call from the route includes whatever else the route was doing —
  // context assembly, database reads — and quietly turns "the model is slow"
  // into "everything is slow".
  const files = [
    "src/app/api/nutrition-ai/act/route.ts",
    "src/app/api/nutrition-ai/coach/route.ts",
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const calls = [...src.matchAll(/latencyMs: ([\w.]+)/g)].map((m) => m[1]);
    for (const expr of calls) {
      assert.match(
        expr,
        /\.latencyMs$/,
        `${rel} computes its own latency (${expr}) instead of using the helper's`
      );
    }
  }
});

test("the surfaces a client waits on all record their time", () => {
  const shouldTime = [
    ["src/app/api/nutrition-ai/act/route.ts", 2],
    ["src/app/api/nutrition-ai/coach/route.ts", 1],
    ["src/app/api/nutrition-ai/parse/route.ts", 1],
  ] as const;
  for (const [rel, atLeast] of shouldTime) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const n = (src.match(/latencyMs:/g) || []).length;
    assert.ok(
      n >= atLeast,
      `${rel} logs ${n} timed call(s), expected at least ${atLeast} — the health page will show a dash`
    );
  }
});
