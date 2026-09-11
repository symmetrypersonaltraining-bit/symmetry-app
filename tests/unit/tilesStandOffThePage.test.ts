import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE TILE HAS TO STAND OFF THE PAGE IN ALL THIRTY SCHEMES, BOTH WAYS ROUND.
 *
 * Dustin, 11 Sep 2026: *"the background is the same color as the tiles on a
 * lot of the color schemes, and it makes everything kinda merge together…
 * some of them are a little bit different shade, but it's not drastic enough
 * to really make the tile stand out."*
 *
 * Measured before anything changed: 16 of the 30 sat under a 1.18 contrast
 * ratio, Citrus worst at 1.130. The cause was structural rather than
 * per-scheme — the page came from --brand-bg and the tile from
 * --brand-surface, two INDEPENDENT tokens, so the gap between them was
 * whatever each palette happened to have. Nobody chose 1.13; it fell out.
 *
 * Which is exactly why this is a test and not a one-off measurement. The
 * numbers live in three CSS custom properties and a new scheme inherits them
 * for free, but nothing stopped the next palette, or the next tweak to the
 * mixes, from quietly putting a scheme back under. This reads the real
 * stylesheet, resolves the same color-mix chain the browser does, and checks
 * every scheme in BOTH appearances — as designed, and flipped by the
 * Light/Dark toggle.
 *
 * The second half is not hypothetical: a 3% dark lift held for the seven
 * schemes that are dark by design and failed the moment Charcoal, Deep Purple
 * or Rose — near-black primaries, so the surfaces derived from them collapse
 * toward the page — was shown dark. 1.244, 1.249, 1.277. 5% is where the worst
 * case in the whole matrix equals the worst LIGHT scheme, 1.292.
 */

const FLOOR = 1.28;
const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
// Comments first: this stylesheet is full of prose that names selectors, and a
// comment swallowing the next real block is a silent miss — it is how
// midnightaurora once vanished from a run that cheerfully reported 29 themes.
const BARE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** The seven that are dark by design — the list .sym-page's dark block names. */
const NATIVE_DARK = new Set([
  "midnight", "carbonneon", "midnightaurora", "midnightember",
  "midnightcitrus", "midnightorchid", "deepreef",
]);

type RGB = [number, number, number];

function hex(h: string): RGB {
  let s = h.trim().replace(/^#/, "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as RGB;
}

/** color-mix(in srgb, a p%, b) — both opaque, so it is a plain sRGB lerp. */
function mix(a: RGB, p: number, b: RGB): RGB {
  return [0, 1, 2].map((i) => (a[i] * p) / 100 + b[i] * (1 - p / 100)) as RGB;
}

function luminance(c: RGB): number {
  const f = (x: number) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

function contrast(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Every [data-theme] palette, read out of the stylesheet itself. */
function palettes(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const m of BARE.matchAll(/\[data-theme="([a-z0-9]+)"\][^{]*\{([^}]*)\}/g)) {
    const [, key, body] = m;
    if (!body.includes("--brand-primary")) continue;
    const d = (out[key] ||= {});
    for (const pm of body.matchAll(/(--brand-[a-z0-9-]+)\s*:\s*([^;]+);/g)) d[pm[1].trim()] = pm[2].trim();
  }
  return out;
}

/** The three numbers a .sym-page block sets, read rather than hardcoded. */
function pageVars(block: RegExp): { sink: number; deep: number; lift: number } {
  const m = BARE.match(block);
  assert.ok(m, `could not find the .sym-page block for ${block}`);
  const n = (name: string) => {
    const g = m![1].match(new RegExp(`--${name}:\\s*([\\d.]+)%`));
    assert.ok(g, `--${name} is not set in ${block}`);
    return Number(g![1]);
  };
  return { sink: n("sink"), deep: n("tile-deep"), lift: n("tile-lift") };
}

const PAL = palettes();
const LIGHT = pageVars(/\n\.sym-page \{([\s\S]*?)\n\}/);
const DARK = pageVars(/\[data-appearance="dark"\] \.sym-page,([\s\S]*?)\n\}/);

/**
 * The page and the tile as the browser resolves them:
 *   page = color-mix(#070A10 sink%, --brand-bg)
 *   tile = color-mix(#FFFFFF lift%, color-mix(--brand-primary deep%, --brand-surface))
 *
 * `flipped` applies the appearance override for the scheme's opposite, which
 * is the generic derivation in globals.css — dark from the primary for a light
 * scheme, light from the primary for a dark one.
 */
function ratioFor(theme: string, flipped: boolean): number {
  const p = hex(PAL[theme]["--brand-primary"]);
  const nativeDark = NATIVE_DARK.has(theme);
  let bg = hex(PAL[theme]["--brand-bg"]);
  let surface = hex(PAL[theme]["--brand-surface"]);
  let v = nativeDark ? DARK : LIGHT;

  if (flipped && !nativeDark) {
    bg = mix(p, 14, hex("#0c0f14"));
    surface = mix(p, 18, hex("#141922"));
    v = DARK;
  } else if (flipped && nativeDark) {
    bg = mix(p, 6, hex("#F7F9FC"));
    surface = mix(p, 2, hex("#FFFFFF"));
    v = LIGHT; // the :not([data-appearance="light"]) on every by-name rule
  }

  const page = mix(hex("#070A10"), v.sink, bg);
  const tile = mix(hex("#FFFFFF"), v.lift, mix(p, v.deep, surface));
  return contrast(page, tile);
}

test("the stylesheet still has all thirty schemes in it", () => {
  assert.equal(Object.keys(PAL).length, 30, Object.keys(PAL).join(", "));
  for (const t of NATIVE_DARK) assert.ok(PAL[t], `${t} is named as dark but has no palette`);
});

test(`every scheme clears ${FLOOR} between the page and a tile, as designed`, () => {
  const under = Object.keys(PAL)
    .map((t) => [t, ratioFor(t, false)] as const)
    .filter(([, r]) => r < FLOOR);
  assert.deepEqual(under, [], `these merge into their background: ${JSON.stringify(under)}`);
});

test(`every scheme clears ${FLOOR} when the Light/Dark toggle flips it`, () => {
  // The half a 3% lift missed. A scheme is only half-covered if it is checked
  // in the appearance it shipped with.
  const under = Object.keys(PAL)
    .map((t) => [t, ratioFor(t, true)] as const)
    .filter(([, r]) => r < FLOOR);
  assert.deepEqual(under, [], `these merge once flipped: ${JSON.stringify(under)}`);
});

test("the floor is a real check — it fails on the numbers that shipped before", () => {
  // A check that cannot fail is not a check. These are the values from before
  // 11 Sep: a 6% sink and no lift at all on either side.
  const was = { sink: 6, deep: 4, lift: 0 };
  const p = hex(PAL.citrus["--brand-primary"]);
  const page = mix(hex("#070A10"), was.sink, hex(PAL.citrus["--brand-bg"]));
  const tile = mix(hex("#FFFFFF"), was.lift, mix(p, was.deep, hex(PAL.citrus["--brand-surface"])));
  const before = contrast(page, tile);
  assert.ok(before < 1.15, `Citrus used to be ${before.toFixed(3)}`);
  assert.ok(ratioFor("citrus", false) > before, "and it is better now");
});
