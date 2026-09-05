# The body-fat screen — verified correct, and two real faults (5 Sep 2026)

Claudine's 5 Sep caliper reading came out at 28% and Dustin said that was not
right. It turned out the arithmetic was never the problem.

## The formula is correct

`src/app/(app)/log-bodyfat/page.tsx`, 4-site path, checked against the values
the app itself stored:

- Durnin & Womersley female 30–39: C = 1.1423, M = 0.0632 — correct
- `Math.log(sum) / Math.LN10` — a correct log10
- Siri, `495 / D − 450` — correct
- All ten D&W coefficient rows, both sexes, match the 1974 table
- The 7-site path is Jackson–Pollock 7 and its coefficients are correct too

Her stored density for a 49 mm sum was 1.0355; recomputing by hand gives
1.035480. It is right to four decimals. **No change was made to the formula.**

## What was actually wrong: two typos, a month apart

`skinfold_logs` keeps the raw sites, which is what made this findable.

| site | 4 Aug as entered | 5 Sep as entered | corrected |
|---|---|---|---|
| Biceps | 6 | 8 | — |
| Triceps | 11 | **14** | 5 Sep → **13** |
| Subscapular | **4** | 12 | 4 Aug → **14** |
| Suprailiac | 15 | 15 | — |

- **5 Sep**: triceps entered 14, actually 13. Sum 49 → 48. **28.0% → 27.8%.**
- **4 Aug**: subscapular entered 4, actually 14. Sum 36 → 46. **24.2% → 27.2%.**

The August one is the one that mattered. A 4 mm subscapular on a woman reading
24% is not a real number — that is elite-lean-male territory — and it made the
month look like a 3.8-point jump on flat weight (116.7 → 116.4 lb). Corrected,
Aug → Sep is **+0.6 points**, which is measurement noise.

Both rows corrected in `skinfold_logs` and `metrics`; originals in
`bak_claudine_bodyfat_20260905` as full JSON, reversible.

## Fault 1 — age and sex default, and are not read from the client

```ts
const [age, setAge] = useState("38");
const [sex, setSex] = useState("male");
```

Free-text, every time, never loaded from the client record. Nothing warns.

Had sex been left on its default for Claudine, the same folds would have read
**21.1%** instead of 27.8 — a 6.7-point error with nothing on screen to suggest
anything was wrong. Age is the same shape: 38 is nobody in particular.

**Fix:** read `date_of_birth` and sex from `clients`, show them as fact rather
than as inputs, and let them be overridden deliberately rather than by default.
Clients has no sex column today, so that is the first step.

## Fault 2 — `metrics` does not record which method produced a reading

`metrics` has `source` ('caliper', 'client', 'migration', 'trainer_backfill')
but no method. Only `skinfold_logs` knows whether a number came from 4-site D&W
or 7-site Jackson–Pollock.

Those two are different rulers — D&W reads several points higher than JP7 on
lean, trained people — and today they land on the same trend line and get
compared as if they were the same measurement. That is a future version of
exactly this week's confusion, and it will be harder to spot because there will
be no typo to find.

**Fix:** carry the method onto `metrics`, and show it on the trend so a change
of ruler is visible rather than reading as a change in the person.

## Fault 3 — nothing sanity-checks a fold

A 4 mm subscapular passed straight through. The screen accepts whatever a thumb
produces.

**Fix:** flag a site that moves more than about 5 mm from that client's last
reading, or falls outside a plausible range for the site. Not a block — a
"that's a big jump from last time, sure?" at the caliper, which is a month
earlier than anyone would otherwise notice.
