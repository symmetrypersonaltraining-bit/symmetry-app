import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A BUTTON THAT DISPATCHED AN EVENT NOBODY WAS LISTENING FOR.
 *
 * Dustin, 2026-08-04, mid-morning, about to start sessions: "my ai button from
 * my trainer app home screen is not working, fix asap".
 *
 * The floating AI button on the trainer home dispatched `symmetry:open:ai`.
 * AIAssistant — the only listener that has ever existed — listens for
 * `symmetry:open-ai`. A colon where there should have been a hyphen. The button
 * had never worked, not once, since the day it was written.
 *
 * What makes this worth a test rather than a one-line fix: nothing failed.
 * dispatchEvent on a name with no listener returns true and is a completely
 * legal thing to do. No console error, no red screen, no exception in Sentry —
 * the button simply did nothing, and the only way to find out was for Dustin to
 * press it and tell me.
 *
 * The app now wires nine or so of these custom events between components. Every
 * one of them can fail this exact way. So: every `symmetry:*` event that is
 * dispatched must have somewhere that listens for it, and vice versa.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e)) out.push(p);
  }
  return out;
}

const FILES = walk(join(ROOT, "src"));

/** Event names, mapped to the files that mention them. */
function collect(re: RegExp): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const f of FILES) {
    const src = readFileSync(f, "utf8");
    // Comments explain these names constantly; they are not wiring.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of code.matchAll(re)) {
      const name = m[1];
      const rel = f.slice(ROOT.length + 1);
      found.set(name, [...(found.get(name) ?? []), rel]);
    }
  }
  return found;
}

const dispatched = collect(/dispatchEvent\(\s*new (?:Custom)?Event\(\s*["'`](symmetry:[^"'`]+)["'`]/g);
const listened = collect(/addEventListener\(\s*["'`](symmetry:[^"'`]+)["'`]/g);

test("every symmetry:* event dispatched has a listener", () => {
  const orphans = [...dispatched.entries()].filter(([name]) => !listened.has(name));
  assert.deepEqual(
    orphans.map(([name, files]) => `${name} (dispatched in ${files.join(", ")})`),
    [],
    "these buttons fire an event nothing is listening for — they silently do nothing, exactly like symmetry:open:ai did",
  );
});

test("every symmetry:* listener has something that fires it", () => {
  // The mirror image: a listener whose event name nobody sends is a feature
  // with no way to reach it. Same silence, opposite end of the wire.
  const unreachable = [...listened.entries()].filter(([name]) => !dispatched.has(name));
  assert.deepEqual(
    unreachable.map(([name, files]) => `${name} (listened for in ${files.join(", ")})`),
    [],
    "nothing dispatches these",
  );
});

test("the trainer home AI button uses the name AIAssistant listens for", () => {
  // Named explicitly, because the generic check above passes just as happily if
  // somebody renames BOTH sides to something the rest of the app doesn't use.
  const home = readFileSync(join(ROOT, "src/app/(app)/home/TrainerHomeClient.tsx"), "utf8");
  assert.match(home, /dispatchEvent\(new CustomEvent\('symmetry:open-ai'\)\)/);
  assert.ok(!/symmetry:open:ai['"]/.test(home.replace(/\/\*[\s\S]*?\*\//g, "")), "the colon typo is back");
  assert.match(
    readFileSync(join(ROOT, "src/components/AIAssistant.tsx"), "utf8"),
    /addEventListener\("symmetry:open-ai"/,
  );
});

/**
 * AND THE FEEDBACK BOX NEXT TO IT SENT NOTHING.
 *
 * Found while fixing the button above — same floating cluster, same shape of
 * bug. Its Send handler set `feedbackSent` to true, showed "Thank you!
 * Feedback sent.", cleared the textarea and returned. There was no insert. Any
 * report Dustin filed from his own home screen was discarded, and the app
 * thanked him for it.
 */
test("the trainer home feedback box actually files the feedback", () => {
  const home = readFileSync(join(ROOT, "src/app/(app)/home/TrainerHomeClient.tsx"), "utf8");
  assert.match(home, /submitFeedback\(/, "the Send button must go through submitFeedback, like every other feedback entry point");
  assert.match(home, /from '@\/lib\/feedback'/);
  // Thanking somebody has to come after the write, not instead of it.
  // Against CODE — the comment above the handler names both calls.
  const code = home.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(
    code.indexOf("submitFeedback(") < code.indexOf("setFeedbackSent(true)"),
    "'Thank you' must not fire before the report is written",
  );
});
