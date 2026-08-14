import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE BIG COACH ENTRY POINT MUST NOT FLOAT, AND MUST NOT RENDER FOR ANYONE ELSE.
 *
 * Dustin, 14 Aug, asked for a larger way into the coach for his parents — the
 * standard one is "56px in a corner, fine for Lauren, not for someone 71
 * holding the phone at arm's length". His only constraint, and he gave it
 * twice: "do not let it cover any buttons on any page or tab... make sure this
 * button does not cover up anything that is needed like another button."
 *
 * The tempting implementation is to bump CoachFab's SIZE for those two. That is
 * wrong, and this repo already holds the proof:
 *
 *   · CoachFab floats, and its rules were each paid for — hides under a
 *     keyboard, lifts for SessionDock, sits below sheets, clears the nav.
 *   · GlobalCoach keeps a per-screen FAB_LIFT map ON TOP of that, which exists
 *     because the 56px circle was covering the Messages send button. Dustin,
 *     13 Aug, with a screenshot: "the ai bot [is] over a button blocking it."
 *
 * A bigger circle in the same corner covers strictly more on every screen, and
 * would re-open that class everywhere at once.
 *
 * So the bar is IN-FLOW. An in-flow element pushes content down; it cannot
 * cover a control. That satisfies "cover nothing" by construction rather than
 * by inspection — which matters, because inspection is exactly what fails when
 * a new screen is added six months from now.
 *
 * This test fails if anyone makes it float, or widens who sees it.
 */

const ROOT = process.cwd();
const BAR = join(ROOT, "src/components/BigCoachBar.tsx");

/** Comments explain the rule and must not be able to satisfy it. */
function codeOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/"));
    })
    .join("\n");
}

test("the big coach bar is in-flow — it never positions itself over the page", () => {
  const code = codeOnly(readFileSync(BAR, "utf8"));

  assert.doesNotMatch(
    code,
    /position\s*:\s*["']?fixed/,
    "BigCoachBar became position:fixed — it can now cover controls, which is the one thing it must not do",
  );
  assert.doesNotMatch(
    code,
    /position\s*:\s*["']?absolute/,
    "BigCoachBar became position:absolute — same problem: it is out of flow and can overlap",
  );
  assert.doesNotMatch(
    code,
    /className=["'][^"']*\b(fixed|absolute)\b/,
    "BigCoachBar picked up a fixed/absolute utility class — it must stay in normal flow",
  );
  assert.doesNotMatch(
    code,
    /zIndex|z-\[|\bz-\d/,
    "BigCoachBar acquired a z-index. An in-flow element does not need one, and needing one means it is overlapping something",
  );
});

test("it renders for pool-gated clients only, and fails closed", () => {
  const code = codeOnly(readFileSync(BAR, "utf8"));

  assert.match(
    code,
    /ai_pool_only/,
    "the gate is gone — this bar would render for all 35 clients, not the two it was built for",
  );
  assert.match(
    code,
    /===\s*true/,
    "the flag is no longer compared strictly to true; a null or absent row must not read as eligible",
  );
  assert.match(
    code,
    /useState\(false\)/,
    "the default is no longer hidden — it must fail CLOSED so an error never adds a control to someone else's screen",
  );
  assert.match(
    code,
    /catch[\s\S]{0,80}setShow\(false\)/,
    "the catch no longer forces hidden; a failed settings read must hide the bar, not show it",
  );
});

test("CoachFab itself was not enlarged to solve this", () => {
  const fab = codeOnly(readFileSync(join(ROOT, "src/components/CoachFab.tsx"), "utf8"));
  const m = fab.match(/const\s+SIZE\s*=\s*(\d+)/);
  assert.ok(m, "CoachFab's SIZE constant is gone — the floating button's footprint is no longer pinned");
  assert.equal(
    Number(m![1]),
    56,
    "CoachFab grew past 56px. That corner already covered the Messages send button once; " +
      "the big entry point is the in-flow bar, not a bigger circle.",
  );
});

test("the bar opens the coach through the shared event, not its own chat", () => {
  const code = codeOnly(readFileSync(BAR, "utf8"));
  assert.match(
    code,
    /symmetry:open-coach/,
    "the bar no longer dispatches the open event — it must reuse the one coach, not mount a second",
  );

  const sheet = codeOnly(
    readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/CoachChatSheet.tsx"), "utf8"),
  );
  assert.match(
    sheet,
    /addEventListener\(\s*["']symmetry:open-coach["']/,
    "CoachChatSheet stopped listening for the external open event — the bar would do nothing when tapped",
  );
  // The handler is declared before it is registered, so this deliberately does
  // not assume an order — it asserts the handler itself routes through
  // openChat(). Calling setOpen(true) directly would open a chat with no
  // greeting and no not-today warning, which a tapped one always gets.
  assert.match(
    sheet,
    /onExternalOpen\s*=\s*\(\)\s*=>\s*\{[^}]*openChat\(\)/,
    "the external-open handler no longer calls openChat(), so an externally-opened chat would skip " +
      "the greeting and the not-today warning that a tapped one gets",
  );
});
