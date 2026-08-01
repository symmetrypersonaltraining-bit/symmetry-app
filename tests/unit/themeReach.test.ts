import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * THE COLOUR SCHEME MUST REACH EVERY SURFACE.
 *
 * Reported 2026-08-01: "one of the updates lost the deeper color schemes we
 * set. that top bar should be color scheme." Then, crucially: "It's only on
 * the trainer view. Client view is fine on the color schemes."
 *
 * That split was the whole diagnosis. Client View's top bar reads
 * var(--brand-primary), so it had always recoloured correctly. Trainer chrome —
 * the sidebar and the mobile top bar — painted itself with a literal
 * `linear-gradient(#0D3F6E, #0F4C81)`: the navy theme's two hex values, frozen.
 * Picking Forest or Rose recoloured the client side and left trainer chrome
 * navy in all 21 schemes. AppHeader was half-themed, which is worse, because it
 * looks correct in a diff: var(--brand-primary) in the middle stop with #0D3F6E
 * and #1565C0 hardcoded at both ends.
 *
 * Two rules are asserted here, both of which failed silently for months —
 * silently being the point. Neither produces an error, a warning, or a crash.
 * They produce a screen that is the wrong colour, which only a human looking at
 * a phone can notice, and only if they happen to be using a non-default theme.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Strip comments so a hex quoted in a WHY-note isn't read as a live value. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

/* ────────────────────────────────────────────────────────────────────────────
   RULE 1 · Chrome derives from the theme, never from a literal.

   The navy pair is banned by value in the components that paint app chrome. If
   you need a new piece of chrome, use var(--chrome-grad) / var(--chrome-grad-v)
   from globals.css — they are derived from var(--brand-primary) with
   color-mix(), so all 21 schemes get the same treatment and none of them get
   navy unless navy is the scheme.
   ──────────────────────────────────────────────────────────────────────────── */

const CHROME_FILES = [
  "src/components/TrainerSidebar.tsx",
  "src/components/AppHeader.tsx",
  "src/components/TrainerLayoutWrapper.tsx",
];

// The navy theme's own values. Any of these appearing in a chrome component
// means that component is pinned to one theme.
const NAVY_LITERALS = [/#0D3F6E/i, /#0F4C81/i, /#0A3A6B/i, /#1565C0/i];

for (const file of CHROME_FILES) {
  test(`chrome is theme-derived, not hardcoded navy: ${file}`, () => {
    const src = code(read(file));
    for (const hex of NAVY_LITERALS) {
      assert.ok(
        !hex.test(src),
        `${file} contains the literal ${hex.source}. Trainer chrome must read ` +
          `var(--chrome-grad) / var(--chrome-grad-v) / var(--brand-primary) so it ` +
          `follows the active scheme. A literal here is invisible in every theme ` +
          `except navy, which is why this shipped and stayed broken.`,
      );
    }
  });
}

test("the derived chrome tokens exist and are built from the theme primary", () => {
  const css = read("src/app/globals.css");
  for (const token of ["--chrome-grad:", "--chrome-grad-v:"]) {
    assert.ok(css.includes(token), `globals.css must define ${token}`);
  }
  // Both must be derived, or they are just a second place to hardcode navy.
  const block = css.slice(css.indexOf("--chrome-grad:"));
  assert.match(
    block.slice(0, 900),
    /color-mix\(in srgb, var\(--brand-primary\)/,
    "--chrome-grad* must derive from var(--brand-primary) via color-mix()",
  );
});

/* ────────────────────────────────────────────────────────────────────────────
   RULE 2 · `var(--x)20` is not a colour.

   Someone converting `#0F4C8120` (hex + alpha) to a token wrote
   `var(--brand-primary)20` and kept the alpha pair on the end. That is not
   valid CSS: the declaration is dropped entirely, so the element renders with
   NO background rather than a tinted one. On the trainer dashboard that
   silently erased the "Today's Sessions" header tint and the "8 scheduled"
   chip fill, and in globals.css it erased the focus ring on every input and the
   coloured shadow under every primary button.

   It fails safe-looking, which is the trap: nothing errors, the element just
   quietly loses its colour, and a screenshot looks merely plain rather than
   broken. 33 of these were live across 9 files.

   The correct form: color-mix(in srgb, var(--brand-primary) 13%, transparent).
   ──────────────────────────────────────────────────────────────────────────── */

const BAD_ALPHA = /var\(--[a-z-]+\)[0-9A-Fa-f]{2}\b/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx?|css)$/.test(entry)) out.push(rel);
  }
  return out;
}

test("no `var(--token)NN` — hex alpha appended to a var() is a dropped declaration", () => {
  const offenders: string[] = [];
  for (const file of walk("src")) {
    const src = read(file);
    for (const hit of src.match(BAD_ALPHA) ?? []) {
      offenders.push(`${file}: ${hit}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "These are invalid CSS and render as no colour at all. Use " +
      "color-mix(in srgb, var(--token) N%, transparent) instead:\n  " +
      offenders.join("\n  "),
  );
});

/* ────────────────────────────────────────────────────────────────────────────
   RULE 3 · The theme save is not allowed to be silent again.

   client_app_settings.theme carried a CHECK constraint listing ten RETIRED
   theme ids. Every write from the picker was rejected by Postgres, and
   setTheme's `.then(() => {})` discarded the error — so for months the feature
   appeared to work, the theme lived only in localStorage, and an app update
   reset all 35 accounts to the default. The constraint is dropped; this
   asserts the error handling that would have surfaced it on day one.
   ──────────────────────────────────────────────────────────────────────────── */

test("ThemeProvider surfaces a failed theme save", () => {
  const src = code(read("src/components/ThemeProvider.tsx"));
  assert.ok(
    !/\.then\(\(\)\s*=>\s*\{\s*\}\)/.test(src),
    "setTheme must not discard the upsert result — that is exactly how the " +
      "rejected-by-constraint save stayed invisible.",
  );
  assert.match(
    src,
    /console\.error\(\s*"\[theme\]/,
    "A failed theme save must be logged. It must not throw a dialog at someone " +
      "who just picked a colour, but it must not vanish either.",
  );
});
