import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ONE CLIENT APP — the trainer's Client View and a real client's app are the
 * same app, and this stops them drifting apart again.
 *
 * Dustin, 9 Sep, on finding out they were not: *"we need to make my client app
 * work exactly like any other clients so i can test the same exact app they are
 * using... this is something we've discussed before and needs to be locked in
 * permanently so we dont run into this again. i was not aware they were looking
 * at a diff screen than i am and that is not good."*
 *
 * ⚠️ IT HAD ALREADY COST REAL TIME. The nutrition logger's "very sticky
 * scrolling" was chased as an app bug; it existed ONLY in Client View, because
 * that wrapper added a nested scroller real clients never had. A test surface
 * that differs from the real one does not merely fail to catch bugs — it
 * invents them, and they then get "fixed" in the app that never had them.
 *
 * The chrome that differed: a real client got a bare sticky strip with the
 * feedback button pushed right; Client View got the branded bar with the logo.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const CLIENT_LAYOUT = read("src/app/(app)/layout.tsx");
const WRAPPER = read("src/components/TrainerLayoutWrapper.tsx");
/** Just the client-mode branch. The trainer-mode branch below it has its own
 *  chrome and its own HeaderAssist, and that is correct -- it is the trainer's
 *  app, not the client's. */
const CLIENT_VIEW = WRAPPER.slice(
  WRAPPER.indexOf("if (clientMode) {"),
  WRAPPER.indexOf("── TRAINER MODE"));
const BAR = read("src/components/ClientTopBar.tsx");
/** Comments describe the old bug, so they name the things the code must not
 *  contain. Strip them before asserting on what actually renders. */
const strip = (src: string) =>
  src.replace(/\{\/\*[^]*?\*\/\}/g, "").replace(/\/\*[^]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("both mounts render the SAME top bar component", () => {
  assert.match(CLIENT_LAYOUT, /<ClientTopBar \/>/,
    "a real client gets the shared bar");
  assert.match(CLIENT_VIEW, /<ClientTopBar\b/,
    "Client View gets the shared bar");
});

test("neither hand-rolls its own bar", () => {
  // The exact shape of the old drift: two blocks of JSX that looked alike and
  // then stopped being alike.
  for (const [name, src] of [["client layout", CLIENT_LAYOUT], ["Client View", CLIENT_VIEW]] as const) {
    assert.doesNotMatch(strip(src), /<HeaderAssist/,
      `${name} must not mount HeaderAssist directly — it belongs to ClientTopBar now`);
  }
});

test("the bar carries the logo, the bell and feedback", () => {
  // Dustin: "there's a notification bell and a feedback button on that bar
  // every client needs that there" and "i def want the branded bar w logo".
  assert.match(BAR, /<Logo\b/);
  assert.match(BAR, /<HeaderAssist \/>/);          // bell + feedback live in here
  assert.match(BAR, /Symmetry/);
  assert.match(BAR, /My Training/);
});

test("Trainer View is the ONLY difference, and only Client View has it", () => {
  assert.match(strip(CLIENT_VIEW), /Trainer View/,
    "the trainer needs the way back");
  // ⚠️ THE ONE THING A CLIENT MUST NEVER GET. Dustin, 9 Sep: "just remember
  // they cannot have that trainer view toggle." Checked against the whole real
  // client layout, comments included -- there is no route, no button and no
  // mention of one.
  assert.doesNotMatch(CLIENT_LAYOUT, /Trainer View/,
    "a real client has no trainer view to go to");
  assert.doesNotMatch(strip(CLIENT_LAYOUT), /handleToggleMode|clientMode/,
    "and nothing in a client's layout can toggle modes at all");
  // It arrives through the slot rather than being baked into the bar, so the
  // bar itself stays identical for both mounts.
  assert.match(BAR, /trailing/);
  assert.doesNotMatch(strip(BAR), /Trainer View/,
    "the shared bar must not carry the toggle -- only the slot may");
});

test("the two bottom navs still agree on tabs, order and labels", () => {
  // He asked directly whether these matched. They do, and only the hrefs
  // differ -- his carry ?as=client so the SERVER renders the client branch on
  // first paint. That difference is deliberate and must not be "fixed".
  const labels = (src: string) =>
    [...src.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
  const real = labels(read("src/components/BottomNav.tsx"));
  const view = labels(WRAPPER).slice(0, real.length);
  assert.deepEqual(view, real, "same tabs in the same order for both");
  assert.ok(real.length === 6, "six tabs");
});
