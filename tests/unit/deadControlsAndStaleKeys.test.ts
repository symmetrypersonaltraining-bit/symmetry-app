// CONTROLS THAT DO NOTHING, AND KEYS THAT EXPIRE SILENTLY.
//
// Three faults found on 22 Aug while auditing what was left, all verified
// against the live code rather than taken from a doc. Each fails quietly,
// which is why none had been reported: nothing errors, you just do not get
// what you expected and have no way to tell why.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("the New Program button does something when tapped", () => {
  // It had no onClick at all — never a broken handler, just none. First thing
  // anybody taps on that screen, and three trainers had just been given
  // accounts.
  const btn = code(read("src/components/NewProgramButton.tsx"));
  assert.match(btn, /onClick=\{open\}/, "the button is inert again");
  assert.match(btn, /symmetry:open-ai/,
    "it must dispatch the same event the header uses, so there is one drawer");

  const page = code(read("src/app/(app)/library/programs/page.tsx"));
  assert.match(page, /<NewProgramButton \/>/, "the page is back to its own dead button");
  assert.ok(!/New Program\s*<\/button>/.test(page),
    "a second, handler-less New Program button is on the page");
});

test("a challenge announces itself, whatever month it launches in", () => {
  const c = code(read("src/components/ClientTakeovers.tsx"));
  assert.ok(!/challenge-launch-20\d\d-\d\d/.test(c),
    "the launch key is hardcoded to a month again — every client already has " +
    "that string marked seen, so the next challenge reaches nobody and nothing errors");
  assert.match(c, /launchKey\(ch\.id\)/, "the key must be derived from the challenge row");
  // And the challenge has to be fetched BEFORE the seen-check, or the key
  // cannot be built from it.
  const fetchAt = c.indexOf('v_active_challenge');
  const seenAt = c.indexOf('seen.has(launchKey');
  assert.ok(fetchAt > -1 && seenAt > fetchAt,
    "the seen-check runs before the challenge is loaded, so there is no id to key on");
});

test("dismissing the weigh-in nudge lasts the day, not the session", () => {
  const c = code(read("src/components/WeighInNudge.tsx"));
  assert.ok(!/sessionStorage/.test(c),
    "sessionStorage is emptied when the app closes, and every client runs this as " +
    "a PWA — dismissing bought minutes");
  assert.match(c, /localStorage\.getItem\(KEY\) === centralToday\(\)/,
    "the dismissal must be keyed to the Central date");
  assert.ok(!/toDateString\(\)/.test(c),
    "toDateString is the DEVICE's day and disagrees with every other date in the app");
});
