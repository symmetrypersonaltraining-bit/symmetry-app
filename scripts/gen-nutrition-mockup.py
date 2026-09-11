#!/usr/bin/env python3
"""
Build the Nutrition-screen format mock-up.

It inlines the REAL globals.css, so what Dustin approves here is literally what
the screen will render -- the same .sym-* rules, the same thirty [data-theme]
palettes, the same [data-deep] depth levels. A mock-up drawn with hand-picked
hexes can look right and ship wrong; this one cannot drift from the app,
because it IS the app's stylesheet.

Two files come out of one source:
  docs/mockups/nutrition-format.html   standalone, the repo's mock-up convention
  <scratchpad>/nutrition-artifact.html body-only, for publishing as an Artifact
"""
import re, os, json, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = open(os.path.join(ROOT, "src/app/globals.css"), encoding="utf-8").read()
CSS = "\n".join(l for l in CSS.split("\n") if not l.startswith("@tailwind"))

THEMES = [
    ("pastel","Soft Pastel"),("navy","Navy Blue"),("charcoal","Charcoal"),
    ("forest","Forest Green"),("gunmetal","Gunmetal"),("purple","Deep Purple"),
    ("orange","Burnt Orange"),("rose","Rose"),("blush","Blush"),
    ("lagoon","Lagoon"),("orchid","Orchid"),("berry","Berry"),
    ("slatepop","Slate Pop"),("plumdusk","Plum Dusk"),("carbonneon","Carbon Neon"),
    ("midnight","Midnight"),("sunsetcoral","Sunset Coral"),("aurora","Aurora"),
    ("citrus","Citrus Punch"),("berrynoir","Berry Noir"),("oceandusk","Ocean Dusk"),
    ("midnightaurora","Midnight Aurora"),("midnightember","Midnight Ember"),
    ("midnightcitrus","Midnight Citrus"),("midnightorchid","Midnight Orchid"),
    ("violetdawn","Violet Dawn"),("sunsetdrift","Sunset Drift"),
    ("deepreef","Deep Reef"),("blushcloud","Blush Cloud"),("hotpink","Hot Pink"),
]
assert len(THEMES) == 30, len(THEMES)

# --- palettes straight out of globals.css, so the swatches cannot lie --------
def palettes():
    # Comments come out FIRST. A prose comment that names a selector -- and this
    # stylesheet is full of them -- swallows the next real block, and the miss is
    # silent: midnightaurora simply vanished from a run that reported 29 themes.
    bare = re.sub(r"/\*.*?\*/", "", CSS, flags=re.S)
    out = {}
    for m in re.finditer(r'\[data-theme="([a-z0-9]+)"\][^{]*\{([^}]*)\}', bare):
        key, body = m.group(1), m.group(2)
        if "--brand-primary" not in body:
            continue
        d = out.setdefault(key, {})
        for pm in re.finditer(r'(--brand-[a-z0-9-]+)\s*:\s*([^;]+);', body):
            d[pm.group(1).strip()] = pm.group(2).strip()
    return out

PAL = palettes()
missing = [k for k, _ in THEMES if k not in PAL]
if missing:
    sys.exit("no palette for: " + ", ".join(missing))

# Which schemes are natively dark. Same list the .sym-page dark block names,
# plus whatever AutoDark would stamp -- measured, not guessed.
NATIVE_DARK = ["midnight","carbonneon","midnightaurora","midnightember",
               "midnightcitrus","midnightorchid","deepreef"]

def lum(hexcolor):
    h = hexcolor.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    except ValueError:
        return 1.0
    def f(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b)

SWATCH = {k: {"primary": PAL[k].get("--brand-primary", "#888"),
              "accent": PAL[k].get("--brand-accent", PAL[k].get("--brand-primary", "#888")),
              "accent2": PAL[k].get("--brand-accent-2", ""),
              "bg": PAL[k].get("--brand-bg", "#fff"),
              "dark": k in NATIVE_DARK or lum(PAL[k].get("--brand-bg", "#fff")) < 0.18}
          for k, _ in THEMES}

# ── the mock-up's own chrome ────────────────────────────────────────────────
# Deliberately single-world: a neutral dark deck so thirty schemes are judged
# against the same ground, and none of them fights the page around it.
MK_CSS = r"""
/* ═══ the mock-up's own chrome — none of this ships ═══════════════════════ */
body.mk {
  background: #0F1319 !important;
  color: #DDE5F0 !important;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.mk-wrap { max-width: 1240px; margin: 0 auto; padding-block: 22px 80px; padding-left: 18px; padding-right: 18px; }
.mk-wrap h1 { font-size: 22px; margin: 0 0 6px; color: #fff; letter-spacing: -.02em; }
.mk-lede { color: #93A4BC; font-size: 13.5px; line-height: 1.7; max-width: 74ch; margin: 0 0 16px; }
.mk-lede b { color: #DDE5F0; }
.mk-cols { display: grid; grid-template-columns: 404px 1fr; gap: 28px; align-items: start; }
@media (max-width: 940px) { .mk-cols { grid-template-columns: 1fr; } }

.mk-stage { position: sticky; top: 16px; }
@media (max-width: 940px) { .mk-stage { position: static; } }
.mk-phone {
  width: 100%; max-width: 392px; border-radius: 26px; overflow: hidden;
  border: 1px solid #2A3444; box-shadow: 0 18px 50px rgba(0,0,0,.55);
  background: var(--brand-bg);
}
/* The real client top bar: --chrome-grad, white text, bell + feedback. */
.mk-top {
  display: flex; align-items: center; gap: 10px; padding: 13px 14px 12px;
  background: var(--chrome-grad, var(--brand-primary));
}
.mk-top .mk-mark { width: 24px; height: 24px; border-radius: 7px; background: rgba(255,255,255,.22);
  display: grid; place-items: center; font-size: 12px; color: #fff; font-weight: 800; }
.mk-top .mk-nm { flex: 1; color: #fff; font-weight: 600; font-size: 13.5px; }
.mk-top .mk-nm span { color: rgba(255,255,255,.5); font-weight: 500; margin-left: 6px; font-size: 11.5px; }
.mk-top .mk-ic { width: 27px; height: 27px; border-radius: 50%; background: rgba(255,255,255,.16);
  display: grid; place-items: center; font-size: 12px; color: #fff; }
.mk-scr { height: 690px; overflow-y: auto; }
.mk-scr::-webkit-scrollbar { width: 0; }
.mk-pad { padding: 0 14px 26px; }
/* bottom nav, drawn only so the screen is judged at its real height */
.mk-nav { display: flex; background: var(--brand-surface); border-top: 1px solid var(--brand-border); }
.mk-nav div { flex: 1; text-align: center; padding: 9px 0 11px; font-size: 9.5px; font-weight: 700;
  color: var(--brand-text-secondary); }
.mk-nav div b { display: block; font-size: 16px; font-weight: 400; margin-bottom: 2px; }
.mk-nav div.on { color: var(--brand-primary); }

.mk-ctl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 12px; }
.mk-seg { display: inline-flex; background: #19202B; border: 1px solid #2A3444; border-radius: 10px; padding: 3px; gap: 3px; }
.mk-seg button { font: inherit; font-size: 11.5px; font-weight: 700; color: #93A4BC; background: none;
  border: 0; border-radius: 7px; padding: 6px 11px; cursor: pointer; }
.mk-seg button[aria-pressed="true"] { background: #2E3A4D; color: #fff; }
.mk-seg span { font-size: 10px; font-weight: 800; letter-spacing: .9px; color: #6C7C94;
  align-self: center; padding: 0 7px 0 9px; }

.mk-schemes { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 7px; margin: 0 0 18px; }
.mk-sw { display: flex; align-items: center; gap: 8px; text-align: left; font: inherit; font-size: 11.5px;
  font-weight: 600; color: #B6C4D8; background: #161C25; border: 1px solid #262F3C; border-radius: 9px;
  padding: 7px 9px; cursor: pointer; }
.mk-sw[aria-pressed="true"] { border-color: #6E8BB5; background: #1E2938; color: #fff; }
.mk-sw i { width: 26px; height: 18px; border-radius: 5px; flex: 0 0 auto; border: 1px solid rgba(255,255,255,.14); }
.mk-sw u { text-decoration: none; font-size: 8.5px; font-weight: 800; letter-spacing: .7px; color: #6C7C94; }

.mk-note { background: #151B24; border: 1px solid #262F3C; border-radius: 14px; padding: 15px 16px; margin-bottom: 13px; }
.mk-note h2 { margin: 0 0 8px; font-size: 14px; color: #fff; letter-spacing: -.01em; }
.mk-note h3 { margin: 13px 0 5px; font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; color: #7E92AE; }
.mk-note p, .mk-note li { font-size: 13px; line-height: 1.65; color: #A9B8CD; margin: 0 0 7px; }
.mk-note ul { margin: 0 0 4px; padding-left: 18px; }
.mk-note b { color: #E6EDF5; }
.mk-note em { color: #C6D3E4; }
.mk-decide { border-color: #7A6320; background: #1E1A0F; }
.mk-decide h2 { color: #F0C64E; }
.mk-decide h2::before { content: "◆ "; }
.mk-read { font-size: 11.5px; font-weight: 700; color: #93A4BC; padding-left: 2px;
  font-variant-numeric: tabular-nums; }
.mk-read b { color: #fff; }
.mk-read i { font-style: normal; color: #F0C64E; }
.mk-read s { text-decoration: none; color: #7E92AE; font-weight: 600; }
.mk-tag { display: inline-block; font-size: 9.5px; font-weight: 800; letter-spacing: .9px; padding: 3px 7px;
  border-radius: 5px; background: #223046; color: #9FC0EA; margin-left: 6px; vertical-align: middle; }


/* ── the "before" screen: today's Nutrition, drawn from its own markup ──── */
.mk-old { padding: 12px 0 0; display: flex; flex-direction: column; gap: 9px; }
.mk-old .oc { background: var(--brand-surface); border: 1px solid var(--brand-border); border-radius: 16px; padding: 13px; }
.mk-old .row { display: flex; align-items: center; gap: 11px; }
.mk-old .ring { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--brand-border); flex: 0 0 auto; }
.mk-old .ring.on { border-color: rgba(34,197,94,.7); background: rgba(34,197,94,.16); }
.mk-old .nm { font-size: 13px; font-weight: 700; color: var(--brand-text); }
.mk-old .it { font-size: 12px; color: var(--brand-text-secondary); line-height: 1.35; }
.mk-old .mc { font-size: 11.5px; font-weight: 600; color: var(--brand-text-secondary); margin-top: 2px; }
.mk-old .mc b { color: var(--brand-text); }
.mk-old .hero { font-size: 34px; font-weight: 800; color: var(--brand-text); line-height: 1; }
.mk-old .bar { height: 7px; border-radius: 99px; background: var(--brand-bg); overflow: hidden; margin: 9px 0 10px; }
.mk-old .bar i { display: block; height: 100%; background: var(--brand-primary); }
.mk-old .chips { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 11px; }
.mk-old .chips span { font-size: 10.5px; font-weight: 700; padding: 4px 10px; border-radius: 99px;
  border: 1px solid var(--brand-border); color: var(--brand-text-secondary); }
.mk-old .chips span.on { background: var(--brand-primary); color: #fff; border-color: transparent; }
.mk-old .pills { display: flex; gap: 8px; }
.mk-old .pills div { flex: 1; background: var(--brand-bg); border-radius: 11px; padding: 8px 9px; }
.mk-old .pills p { margin: 0; font-size: 9px; font-weight: 800; letter-spacing: .8px; color: var(--brand-text-secondary); }
.mk-old .pills b { font-size: 14px; color: var(--brand-text); }
.mk-old .sec { font-size: 10.5px; font-weight: 700; letter-spacing: 1.2px; color: var(--brand-text-secondary); margin: 6px 0 0; }

/* ── nutrition's own additions to the tile system ───────────────────────── */
/* Every one of these is the existing object at a different size. Nothing new
   is invented: .sym-num is a number inside a tile, .sym-mac is .sym-wo without
   the icon column, .sym-chip is .sym-bt at chip weight. */
.sym-num { display: flex; align-items: baseline; gap: 8px; margin: 2px 0 8px; }
.sym-num b { font-size: 34px; font-weight: 800; line-height: 1; color: var(--brand-text);
  font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.sym-num i { font-style: normal; font-size: 12.5px; font-weight: 700; color: var(--brand-text-secondary); }
.sym-num u { text-decoration: none; margin-left: auto; font-size: 12px; font-weight: 800;
  color: var(--brand-text-secondary); font-variant-numeric: tabular-nums; }
.sym-bar { height: 8px; border-radius: 99px; background: var(--in-tile); overflow: hidden; margin-bottom: 11px; }
.sym-bar i { display: block; height: 100%; border-radius: 99px;
  background: linear-gradient(90deg, var(--brand-primary), var(--brand-accent)); }
.sym-macs { display: flex; gap: 8px; }
.sym-mac { position: relative; overflow: hidden; flex: 1; border-radius: 13px; padding: 11px 10px 9px; background: var(--in-tile); }
.sym-mac::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--tile-cap); }
.sym-mac p { margin: 0; font-size: 9px; font-weight: 800; letter-spacing: .85px; color: var(--brand-text-secondary); }
.sym-mac b { display: block; font-size: 15px; font-weight: 800; color: var(--brand-text); line-height: 1.15;
  font-variant-numeric: tabular-nums; margin-top: 1px; }
.sym-mac s { text-decoration: none; font-size: 10.5px; font-weight: 600; color: var(--brand-text-secondary); }
.sym-chips { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 11px; }
.sym-chip { font: inherit; font-size: 11px; font-weight: 800; padding: 6px 11px; border-radius: 99px;
  border: 1px solid var(--tile-ctrl-bd); background: var(--tile-ctrl); color: var(--brand-text-secondary); cursor: pointer; }
.sym-chip[aria-pressed="true"] { background: color-mix(in srgb, var(--brand-primary) 55%, var(--brand-text));
  color: var(--brand-surface); border-color: transparent; }
.sym-split { display: flex; gap: 8px; margin-top: 9px; }
.sym-split > div { position: relative; overflow: hidden; flex: 1; text-align: center;
  border-radius: 13px; padding: 11px 8px 9px; background: var(--in-tile); }
.sym-split > div::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--brand-border); }
.sym-split b { display: block; font-size: 15px; font-weight: 800; color: var(--brand-text); font-variant-numeric: tabular-nums; }
.sym-split p { margin: 1px 0 0; font-size: 9px; font-weight: 800; letter-spacing: .8px; color: var(--brand-text-secondary); }
.sym-split s { text-decoration: none; font-size: 9px; color: var(--brand-text-secondary); }
.sym-more { width: 100%; margin-top: 9px; font: inherit; font-size: 10px; font-weight: 800; letter-spacing: .8px;
  color: var(--brand-text-secondary); background: none; border: 0; padding: 5px 0; cursor: pointer; }
/* the ring that logs a meal — the one control a client uses most */
.sym-ring { width: 27px; height: 27px; border-radius: 50%; flex: 0 0 auto; cursor: pointer;
  border: 2px solid var(--tile-ctrl-bd); background: transparent; display: grid; place-items: center;
  font-size: 12px; line-height: 1; color: transparent; }
.sym-ring.on { border-color: transparent; background: color-mix(in srgb, var(--brand-primary) 55%, var(--brand-text));
  color: var(--brand-surface); }
.sym-tile.is-today .sym-ring { border-color: rgba(255,255,255,.6); }
.sym-food { font-size: 12.5px; line-height: 1.4; color: var(--brand-text-secondary); }
.sym-tile.is-today .sym-food { color: rgba(255,255,255,.88); }
.sym-food em { font-style: normal; font-size: 8.5px; font-weight: 800; letter-spacing: .6px;
  padding: 1px 5px; border-radius: 4px; margin-left: 5px; vertical-align: middle;
  background: color-mix(in srgb, var(--brand-accent) 22%, transparent); color: var(--brand-text); }
.sym-kcal { font-size: 12px; font-weight: 700; color: var(--brand-text-secondary); margin-top: 5px;
  font-variant-numeric: tabular-nums; }
.sym-kcal b { color: var(--brand-text); }
.sym-tile.is-today .sym-kcal, .sym-tile.is-today .sym-kcal b { color: #fff; }
.sym-sec { font-size: 10.5px; font-weight: 800; letter-spacing: 1.15px;
  color: var(--brand-text-secondary); margin: 16px 0 9px; }
/* ── the same objects on the bright tile ────────────────────────────────────
   THE INVERSION IS NOT OPTIONAL AND IT IS EASY TO FORGET. Everything inside a
   tile derives from --in-tile / --brand-text, which are computed from the
   NORMAL tile background; .sym-tile.is-today replaces the background and leaves
   those tokens alone. globals.css already inverts .sym-wo, .sym-badge, .sym-bt
   and .sym-rest for exactly this reason. Every object added here needs the same
   treatment or the day summary — the brightest thing on the screen — renders
   dark text on a dark fill. */
.sym-tile.is-today .sym-num b { color: #fff; }
.sym-tile.is-today .sym-num i, .sym-tile.is-today .sym-num u { color: rgba(255,255,255,.86); }
.sym-tile.is-today .sym-bar { background: rgba(255,255,255,.18); }
.sym-tile.is-today .sym-bar i { background: #fff; }
.sym-tile.is-today .sym-mac,
.sym-tile.is-today .sym-split > div { background: rgba(255,255,255,.16); }
.sym-tile.is-today .sym-mac::before { background: rgba(255,255,255,.75); }
.sym-tile.is-today .sym-split > div::before { background: rgba(255,255,255,.4); }
.sym-tile.is-today .sym-mac b, .sym-tile.is-today .sym-split b { color: #fff; }
.sym-tile.is-today .sym-mac p, .sym-tile.is-today .sym-mac s,
.sym-tile.is-today .sym-split p, .sym-tile.is-today .sym-split s,
.sym-tile.is-today .sym-more { color: rgba(255,255,255,.86); }
.sym-tile.is-today .sym-chip { background: rgba(255,255,255,.18);
  border-color: rgba(255,255,255,.36); color: rgba(255,255,255,.9); }
.sym-tile.is-today .sym-chip[aria-pressed="true"] { background: #fff;
  color: color-mix(in srgb, var(--brand-primary) 82%, #000); border-color: transparent; }
.sym-tile.is-today .sym-food em { background: rgba(255,255,255,.24); color: #fff; }
.sym-grip { font-size: 15px; color: var(--brand-text-secondary); opacity: .7; cursor: grab; padding: 0 2px; }
.sym-tile.is-today .sym-grip { color: rgba(255,255,255,.8); }
"""

# ── the proposed screen ─────────────────────────────────────────────────────
def meal(pos, rung, name, time, kcal, macros, items, *, today=False, logged=False,
         options=None, empty=False, note=None):
    cls = "sym-tile" + (" is-today" if today else "")
    rungattr = "" if today else f' data-rung style="--rung:{rung}%"'
    ring = '<button class="sym-ring on" aria-label="logged">✓</button>' if logged \
        else '<button class="sym-ring" aria-label="log this meal">✓</button>'
    body = []
    if options:
        for letter, oname, oitems, okcal in options:
            body.append(
                '<div class="sym-wo"><div class="sym-wo-row">'
                f'<span class="sym-wo-ic">{letter}</span>'
                f'<span class="sym-wo-name">{oname}</span></div>'
                f'<div class="sym-food">{oitems}</div>'
                '<div class="sym-acts">'
                f'<span class="sym-badge">{okcal}</span><span class="sym-sp"></span>'
                '<button class="sym-bt">Choose</button></div></div>')
    elif empty:
        body.append('<div class="sym-rest">＋ Build this meal<br>'
                    '<span style="font-weight:600">food search · 📷 photo · ⌨ typed</span></div>')
    else:
        # The food list is NOT a .sym-wo-name. That class is clamped to two
        # rows on purpose ("no more than 2 rows of text per card" is about the
        # workout NAME), and a meal lists every item on its own line today.
        body.append('<div class="sym-wo">'
                    f'<div class="sym-food">{items}</div>'
                    f'<div class="sym-kcal"><b>{kcal}</b> cal · {macros}</div></div>')
    if note:
        body.append(f'<div class="sym-food" style="margin-top:8px">{note}</div>')
    acts = ('<div class="sym-acts" style="margin-top:9px">'
            + ring
            + ('<span class="sym-badge">logged</span>' if logged else '')
            + '<span class="sym-sp"></span>'
            '<button class="sym-bt">✎ Edit</button>'
            '<button class="sym-bt ic" aria-label="more">⋯</button>'
            '<span class="sym-grip" title="hold to move">⠿</span></div>')
    return (f'<div class="{cls}"{rungattr}>'
            '<div class="sym-tile-head">'
            f'<span class="sym-tile-lbl"><i>{"◍" if not empty else "◌"}</i>{name}</span>'
            f'<span class="sym-tile-meta">{time}</span></div>'
            '<div class="sym-body">' + "".join(body) + '</div>'
            + acts + '</div>')

NEW_SCREEN = f"""
<div class="sym-page">
  <div style="padding:0 14px 26px">

    <div class="sym-title">
      <button class="sym-bt ic" aria-label="previous day">‹</button>
      <div class="sym-sp" style="text-align:center">
        <h1>Tuesday 9 Sep</h1>
        <p>Plan A · 6 meals</p>
      </div>
      <button class="sym-bt ic" aria-label="next day">›</button>
      <button class="sym-bt ic" aria-label="menu">⋯</button>
    </div>

    <!-- THE DAY. Same tile, filled bright, first on the screen — exactly what
         "today" does on the Workout tab. -->
    <div class="sym-tile is-today">
      <div class="sym-tile-head">
        <span class="sym-tile-lbl"><i>◎</i>TODAY</span>
        <span class="sym-tile-meta">558 cal left</span>
      </div>
      <div class="sym-chips">
        <button class="sym-chip" aria-pressed="true">Today</button>
        <button class="sym-chip">1W</button><button class="sym-chip">2W</button>
        <button class="sym-chip">4W</button><button class="sym-chip">8W</button>
        <button class="sym-chip">Custom</button>
      </div>
      <div class="sym-num"><b>1,842</b><i>cal</i><u>of 2,400</u></div>
      <div class="sym-bar"><i style="width:77%"></i></div>
      <div class="sym-macs">
        <div class="sym-mac"><p>PROTEIN</p><b>146</b><s>of 190 g</s></div>
        <div class="sym-mac"><p>CARBS</p><b>178</b><s>of 240 g</s></div>
        <div class="sym-mac"><p>FAT</p><b>52</b><s>of 70 g</s></div>
      </div>
      <button class="sym-more">MORE NUTRIENTS ⌄</button>
      <div class="sym-split">
        <div><b>86%</b><p>ADHERENCE</p><s>hitting the numbers · this week so far</s></div>
        <div><b>71%</b><p>LOGGING RATE</p><s>5 of 7 days</s></div>
      </div>
    </div>

    <!-- The assistant. Named, never impersonating — ruling 4, already shipped
         in the coach sheet; the tile carries the same wording. -->
    <div class="sym-tile">
      <div class="sym-tile-head">
        <span class="sym-tile-lbl"><i>✦</i>DUSTIN'S ASSISTANT</span>
        <span class="sym-tile-meta">✕</span>
      </div>
      <div class="sym-body"><div class="sym-wo"><div class="sym-wo-row">
        <span class="sym-wo-ic">✦</span>
        <span class="sym-food" style="flex:1">Protein is 44 g short with two meals to go —
          lunch as planned covers most of it. Anything real goes to Dustin.</span>
      </div></div></div>
    </div>

    <p class="sym-sec">MEALS — TAP THE RING TO LOG · ⋯ FOR MORE · HOLD ⠿ TO MOVE</p>

    {meal(1, 0, "M1 · Breakfast", "7:00am", "486", "42P / 48C / 12F",
          "Egg whites — 8 oz<br>Oats — 1 cup cooked<br>Blueberries — 1 cup", logged=True)}
    {meal(2, 5, "M2 · Snack", "10:00am", "244", "26P / 18C / 7F",
          "Greek yoghurt — 1 container<br>Almonds — 1 oz", logged=True)}
    {meal(3, 10, "M3 · Lunch", "12:30pm · NEXT", "612", "58P / 62C / 16F",
          "Chicken breast — 1 medium (6 oz)<br>Jasmine rice — 1 cup cooked<br>"
          "Broccoli<em>FREE</em>", today=True,
          note="1 medium chicken breast = 6 oz — from the food database's piece sizes, not a guess.")}
    {meal(4, 15, "M4 · Snack", "3:30pm", "", "", "", options=[
        ("A", "Protein shake + banana", "Whey — 1 scoop · Banana — 1 medium (118 g)", "268 cal"),
        ("B", "Turkey wrap", "Turkey — 4 oz · Tortilla — 1 medium", "302 cal")])}
    {meal(5, 20, "M5 · Dinner", "6:30pm", "584", "52P / 54C / 18F",
          "Sirloin — 6 oz<br>Sweet potato — 1 large<br>Green beans<em>FREE</em>")}
    {meal(6, 25, "M6 · Snack", "9:00pm", "", "", "", empty=True)}

    <p class="sym-sec">EXTRAS</p>
    <div class="sym-tile" data-rung style="--rung:8%">
      <div class="sym-tile-head">
        <span class="sym-tile-lbl"><i>＋</i>Coffee with cream</span>
        <span class="sym-tile-meta">added 2:10pm</span>
      </div>
      <div class="sym-body"><div class="sym-wo">
        <div class="sym-food">Cream — 2 tbsp</div>
        <div class="sym-kcal"><b>62</b> cal · 1P / 1C / 6F</div>
      </div></div>
      <div class="sym-acts" style="margin-top:9px"><span class="sym-badge">estimated</span>
        <span class="sym-sp"></span><button class="sym-bt">✎ Edit</button>
        <button class="sym-bt ic" aria-label="remove">✕</button></div>
    </div>

    <button class="sym-past"><span>＋</span><span class="sym-sp">Add an extra</span>
      <span class="sym-past-go">OPEN</span></button>
  </div>
</div>
"""

# ── the screen as it is today, for the flip ─────────────────────────────────
OLD_SCREEN = """
<div class="mk-old" style="padding:12px 14px 26px">
  <div style="display:flex;align-items:center;gap:8px">
    <span style="color:var(--brand-text-secondary);font-size:19px">‹</span>
    <div style="flex:1;text-align:center">
      <p style="margin:0;font-size:15px;font-weight:800;color:var(--brand-text)">Tuesday 9 Sep</p>
      <p style="margin:0;font-size:11px;color:var(--brand-text-secondary)">Plan A</p>
    </div>
    <span style="color:var(--brand-text-secondary);font-size:19px">›</span>
    <span style="color:var(--brand-text);font-size:19px">⋯</span>
  </div>

  <div class="oc">
    <div class="chips"><span class="on">Today</span><span>1W</span><span>2W</span><span>4W</span><span>8W</span><span>Custom</span></div>
    <p class="hero">1,842 <span style="font-size:12px;font-weight:600;color:var(--brand-text-secondary)">of 2,400 cal</span></p>
    <div class="bar"><i style="width:77%"></i></div>
    <div class="pills">
      <div><p>PROTEIN</p><b>146</b> <span style="font-size:10px;color:var(--brand-text-secondary)">/190</span></div>
      <div><p>CARBS</p><b>178</b> <span style="font-size:10px;color:var(--brand-text-secondary)">/240</span></div>
      <div><p>FAT</p><b>52</b> <span style="font-size:10px;color:var(--brand-text-secondary)">/70</span></div>
    </div>
    <p style="text-align:center;font-size:10px;font-weight:700;letter-spacing:.6px;color:var(--brand-text-secondary);margin:9px 0 0">MORE NUTRIENTS ⌄</p>
    <div style="display:flex;margin-top:9px">
      <div style="flex:1;text-align:center"><p style="margin:0;font-size:16px;font-weight:800;color:var(--brand-text)">86%</p>
        <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:.8px;color:var(--brand-text-secondary)">ADHERENCE</p></div>
      <div style="flex:1;text-align:center"><p style="margin:0;font-size:16px;font-weight:800;color:var(--brand-text)">71%</p>
        <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:.8px;color:var(--brand-text-secondary)">LOGGING RATE</p></div>
    </div>
  </div>

  <div class="oc" style="border-left:3px solid #22c55e;display:flex;gap:10px;align-items:flex-start">
    <span style="width:26px;height:26px;border-radius:50%;background:var(--brand-bg);display:grid;place-items:center;font-size:13px">✦</span>
    <p class="it" style="flex:1;margin:0">Protein is 44 g short with two meals to go — lunch as planned covers most of it.</p>
    <span style="color:var(--brand-text-secondary);font-size:11px">✕</span>
  </div>

  <p class="sec">MEALS — TAP CIRCLE TO LOG FULL · ⋯ FOR MORE · HOLD ⠿ TO MOVE</p>

  <div class="oc" style="border-color:rgba(34,197,94,.45)"><div class="row">
    <span class="ring on"></span><div style="flex:1">
      <p class="nm">M1 <span style="font-weight:600;color:var(--brand-text-secondary)">Breakfast</span></p>
      <p class="it">Egg whites — 8 oz<br>Oats — 1 cup cooked<br>Blueberries — 1 cup</p>
      <p class="mc"><b>486</b> cal · 42P / 48C / 12F</p></div>
    <span style="color:var(--brand-text-secondary)">⠿</span><span style="color:var(--brand-text-secondary);font-size:17px">⋯</span>
  </div></div>

  <div class="oc" style="border-color:rgba(34,197,94,.45)"><div class="row">
    <span class="ring on"></span><div style="flex:1">
      <p class="nm">M2 <span style="font-weight:600;color:var(--brand-text-secondary)">Snack</span></p>
      <p class="it">Greek yoghurt — 1 container<br>Almonds — 1 oz</p>
      <p class="mc"><b>244</b> cal · 26P / 18C / 7F</p></div>
    <span style="color:var(--brand-text-secondary)">⠿</span><span style="color:var(--brand-text-secondary);font-size:17px">⋯</span>
  </div></div>

  <div class="oc"><div class="row">
    <span class="ring"></span><div style="flex:1">
      <p class="nm">M3 <span style="font-weight:600;color:var(--brand-text-secondary)">Lunch</span>
        <span style="font-size:10px;font-weight:600;color:var(--brand-text-secondary);background:var(--brand-bg);padding:2px 7px;border-radius:6px">12:30pm</span></p>
      <p class="it">Chicken breast — 1 medium (6 oz)<br>Jasmine rice — 1 cup cooked<br>Broccoli</p>
      <p class="mc"><b>612</b> cal · 58P / 62C / 16F</p></div>
    <span style="color:var(--brand-text-secondary)">⠿</span><span style="color:var(--brand-text-secondary);font-size:17px">⋯</span>
  </div></div>

  <div class="oc"><div class="row">
    <span class="ring"></span><div style="flex:1">
      <p class="nm">M4 <span style="font-weight:600;color:var(--brand-text-secondary)">Snack</span></p>
      <p class="it">Protein shake + banana</p>
      <p class="mc"><b>268</b> cal · 30P / 28C / 4F</p>
      <span style="display:inline-flex;gap:6px;margin-top:6px">
        <span style="font-size:11px;font-weight:700;padding:4px 12px;border-radius:8px;border:1px solid var(--brand-primary);color:var(--brand-text)">A</span>
        <span style="font-size:11px;font-weight:700;padding:4px 12px;border-radius:8px;border:1px solid var(--brand-border);color:var(--brand-text-secondary)">B</span>
      </span></div>
    <span style="color:var(--brand-text-secondary)">⠿</span><span style="color:var(--brand-text-secondary);font-size:17px">⋯</span>
  </div></div>

  <div class="oc"><div class="row">
    <span class="ring"></span><div style="flex:1">
      <p class="nm">M5 <span style="font-weight:600;color:var(--brand-text-secondary)">Dinner</span></p>
      <p class="it">Sirloin — 6 oz<br>Sweet potato — 1 large<br>Green beans</p>
      <p class="mc"><b>584</b> cal · 52P / 54C / 18F</p></div>
    <span style="color:var(--brand-text-secondary)">⠿</span><span style="color:var(--brand-text-secondary);font-size:17px">⋯</span>
  </div></div>

  <div class="oc"><div class="row">
    <span class="ring"></span><div style="flex:1">
      <p class="nm">M6 <span style="font-weight:600;color:var(--brand-text-secondary)">Snack</span></p>
      <p class="mc" style="color:var(--brand-primary);font-weight:700">＋ Build this meal
        <span style="font-weight:500;font-size:10px;color:var(--brand-text-secondary)">food DB · 📷 photo · ⌨ typed</span></p></div>
    <span style="color:var(--brand-text-secondary)">⠿</span><span style="color:var(--brand-text-secondary);font-size:17px">⋯</span>
  </div></div>

  <p class="sec">EXTRAS</p>
  <div class="oc"><div class="row">
    <span style="width:32px;height:32px;border-radius:10px;background:var(--brand-bg);display:grid;place-items:center;font-size:14px">＋</span>
    <div style="flex:1"><p class="nm">Coffee with cream</p>
      <p class="mc"><b>62</b> cal · 1P / 1C / 6F</p></div>
    <span style="color:var(--brand-text-secondary);font-size:13px">✕</span>
  </div></div>
</div>
"""

SWATCHES = "".join(
    f'<button class="mk-sw" data-t="{k}" aria-pressed="false">'
    f'<i style="background:linear-gradient(120deg,{SWATCH[k]["primary"]} 0 45%,'
    f'{SWATCH[k]["accent"]} 45% {"72%" if SWATCH[k]["accent2"] else "100%"}'
    + (f',{SWATCH[k]["accent2"]} 72% 100%' if SWATCH[k]["accent2"] else "")
    + f')"></i><span>{label}</span>'
    + ('<u>DARK</u>' if SWATCH[k]["dark"] else '')
    + '</button>'
    for k, label in THEMES)

NOTES = """
<div class="mk-note">
  <h2>What this is</h2>
  <p>The Nutrition screen in the same object the Home and Workout screens are
  built from — one tile, thirty schemes. Nothing about <b>what</b> the screen
  does changes here: every control on it today is still on it, in the same
  place, doing the same thing. This is the wrapper and the shapes only.</p>
  <p>It is drawn with the app's <em>real</em> stylesheet, not a copy — the same
  <code>.sym-*</code> rules and the same thirty palettes the app ships. Flip
  through the schemes and the depth levels: what you see is what renders.</p>

  <h3>What carries over from the Workout tab</h3>
  <ul>
    <li><b>The cap.</b> Every tile gets the gradient strip across its top and no
    side borders. With Depth on it thickens, app-wide, exactly as it does now.</li>
    <li><b>Nesting is the same object, smaller.</b> A meal is a tile; the food
    inside it is that tile at a smaller size.</li>
    <li><b>Today is filled bright and renders first.</b> Here that is the day
    summary — it is the "today" of this screen, so it takes the bright fill and
    the sweeping cap, and it sits at the top where it already is.</li>
    <li><b>Ladder shading</b> — one colour, six shades — runs M1 down to M6.
    Six meals, six shades: it fits this screen better than it fits the week.</li>
    <li><b>Max two rows of text per card</b>, and the meal name is never cut.</li>
  </ul>

  <h3>What it fixes on the way past</h3>
  <ul>
    <li>A meal's <b>food list and its actions stop competing</b> for one row.
    Today the ring, the name, the foods, the macros, the ⠿ handle and the ⋯ are
    all on a single line, which is why the row gets tall and the handle ends up
    next to the text. In the tile the foods sit in the body and the controls sit
    on their own strip underneath.</li>
    <li><b>Meal options A / B become real objects</b> instead of two small
    letters. That is the same shape as two workouts inside one day.</li>
    <li><b>An empty slot reads as empty</b> — the rest-day shape, not a normal
    card with a line of blue text in it.</li>
    <li>Buttons follow the three contrast rules, so they stop disappearing on
    the tinted schemes. Check Carbon Neon and Blush Cloud.</li>
  </ul>

  <h3>Where it goes</h3>
  <p>One screen, one component — so it lands in <b>your Client View and in the
  clients' app together</b>, the way the top bar now does. There is no second
  copy to keep in step.</p>
</div>

<div class="mk-note">
  <h2>Ruled on &mdash; the meals stay in place</h2>
  <p>Dustin, 11 Sep 2026: <em>&ldquo;leave the meals in place. Do not hoist them
  at the top.&rdquo;</em></p>
  <p>On the Workout tab, today is lifted out of date order and drawn first,
  because a week is a list you scan and the one you want is buried in it. A day
  of meals is not that: M1 &rarr; M6 <em>is</em> the order you eat in, and
  hoisting M3 above M1 would break the only thing that makes the list readable
  &mdash; and it would move as the day went on.</p>
  <p>So the next meal due is marked without being moved: the bright fill goes to
  the day summary at the top (the real &ldquo;now&rdquo; of this screen), and M3
  carries a <em>NEXT</em> label in its meta line. This is the one place the
  screen deliberately does not copy the Workout tab.</p>
</div>

<div class="mk-note">
  <h2>Not in this change</h2>
  <p>Deliberately left alone until the Nutrition walk itself, because they are
  behaviour and not format:</p>
  <ul>
    <li><em>"numbers are way off"</em> — the day total against the target. That
    gets checked against the plan and the logged rows first, before anything on
    this screen is touched.</li>
    <li><b>Nutrition %</b> — how adherence calculates. The rule gets captured at
    this screen so both places change together.</li>
    <li>The logging sheets, the food search and the photo path. Same screen,
    separate pass.</li>
  </ul>
</div>
"""

CONTROLS = """
<div class="mk-ctl">
  <div class="mk-seg"><span>VIEW</span>
    <button data-v="new" aria-pressed="true">Proposed</button>
    <button data-v="old" aria-pressed="false">As it is today</button>
  </div>
  <div class="mk-seg"><span>DEPTH</span>
    <button data-d="off" aria-pressed="false">Off</button>
    <button data-d="20" aria-pressed="true">20</button>
    <button data-d="35" aria-pressed="false">35</button>
    <button data-d="50" aria-pressed="false">50</button>
  </div>
</div>
<div class="mk-ctl">
  <div class="mk-seg"><span>LIGHT / DARK</span>
    <button data-m="auto" aria-pressed="true">Auto</button>
    <button data-m="light" aria-pressed="false">Light</button>
    <button data-m="dark" aria-pressed="false">Dark</button>
  </div>
  <div class="mk-seg"><span>BACKGROUND</span>
    <button data-s="was" aria-pressed="false">Original</button>
    <button data-s="first" aria-pressed="false">First fix</button>
    <button data-s="more" aria-pressed="false">More</button>
    <button data-s="strong" aria-pressed="false">Strong</button>
    <button data-s="now" aria-pressed="true">Live now</button>
  </div>
  <span class="mk-read" id="mk-read"></span>
  <span class="mk-read" id="mk-sepnote"></span>
</div>
"""

JS = """
(function () {
  var root = document.documentElement, body = document.body;
  var DARK = %s;
  var PAL = %s;

  function lum(hex) {
    hex = String(hex || '').trim().replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    if (hex.length !== 6) return 1;
    var v = [0, 2, 4].map(function (i) {
      var c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }

  var theme = 'navy', mode = 'auto';

  /* AutoDark, replayed exactly — including the half added 11 Sep 2026.
     Two overrides, each guarded by the same measurement, each applied only to
     a scheme that needs it:
       dark  — wanted dark, scheme is light  -> darken it
       light — wanted light, scheme is dark  -> lighten it
     Asking for what a scheme already is sets NOTHING, because the generic
     block would otherwise overwrite that scheme's own palette. */
  function apply() {
    root.setAttribute('data-theme', theme);
    var schemeIsDark = DARK.indexOf(theme) >= 0 || lum((PAL[theme] || {})['--brand-bg']) < 0.18;
    var wantDark = mode === 'dark' ? true
                 : mode === 'light' ? false
                 : (schemeIsDark || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
    if (wantDark && !schemeIsDark) root.setAttribute('data-appearance', 'dark');
    else if (!wantDark && schemeIsDark) root.setAttribute('data-appearance', 'light');
    else root.removeAttribute('data-appearance');
    [].forEach.call(document.querySelectorAll('.mk-sw'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.t === theme));
    });
    applySep();
  }

  function setTheme(t) {
    theme = t;
    apply();
    try { localStorage.setItem('mk-theme', t); } catch (e) {}
  }

  /* THE NUMBER HE ASKED THE QUESTION ABOUT.
     "the background is the same color as the tiles on a lot of the color
     schemes." Sixteen of the thirty were under 1.18; this prints the live
     ratio for whichever scheme is on screen, measured off the rendered
     pixels rather than off the tokens, so it cannot flatter the fix. */
  function rgb(str) {
    var m = String(str || '').match(/[\d.]+/g);
    if (!m || m.length < 3) return [255, 255, 255];
    return m.slice(0, 3).map(Number);
  }
  function relLum(c) {
    var v = c.map(function (x) {
      x = x / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function measure() {
    var page = document.querySelector('#mk-new .sym-page') || document.querySelector('.sym-page');
    var tile = document.querySelector('#mk-new .sym-tile') || document.querySelector('.sym-tile');
    var out = document.getElementById('mk-read');
    if (!page || !tile || !out) return;
    // getComputedStyle resolves color-mix for us, which is the whole point of
    // measuring here instead of recomputing the mixes in JS.
    var a = relLum(rgb(getComputedStyle(page).backgroundColor));
    var b = relLum(rgb(getComputedStyle(tile).backgroundColor));
    var hi = Math.max(a, b), lo = Math.min(a, b);
    var ratio = (hi + 0.05) / (lo + 0.05);
    var good = ratio >= 1.28;
    out.innerHTML = 'page vs tile <b>' + ratio.toFixed(3) + '</b>' +
      (good ? ' <s>— clears 1.28</s>' : ' <i>— under 1.28, they merge</i>');
  }

  function seg(sel, attr, apply) {
    [].forEach.call(document.querySelectorAll(sel), function (b) {
      b.addEventListener('click', function () {
        [].forEach.call(document.querySelectorAll(sel), function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        apply(b.dataset[attr]);
      });
    });
  }

  [].forEach.call(document.querySelectorAll('.mk-sw'), function (b) {
    b.addEventListener('click', function () { setTheme(b.dataset.t); });
  });
  seg('[data-d]', 'd', function (v) {
    root.setAttribute('data-deep', v);
    try { localStorage.setItem('mk-deep', v); } catch (e) {}
  });
  seg('[data-v]', 'v', function (v) {
    document.getElementById('mk-new').hidden = v !== 'new';
    document.getElementById('mk-old').hidden = v !== 'old';
    measure();
  });
  seg('[data-m]', 'm', function (v) {
    mode = v;
    try { localStorage.setItem('mk-mode', v); } catch (e) {}
    apply();
  });

  /* HOW FAR THE PAGE SITS BEHIND THE TILE — the thing being decided.
     Dustin, 11 Sep, on the live build: *"whenever you switch it to light mode,
     a lot of the color schemes, the actual tiles are too close to the same
     exact color to the background. So it's the background that we need to
     adjust… I need a little bit more contrast so the tiles pop out a little
     bit more."*

     Five stops, each one three numbers: how far the page sinks toward black,
     how much of the scheme's own primary is mixed back in afterwards so it
     does not turn grey, and how much primary tints the tile. Sinking alone
     desaturates — Citrus goes pale-green to grey — which is what --page-tint
     is for.

     The ranges each stop produces across the twenty-three light schemes:
       original  1.130 – 1.209   the merge he reported in the first place
       first fix 1.292 – 1.416   shipped earlier on 11 Sep, still not enough
       more      1.496 – 1.749
       strong    1.657 – 1.973
       live now  1.836 – 2.230   APPROVED and shipped — "use strongest"

     The other four stay so the decision can be walked back or nudged without
     rebuilding the sheet.

     LIGHT SCHEMES ONLY. A dark page is a different problem — its page is
     already near black, so sinking moves nothing and the TILE lifts instead —
     and he said the dark side reads right. On a dark scheme these stops stand
     down and the dark block's own numbers apply. */
  var SEP = {
    was:    ['6%%',  '0%%', '4%%'],
    first:  ['12%%', '0%%', '4%%'],
    more:   ['16%%', '4%%', '0%%'],
    strong: ['20%%', '6%%', '0%%'],
    now:    ['24%%', '8%%', '0%%']
  };
  var sep = 'now';

  function applySep() {
    var v = SEP[sep] || SEP.now;
    var showingDark = root.getAttribute('data-appearance') === 'dark' ||
      (DARK.indexOf(theme) >= 0 && root.getAttribute('data-appearance') !== 'light');
    [].forEach.call(document.querySelectorAll('.sym-page'), function (el) {
      if (showingDark) {
        el.style.removeProperty('--sink');
        el.style.removeProperty('--page-tint');
        el.style.removeProperty('--tile-deep');
      } else {
        el.style.setProperty('--sink', v[0]);
        el.style.setProperty('--page-tint', v[1]);
        el.style.setProperty('--tile-deep', v[2]);
      }
    });
    var note = document.getElementById('mk-sepnote');
    if (note) note.textContent = showingDark ? 'dark — the tile lifts instead' : '';
    measure();
  }

  seg('[data-s]', 's', function (v) {
    sep = v;
    try { localStorage.setItem('mk-sep', v); } catch (e) {}
    applySep();
  });

  var t0 = 'navy', d0 = '20', m0 = 'auto', s0 = 'now';
  try {
    t0 = localStorage.getItem('mk-theme') || t0;
    d0 = localStorage.getItem('mk-deep') || d0;
    m0 = localStorage.getItem('mk-mode') || m0;
    s0 = localStorage.getItem('mk-sep') || s0;
  } catch (e) {}
  if (!SEP[s0]) s0 = 'now';
  sep = s0;
  [].forEach.call(document.querySelectorAll('[data-s]'), function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.s === s0));
  });
  if (!PAL[t0]) t0 = 'navy';
  mode = m0;
  root.setAttribute('data-deep', d0);
  [].forEach.call(document.querySelectorAll('[data-d]'), function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.d === d0));
  });
  [].forEach.call(document.querySelectorAll('[data-m]'), function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.m === m0));
  });
  setTheme(t0);
  body.classList.add('mk');
})();
""" % (json.dumps(NATIVE_DARK), json.dumps({k: {"--brand-bg": PAL[k].get("--brand-bg", "#fff")} for k, _ in THEMES}))

TITLE = "Nutrition in the Tile Format"

BODY = f"""
<style>
{CSS}
{MK_CSS}
</style>

<div class="mk-wrap">
  <h1>Nutrition, in the app's format<span class="mk-tag">MOCK-UP · NOTHING SHIPPED</span></h1>
  <p class="mk-lede">The same object the Home and Workout screens use, applied to
  the Nutrition screen — <b>your Client View and the clients' app together</b>.
  Every control that is on the screen today is still here. Pick any of the
  thirty schemes and any depth level; this page uses the app's real stylesheet,
  so nothing here can look better than it will.</p>

  {CONTROLS}
  <div class="mk-schemes">{SWATCHES}</div>

  <div class="mk-cols">
    <div class="mk-stage">
      <div class="mk-phone">
        <div class="mk-top">
          <span class="mk-mark">S</span>
          <span class="mk-nm">Symmetry<span>· My Training</span></span>
          <span class="mk-ic">🔔</span><span class="mk-ic">✎</span>
        </div>
        <div class="mk-scr">
          <div id="mk-new">{NEW_SCREEN}</div>
          <div id="mk-old" hidden>{OLD_SCREEN}</div>
        </div>
        <div class="mk-nav">
          <div><b>⌂</b>Home</div><div><b>▤</b>Workouts</div>
          <div class="on"><b>◍</b>Nutrition</div><div><b>◔</b>Progress</div><div><b>☰</b>More</div>
        </div>
      </div>
    </div>
    <div>{NOTES}</div>
  </div>
</div>

<script>{JS}</script>
"""

SCRATCH = os.environ.get("SCRATCH", "/tmp")
os.makedirs(os.path.join(ROOT, "docs/mockups"), exist_ok=True)

standalone = ('<!DOCTYPE html>\n<html lang="en" data-theme="navy" data-deep="20">\n<head>\n'
              '<meta charset="utf-8">\n'
              '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
              f'<title>Symmetry — {TITLE} (mock-up)</title>\n</head>\n<body class="mk">\n'
              + BODY + '\n</body>\n</html>\n')
open(os.path.join(ROOT, "docs/mockups/nutrition-format.html"), "w", encoding="utf-8").write(standalone)

art = f'<title>{TITLE}</title>\n' + BODY
open(os.path.join(SCRATCH, "nutrition-artifact.html"), "w", encoding="utf-8").write(art)

print("standalone", len(standalone), "artifact", len(art), "themes", len(THEMES))
