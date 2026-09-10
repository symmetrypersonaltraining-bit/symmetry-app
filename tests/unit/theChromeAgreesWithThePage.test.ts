import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveClientMode } from "../../src/lib/clientModeResolve";

/**
 * THE CHROME AGREES WITH THE PAGE.
 *
 * Dustin, 10 Sep, with a screenshot of his own Client View: *"my own client
 * view nav tabs r gone!"* The page was the client home — greeting, streak,
 * today's workouts. The chrome was the trainer's: hamburger, the trainer's
 * bell, and no bottom tabs at all.
 *
 * Every server page and the middleware decide Client View from `?as=` and the
 * symmetry_client_mode cookie. TrainerLayoutWrapper decided from localStorage
 * and read neither. Its own comment recorded fixing one direction of that split
 * (it re-asserted the cookie FROM localStorage) and left the other open —
 * Android evicts localStorage under storage pressure; cookies are not subject
 * to quota. Once localStorage was gone the cookie lived on for 30 days, every
 * page rendered the client app, and the wrapper dressed it as the trainer's.
 *
 * Client-only accounts could never hit this: their branch of the layout mounts
 * <BottomNav /> unconditionally. Only a trainer who is also a client could —
 * which on 10 Sep was seven people, Dustin among them.
 *
 * Two things are pinned here. The RULE, pure, so it can be proved to match the
 * pages. And the WIRING: the server hands the wrapper the cookie's answer, and
 * the wrapper no longer decides from localStorage.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Comments describe the old bug and name what the code must not contain. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── the rule ─────────────────────────────────────────────────────────────────

test("the cookie alone puts a trainer in Client View — this is the case that was lost", () => {
  // localStorage is not an input. Before, this exact state — cookie set,
  // nothing else — rendered client pages inside trainer chrome.
  assert.equal(resolveClientMode({ as: null, cookie: "1" }), true);
});

test("?as=client enters Client View before the cookie has propagated", () => {
  assert.equal(resolveClientMode({ as: "client", cookie: null }), true);
});

test("?as=trainer BEATS a cookie that has not cleared yet — same as the pages", () => {
  // viewToggleIsSymmetric.test.ts pins this ordering on every page: the trainer
  // marker is checked before the cookie, or a stale cookie still decides.
  assert.equal(resolveClientMode({ as: "trainer", cookie: "1" }), false);
});

test("nothing at all means the trainer's own app", () => {
  assert.equal(resolveClientMode({ as: null, cookie: null }), false);
  assert.equal(resolveClientMode({ as: undefined, cookie: undefined }), false);
  assert.equal(resolveClientMode({ as: "garbage", cookie: "0" }), false);
});

// ── the wiring ───────────────────────────────────────────────────────────────

const LAYOUT = code(read("src/app/(app)/layout.tsx"));
const WRAPPER = code(read("src/components/TrainerLayoutWrapper.tsx"));

test("the server layout hands the wrapper the cookie's answer", () => {
  assert.match(LAYOUT, /isClientMode\(\)/, "the layout must ask the cookie, via the existing helper");
  assert.match(LAYOUT, /initialClientMode=\{initialClientMode\}/, "and pass it to the wrapper");
});

test("the wrapper STARTS on that answer rather than on false", () => {
  assert.match(WRAPPER, /useState\(initialClientMode\)/,
    "useState(false) paints trainer chrome first and then maybe swaps — and could settle wrong for good");
});

test("the wrapper reconciles from the pages' inputs, not from localStorage", () => {
  assert.match(WRAPPER, /resolveClientMode\(readClientModeInputs\(\)\)/,
    "the mount decision must be the shared rule over ?as= and the cookie");
  assert.doesNotMatch(WRAPPER, /stored === "client"/,
    "deciding the chrome from localStorage alone is the bug: it is the one store the pages never read");
  assert.doesNotMatch(WRAPPER, /localStorage\.getItem\("symmetry_view_mode"\)/,
    "localStorage may be written as a mirror, never read as an input");
});

test("localStorage is still written, because three feedback paths read it for a label", () => {
  assert.match(WRAPPER, /localStorage\.setItem\("symmetry_view_mode"/);
  for (const p of ["src/components/FloatingDock.tsx", "src/components/HeaderAssist.tsx"]) {
    assert.match(read(p), /symmetry_view_mode/, p + " reads the mirror; do not stop writing it");
  }
});

test("the tests that already pin the wrapper still find what they look for", () => {
  // oneClientApp.test.ts slices the client branch between these two markers;
  // viewToggleIsSymmetric.test.ts needs both toggle markers. A refactor that
  // renamed either would silently empty those tests.
  assert.ok(WRAPPER.includes("if (clientMode) {"));
  assert.ok(read("src/components/TrainerLayoutWrapper.tsx").includes("── TRAINER MODE"));
  assert.match(WRAPPER, /\/home\?as=client/);
  assert.match(WRAPPER, /\/home\?as=trainer/);
});
