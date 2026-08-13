import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// The global tap ripple was un-positioning every floating button in the app.
//
// InteractionFX adds a class to whatever you press so the ripple has something
// to sit inside. That class was `.cw-ripple-host { position: relative; overflow:
// hidden; }` — and `position: relative` on a button that was `position: fixed`
// drops it out of the viewport and into normal document flow the instant your
// finger lands on it. The button teleports, pointerup lands somewhere else, the
// browser fires `click` on the common ancestor, and the handler never runs. The
// class is never removed, so it stays broken until the component remounts.
//
// Reproduced 2026-08-13 by driving the real button with a real pointer: the
// nutrition ✦ moved from (322,710) to (-14,1120) between pointerdown and
// pointerup, and `position` went `fixed` → `relative`. Sixteen positioned
// buttons were affected, including "Start session and log" in the workout
// logger and every "Close" on a zoomed chart or video.
//
// Nothing about that is visible in a diff, in a screenshot, or to any test that
// calls element.click() — a synthetic click fires the handler directly and
// passes happily. So these tests pin the SHAPE of the fix instead: clipping and
// positioning must stay in separate classes, and the positioning one must only
// be applied to elements that are already static.

const ROOT = process.cwd();
const CSS = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
const FX = fs.readFileSync(path.join(ROOT, "src/components/InteractionFX.tsx"), "utf8");

function ruleBody(selector: string): string | null {
  const at = CSS.indexOf(selector + " {");
  if (at === -1) return null;
  const open = CSS.indexOf("{", at);
  const close = CSS.indexOf("}", open);
  return CSS.slice(open + 1, close);
}

test("the ripple's clipping and its positioning are separate classes", () => {
  const host = ruleBody(".cw-ripple-host");
  const clip = ruleBody(".cw-ripple-clip");
  assert.ok(host, ".cw-ripple-host is gone — InteractionFX still adds it");
  assert.ok(clip, ".cw-ripple-clip is missing; clipping has been folded back into the host rule");
  assert.match(clip!, /overflow\s*:\s*hidden/, ".cw-ripple-clip must be the one that clips");
  assert.doesNotMatch(
    host!,
    /overflow/,
    "clipping is back in .cw-ripple-host — the two must stay split so the safe half can be applied unconditionally"
  );
});

test("only the positioning class declares position, and nothing else does", () => {
  assert.match(ruleBody(".cw-ripple-host")!, /position\s*:\s*relative/);
  assert.doesNotMatch(
    ruleBody(".cw-ripple-clip")!,
    /position/,
    ".cw-ripple-clip must never touch position — it is applied to every button, including fixed ones"
  );
});

test("InteractionFX checks the element is static before re-declaring its position", () => {
  const code = FX.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(
    code,
    /cw-ripple-clip/,
    "the always-safe clipping class is not being applied, so the ripple will spill out of the button"
  );

  const hostAdd = code.match(/.*cw-ripple-host.*/);
  assert.ok(hostAdd, "InteractionFX no longer adds .cw-ripple-host");
  assert.match(
    hostAdd![0],
    /getComputedStyle\([^)]*\)\.position\s*===\s*["']static["']/,
    "the positioning class is applied unconditionally again — that is the bug that threw " +
      "fixed buttons off-screen mid-press. Only add it when the element is already static."
  );
});

// A regression here does not show up as a broken layout; it shows up as a
// button that silently stops working. That is worth one more assertion.
test("no other rule in globals.css sets position on a pressed element", () => {
  const offenders: string[] = [];
  const re = /([^{}\n]*:active[^{}]*)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CSS))) {
    if (/(^|[^-])position\s*:/.test(m[2])) offenders.push(m[1].trim());
  }
  assert.deepEqual(
    offenders,
    [],
    `a :active rule changes position, which moves the element out from under the finger ` +
      `mid-press:\n  ${offenders.join("\n  ")}`
  );
});
