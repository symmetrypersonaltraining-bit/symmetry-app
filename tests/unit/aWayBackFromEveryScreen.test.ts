import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { backDecision, homeHref, isTabRoot, showsBack, TAB_ROOTS } from "../../src/lib/nav/backFromHere";

/**
 * A WAY BACK FROM EVERY SCREEN, AND IT IS THE SAME WAY THE PHONE GOES BACK.
 *
 * Dustin, 11 Sep 2026: *"The actual back button on mobile phones still needs
 * to work as it does right now, the same exact way as clicking the in-app back
 * button. Those two buttons should work the exact same way. When you hit either
 * button, it needs to go back one page."*
 *
 * Three things pinned: where the control draws, what it decides, and that
 * BackButtonGuard — the phone's half — is exactly as it was.
 */
const ROOT = process.cwd();

test("it draws on every page that is not a bottom-nav root", () => {
  for (const r of TAB_ROOTS) assert.equal(showsBack(r), false, `${r} is a tab, not somewhere you drilled into`);
  assert.equal(showsBack("/recipes"), true, "the page he found it missing on");
  assert.equal(showsBack("/schedule/proposals"), true);
  assert.equal(showsBack("/movement/results"), true);
});

test("Client View's roots count as roots too — one top bar, both mounts agree", () => {
  assert.equal(isTabRoot("/client-preview/progress"), true);
  assert.equal(isTabRoot("/client-preview/nutrition"), true);
  assert.equal(isTabRoot("/nutrition/"), true, "a trailing slash is the same page");
  assert.equal(isTabRoot("/client-preview/recipes"), false);
});

test("with history it goes back one entry — the previous screen, not Home", () => {
  assert.deepEqual(backDecision(3, "/recipes", ""), { action: "back" });
});

test("with no history it goes Home rather than doing nothing", () => {
  // A deep link into the desktop PWA lands with history.length 1. A Back that
  // does nothing is the exact failure BackButtonGuard v2/v3 produced.
  assert.deepEqual(backDecision(1, "/recipes", ""), { action: "go", href: "/home" });
});

test("the fallback keeps Client View — leaving it by accident is a boundary", () => {
  assert.equal(homeHref("/recipes", "?as=client"), "/home?as=client");
  assert.equal(homeHref("/client-preview/recipes", ""), "/home?as=client");
  assert.equal(homeHref("/recipes", "?x=1"), "/home");
});

test("the phone's own Back is untouched — same two branches, same fallback", () => {
  // The whole point. If either line changes, the two buttons diverge.
  const guard = readFileSync(join(ROOT, "src/components/BackButtonGuard.tsx"), "utf8");
  assert.match(guard, /window\.history\.back\(\);/, "back one entry when it can");
  assert.match(guard, /window\.location\.href = "\/home";/, "Home when it cannot");
  assert.match(guard, /: window\.history\.length > 1/, "decided from history.length");
});

test("the control decides from history and never writes to it", () => {
  const bar = readFileSync(join(ROOT, "src/components/ClientTopBar.tsx"), "utf8");
  const code = bar.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /<BackControl \/>/, "the one top bar mounts it");
  assert.match(code, /backDecision\(window\.history\.length/, "and decides the same way the guard does");
  assert.doesNotMatch(code, /pushState|replaceState/, "an invented history entry is the v2/v3 bug");
});
