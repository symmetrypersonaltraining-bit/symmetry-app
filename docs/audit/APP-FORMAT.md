# The app's format — one shape, thirty colour schemes

**This is the durable record.** It was agreed 4 Sep 2026 and is meant to survive
every session of the audit, because it governs every screen and most of them
have not been walked yet. It was previously written down inside the screen-2
section of `SCREEN-WALKTHROUGH.md`, where a new session would not find it.
Dustin, 5 Sep: *"that was supposed to be recorded to survive all sessions on
this audit."*

---

## 1. WHY

Dustin, 4 Sep, looking at the home screen:

> "study the home screen. look at weekly focus... im thinking maybe we get the
> layout locked in and match it on every page so it flows better."

So there is **one object**, and every screen is built from it. Not a family of
similar cards — the same object at different sizes.

---

## 2. THE OBJECT

Taken from the **Weekly Focus card on the client home screen**:

- background `--brand-surface`
- 1px `--brand-border`
- radius 18, padding 14
- soft shadow
- a bold 14px label, icon on the left, small meta on the right
- a **gradient bar across the top** (`--card-topbar`)

That top bar was never bespoke. Weekly Focus carries an inline
`background: var(--brand-surface)`, which is exactly what the `[data-deep]`
blanket selector matches — so the depth setting was already painting
`--card-topbar` across its top before anyone designed it in.

### The rules that come with it

- **No side borders anywhere.** A tile is capped; the things inside it are
  capped. The cap is the only edge that carries colour.
- **Nesting is the same object, smaller.** A day is a tile; a workout inside it
  is that tile at a smaller size. Not a different component.
- **Today (or "now", or "current") is the same tile filled bright** with the
  scheme gradient, and it renders FIRST — not in date order. Its cap sweeps. It
  is the only thing on the screen that moves.
- **Ladder shading**: one colour, six shades deepening down a list. Not six
  colours.
- **Raised**: the page sinks darker and the tile deepens toward the primary at
  the same time. Shadow alone between two surfaces half a step apart reads as a
  smudge — that was the first attempt and it was rejected.
- **Max two rows of text per card.** The name gets both and is never truncated.
- **Colour means the position** (which day, which item), never the type. Type is
  carried by the icon alone.

---

## 3. THE THREE CONTRAST RULES

Each came from a real failure on a real scheme. They are not preferences.

1. **A button fill is a fixed step off the surface it sits on** — never the same
   token. Taking the fill from `--brand-surface` made buttons invisible on
   tinted days.
2. **A filled button pushes toward the scheme's own text colour and labels
   itself with the surface colour.** White-on-hue measured about 2:1 on Carbon
   Neon, which is unreadable.
3. **No text ever sits on a saturated hue.** Colour lives in caps, edges, and
   the field behind the cards.

And: **the today-gradient is a tonal ramp of the primary alone.** Mixing primary
into accent lands on mud wherever the accent is complementary — Ocean Dusk is
the case that proved it.

---

## 4. THE COLOUR SYSTEM

### Thirty schemes

Set by `data-theme` on `<html>` from `ThemeProvider`. The full list, and it is
all thirty — mockups must show **every** one, not a hand-picked subset. Dustin,
4 Sep: *"that's not even close to all of my color schemes you're missing a ton
of them we have a lot."*

> Soft Pastel · Navy Blue · Charcoal · Forest Green · Gunmetal · Deep Purple ·
> Burnt Orange · Rose · Blush · Lagoon · Orchid · Berry · Slate Pop ·
> Plum Dusk · Carbon Neon · Midnight · Sunset Coral · Aurora · Citrus Punch ·
> Berry Noir · Ocean Dusk · Midnight Aurora · Midnight Ember · Midnight Citrus ·
> Midnight Orchid · Violet Dawn · Sunset Drift · Deep Reef · Blush Cloud ·
> Hot Pink

### Nine tokens, and nothing hard-coded

`--brand-bg` · `--brand-surface` · `--brand-card` · `--brand-primary` ·
`--brand-accent` · `--brand-text` · `--brand-text-secondary` · `--brand-border` ·
`--brand-sidebar`

A screen that names a colour instead of a token is broken on 29 schemes.

### Auto-dark

`AutoDark` measures `--brand-bg` luminance and stamps
`data-appearance="dark"` on genuinely light themes only. A dark scheme derives
its surface FROM its primary — which is why mixing the primary back into the
surface to make a ladder does nothing on dark schemes, and why the ladder uses a
pre-lifted `--tile-ladder` ink instead. That mistake was made twice.

### Depth & glow

`data-deep` = `off` / `20` / `35` / `50`, set in Settings. The blanket selector
matches any element whose inline background is `var(--brand-surface)`, which is
what makes the top cap appear app-wide without every component opting in.
**It applies everywhere, not per screen** — Dustin, 4 Sep: *"make sure that
applies to this page and app wide like it does on home screen."*

---

## 5. HOW IT ROLLS OUT

- Scoped to a **`.sym-page` wrapper**, so a screen opts in only when it is
  walked. This is what keeps audit rule 6 ("never edit a screen that has not
  been walked") true while a global style system is being introduced.
- **Each screen gets a mockup Dustin approves before it changes.** Every time.
  He rejected three layouts before approving the current one.
- **Mockups show all thirty schemes.**
- **A screen adopts the format during its own walk**, not before and not in a
  sweep.

---

## 6. LANGUAGE THAT TRAVELS WITH THE FORMAT

- **No "programme" language anywhere client-facing.** Dustin, 4 Sep: most
  clients are not on a programme — each is programmed personally, day by day, in
  6-week blocks, from the library. Applies to every screen.
- **Past items never say "missed."**
- **NASM language never appears client-facing** (standing rule).

---

## 7. STATE

| | |
|---|---|
| Built and live | The tile system (`.sym-*`, ~50 rules in `globals.css`), scoped to `.sym-page` |
| Adopted | Screen 2, Workout tab (4 Sep) |
| Partly adopted | Screen 1, Home — Weekly Focus is the source object, rest of the screen predates it |
| Not yet | Every other screen — they adopt as they are walked |

### Carried, agreed, NOT built

- **A light/dark toggle per colour scheme.** Requested 4 Sep. Today `AutoDark`
  decides and a person cannot. Wants to be a setting — Auto / Light / Dark —
  persisted the way the theme is. Its own commit.
