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

/* ────────────────────────────────────────────────────────────────────────────
   RULE 4 · The theme list and the theme tokens cannot drift apart.

   A scheme exists in two places — an entry in THEMES (what the picker draws)
   and a [data-theme="…"] block in globals.css (what it actually looks like).
   Add one without the other and the failure is silent in BOTH directions: an
   id with no tokens shows a swatch that selects nothing and falls back to the
   default palette, and tokens with no id are simply unreachable. This is the
   same class of drift that let client_app_settings.theme reject every save.
   ──────────────────────────────────────────────────────────────────────────── */

test("every theme id has tokens, and every token block has an id", () => {
  const provider = read("src/components/ThemeProvider.tsx");
  const css = read("src/app/globals.css");

  const ids = [...provider.matchAll(/\{\s*id:\s*"([a-z0-9]+)"/g)].map((m) => m[1]);
  const blocks = new Set(
    [...css.matchAll(/\[data-theme="([a-z0-9]+)"\]\s*\{/g)].map((m) => m[1]),
  );

  assert.ok(ids.length >= 30, `expected at least 30 themes, found ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate theme id in THEMES");

  const missingTokens = ids.filter((id) => !blocks.has(id));
  assert.deepEqual(
    missingTokens,
    [],
    `These themes are in the picker but have no [data-theme] block in ` +
      `globals.css, so selecting one silently falls back to the default palette: ` +
      missingTokens.join(", "),
  );

  const orphanBlocks = [...blocks].filter((b) => !ids.includes(b));
  assert.deepEqual(
    orphanBlocks,
    [],
    `These [data-theme] blocks have no entry in THEMES, so nothing can ever ` +
      `select them: ` + orphanBlocks.join(", "),
  );
});

test("the third colour is optional — two-colour schemes must still resolve", () => {
  const css = code(read("src/app/globals.css"));
  // Note the nested var() — the fallback is itself a var(), so a naive
  // "everything up to the first )" capture stops one paren short.
  const uses = [...css.matchAll(/var\(--brand-accent-2\s*([^;]*?)\)\)/g)].map((m) => m[1]);
  assert.ok(uses.length > 0, "--brand-accent-2 should be used somewhere");
  for (const u of uses) {
    assert.match(
      u,
      /^,\s*var\(--brand-accent$/,
      "Every --brand-accent-2 read must fall back to var(--brand-accent). " +
        "Without the fallback the 21 two-colour schemes render a gradient stop " +
        "as 'unset', which paints black.",
    );
  }
});

/* ────────────────────────────────────────────────────────────────────────────
   RULE 5 · Theme-coloured text never sits on a hardcoded light panel.

   Reported 2026-08-01 with a screenshot: "need to fix that can't read text."
   The weekly-focus card was `background: "#eef2ff"` with
   `color: "var(--brand-text)"` on the text inside it. Both are reasonable on
   their own; together they are a dark-mode landmine, because --brand-text is
   #E6EDF3 under a dark theme — near-white text on a near-white panel.

   It reads perfectly in every light theme, which is why it shipped, and it is
   invisible in the dark ones, which is what a client actually saw.
   ──────────────────────────────────────────────────────────────────────────── */

function relLuminance(hex: string): number | null {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length < 6) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

test("no literal light background under var(--brand-text)", () => {
  const offenders: string[] = [];
  for (const file of walk("src")) {
    if (!file.endsWith(".tsx")) continue;
    const src = read(file);
    for (const m of src.matchAll(/style=\{\{([^}]*)\}\}/g)) {
      const body = m[1];
      const bg = body.match(/background(?:Color)?:\s*"(#[0-9A-Fa-f]{3,8})"/);
      if (!bg || !body.includes("var(--brand-text)")) continue;
      const L = relLuminance(bg[1]);
      if (L !== null && L > 0.8) {
        offenders.push(`${file}: ${bg[1]} + var(--brand-text)`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "A hardcoded light background with theme-coloured text on it is invisible " +
      "in every dark theme. Derive the panel from var(--brand-surface) — see " +
      ".focus-panel in globals.css:\n  " + offenders.join("\n  "),
  );
});

test("the focus panel is derived, not a literal lavender", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.focus-panel\s*\{/, "globals.css must define .focus-panel");
  // Anchor on the DEFINITION, not the first mention — the depth layer now
  // lists .focus-panel among the surfaces it glows, and that appears first.
  const rule = css.slice(css.indexOf(".focus-panel {"));
  assert.match(
    rule.slice(0, 500),
    /color-mix\(in srgb, var\(--brand-primary\)[^)]*, var\(--brand-surface\)\)/,
    ".focus-panel's background must derive from --brand-surface so it is dark " +
      "on dark themes and tinted toward whichever scheme is active.",
  );
  for (const file of ["src/components/ClientWeekSummary.tsx", "src/components/CoachFocusCard.tsx"]) {
    assert.ok(
      !/#eef2ff/i.test(code(read(file))),
      `${file} still carries the literal #eef2ff focus panel. Use className="focus-panel".`,
    );
  }
});

test("text-clipped gradients are set with background-image, never the shorthand", () => {
  const css = read("src/app/globals.css");
  // .gradient-text and .stat-number paint their gradient INTO the glyphs via
  // background-clip: text. The `background` shorthand resets background-clip to
  // border-box, so any later rule using the shorthand silently un-clips them:
  // the gradient fills the whole box and the text, whose fill colour is
  // transparent, vanishes. It renders as a solid coloured bar where the
  // client's name should be, and nothing errors.
  const rules = [...css.matchAll(/(^|\})\s*([^{}]*\b(?:gradient-text|stat-number)\b[^{}]*)\{([^}]*)\}/gm)];
  assert.ok(rules.length >= 2, "expected rules targeting .gradient-text / .stat-number");
  for (const r of rules) {
    const body = r[3];
    if (!/linear-gradient/.test(body)) continue;
    if (/background-clip/.test(body)) continue; // the defining rule sets both
    assert.ok(
      !/(^|;)\s*background\s*:/.test(body),
      "A later rule re-declares the gradient with the `background` shorthand, " +
        "which resets background-clip and makes the text invisible. Use " +
        "`background-image:` instead.\nOffending selector: " + r[2].trim(),
    );
  }
});

test("the depth layer reaches the app's real, class-less surfaces", () => {
  const css = read("src/app/globals.css");
  // The cards on the dashboard are inline `background: var(--brand-surface)`
  // with a numeric borderRadius and NO class. A depth layer that only targets
  // .card / .rounded-2xl misses all 274 of them, which is exactly what shipped
  // first and why 35 and 50 looked identical on a real phone.
  assert.match(
    css,
    /\[style\*="var\(--brand-surface\)"\]/,
    "the depth layer must reach inline-styled surfaces, not just classed ones",
  );
  assert.match(
    css,
    /body\s*\{[^}]*--brand-surface:\s*color-mix\(in srgb, var\(--brand-primary\)/,
    "--brand-surface itself must deepen, so every inline var(--brand-surface) " +
      "follows without needing a class",
  );
});

test("depth & glow is opt-in, graded, and cannot be on by default", () => {
  const css = read("src/app/globals.css");
  const provider = code(read("src/components/ThemeProvider.tsx"));

  // Every level declared in TypeScript must have a CSS block, and vice versa —
  // the same drift rule as themes. A level with no block silently renders as
  // "off" while the settings row shows it selected.
  const levels = [...provider.matchAll(/\{\s*value:\s*(\d+),/g)].map((m) => Number(m[1]));
  assert.deepEqual(levels, [0, 20, 35, 50], "DEPTH_LEVELS should be off/20/35/50");

  for (const lvl of levels.filter((l) => l > 0)) {
    assert.ok(
      // `body` on purpose — the tokens are redefined one element down so the
      // right-hand var() resolves against the theme instead of cycling.
      css.includes(`[data-deep="${lvl}"] body {`),
      `globals.css has no [data-deep="${lvl}"] body block, so that level renders as off`,
    );
  }
  const cssLevels = new Set(
    [...css.matchAll(/\[data-deep="(\d+)"\]/g)].map((m) => Number(m[1])),
  );
  for (const l of cssLevels) {
    assert.ok(levels.includes(l), `globals.css styles level ${l}, which nothing can select`);
  }

  assert.ok(
    !/:root\s*\{[^}]*--block-glow/.test(css),
    "--block-glow must not be set on :root — that would turn the effect on for " +
      "everyone, and Dustin was explicit that it is a per-person choice.",
  );
  assert.match(
    provider,
    /useState<DepthLevel>\(0\)/,
    "the depth state must default to 0 (off)",
  );
  assert.match(
    provider,
    /isDepthLevel\(settings\?\.depth_level\)/,
    "a NULL or unrecognised depth_level means 'never chosen' and must not " +
      "override the device setting",
  );
});

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
