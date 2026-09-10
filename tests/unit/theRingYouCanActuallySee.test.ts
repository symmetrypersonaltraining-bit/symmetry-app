import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE UNLOGGED RING HAS TO BE VISIBLE — and it has to be mixed against the TILE.
 *
 * Dustin, 10 Sep, with a screenshot of M5 Dinner and M6 Evening Snack:
 * *"you cant see the unchecked circles on unlocked foods w the new layout on
 * nutrition logger."*
 *
 * The ring is the control a client touches most on this screen, and on an
 * unlogged meal it was a ghost. The cause was one token in the wrong place:
 * the component passed `var(--brand-border)` inline, overriding the
 * `--tile-ctrl-bd` that `.sym-ring` already carried.
 *
 * `--brand-border` is computed against the PAGE. In dark it is
 * `color-mix(--brand-primary 34%, #2a3140)`, and the ring sits inside a tile
 * whose background is `#141922` tinted with that same primary. Two
 * near-identical darks — so a 2.5px ring drawn in one on the other disappears.
 *
 * globals.css has warned about exactly this for months: "Everything a tile
 * contains derives from the TILE, not from the raw token." This file is that
 * warning made enforceable for the one control where it cost the most.
 */

const ROOT = process.cwd();
const NUT = readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");
const CSS = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

// This file's own comments name --brand-border repeatedly while explaining why
// it is wrong. Strip comments or the explanation fails the assertion.
const CODE = NUT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The body of circleFor, which is the only thing that draws this control. */
function circleForBody(): string {
  const start = CODE.indexOf("function circleFor(");
  assert.ok(start > -1, "circleFor is what draws the ring");
  return CODE.slice(start, CODE.indexOf("function statusTag(", start));
}

test("the ring is never coloured with a page-level token", () => {
  const body = circleForBody();
  assert.doesNotMatch(body, /--brand-border/,
    "--brand-border is mixed against the PAGE; this control lives inside a TILE, "
    + "and in dark the two are near-identical darks. That is the bug in the screenshot.");
});

test("an unlogged ring leaves its colours to the class", () => {
  const body = circleForBody();
  // The default must be null — a sentinel meaning "not logged, do not paint
  // inline" — or the class token is overridden again and we are back to a ghost.
  assert.match(body, /let bg: string \| null = null, border: string \| null = null/,
    "the unlogged default must paint nothing inline");
  assert.match(body, /sym-ring--todo/, "and must carry the unlogged class");
  assert.match(body, /border === null \? null :/,
    "only a ring with a real state colour may set an inline border");
});

test("every state that fills the circle still names its own border", () => {
  const body = circleForBody();
  // Skipped is the trap: it set a background and let the border default, which
  // was fine while the default was a real colour. With the default now meaning
  // "unlogged", a skipped meal would lose its fill and read as untouched.
  const skipped = body.slice(body.indexOf('adh === "Skipped"'));
  const line = skipped.slice(0, skipped.indexOf("\n"));
  assert.match(line, /border = /, "a skipped meal must name its border explicitly");
  assert.doesNotMatch(line, /--brand-border/, "and not with the page token");
});

test("the unlogged ring is defined, and defined against the tile", () => {
  const rule = CSS.slice(CSS.indexOf(".sym-ring--todo {"), CSS.indexOf(".sym-ring--todo:active"));
  assert.ok(rule.length > 0, ".sym-ring--todo must exist");
  // Not [^)]* — that stops at the ")" inside var(--brand-text) and reports a
  // correct rule as broken. The value has nested parens by construction.
  assert.match(rule, /border-color:\s*color-mix\([\s\S]*?--tile-bg/,
    "its border must be mixed against --tile-bg, not the page");
  assert.match(rule, /background:\s*color-mix\([\s\S]*?--tile-bg/,
    "a faint inset is what makes an empty checkbox read as one");
});

test("the unlogged ring is more visible than the generic tile control", () => {
  // .sym-ring's own --tile-ctrl-bd is 22% of the text colour. This is the one
  // state a client is meant to ACT on, and every other state is a filled
  // circle in a state colour, so it earns more contrast than a passive border.
  const rule = CSS.slice(CSS.indexOf(".sym-ring--todo {"), CSS.indexOf(".sym-ring--todo:active"));
  const pct = Number(/var\(--brand-text\)\s+(\d+)%/.exec(rule)?.[1]);
  assert.ok(pct >= 30, `the unlogged border is ${pct}% of the text colour; 22% is what was already too faint`);
});

test("the ring keeps its 44px thumb target", () => {
  // Guarded because this bug invites "make it smaller and darker" fixes. It is
  // a thumb target on a phone and shrinking it is a regression on its own.
  const ring = CSS.slice(CSS.indexOf(".sym-ring {"), CSS.indexOf(".sym-tile.is-today .sym-ring"));
  assert.match(ring, /width:\s*44px/);
  assert.match(ring, /height:\s*44px/);
});
