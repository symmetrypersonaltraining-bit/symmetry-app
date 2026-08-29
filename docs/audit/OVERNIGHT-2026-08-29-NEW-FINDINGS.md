# Fresh audit pass — 29 Aug, after the overnight fixes

Dustin: *"after youre done, run another audit and add anything ti the list you
find."* This is that pass. It also corrects two things the original audit got
wrong, and records two mistakes of my own that would have become findings if I
had reported the first number I got.

**Baseline after the night's work:** static audit **clean** · unit suite
**2,512 pass, 0 fail** · every fix shipped to `main`.

---

## NEW — worth doing

### N1. Tina Haley still has a live meal plan, three weeks after being archived

She was archived **13 Aug**. Her meal plan is still `status = 'live'`. Nothing
clears a plan when a client leaves, so an archived client keeps a live plan
indefinitely — it stays in plan lists, print routes and any query that reasons
about "current plans".

Low harm today, one client. But archiving is exactly the moment things should
stop, and nothing in the archive path touches nutrition.

**Fix:** archive the plan when the client is archived, and exclude
archived clients from live-plan reads. Small.

### N2. Steph has two macro targets on the same effective date

**Steph Gautreaux, 2026-06-02, two rows.** Every read of `macro_targets` is
correctly written — `.lte(effective_date, today).order(effective_date desc)
.limit(1)` — and I checked **all twelve call sites**, which is the good news.
But with two rows sharing a date the tie is broken by whatever Postgres returns
first, so "current macros" for her is not deterministic.

**Fix:** either a unique constraint on `(client_id, effective_date)`, or add
`created_at desc` as the tiebreak everywhere. The constraint is better — it
makes the ambiguity impossible rather than agreeing on how to guess.

### N3. Your own body fat reads 5.2%

Now visible because of tonight's #39 fix. Against **11.5%** in June, and
**18%** in May. A drop to 5.2% in three weeks is not a measurement. It is
almost certainly a mis-entry — perhaps a skinfold site value typed into the
body-fat field.

**Not corrected.** It is your data. But the tile now shows it, so you will see
it.

---

## CORRECTIONS to the original audit

### C1. "286 sets are on record as done with nothing behind them" — mostly not a fault

The count is real (290 now), but it conflates two different things, and the
larger half is **correct behaviour**:

| prescribed volume type | rows | verdict |
|---|---|---|
| **duration** | **198** | ✅ correct — foam rolling, breathing drills, stretches, treadmill walks |
| **reps** | **81** | ⚠️ suspicious |
| distance | 8 | probably fine |
| none | 3 | — |

The top exercises are *Side-Lying Ribcage Breathing Expansion over Foam Roller*,
*Treadmill Walk*, *Kneeling Hip Flexor Stretch*, *Foam Roll TFL*. **That is your
corrective work, which is quality- and time-based by design** — a client ticking
"done" on a 30-second foam roll with nothing typed is the system working.

So the real suspicious population is **~81 rows on reps prescriptions**, not
286. The zero-storable fix (#6) is still right and unchanged; the damage figure
in the audit was overstated.

### C2. The leaderboard opt-in figure was reading the wrong column

Covered in the review list: the audit measured `leaderboard_opt_in` (7 true);
the board uses `exclude_from_rankings` (2 opted out) and ranking everyone is a
deliberate decision the code documents. Only the names needed fixing.

---

## ⚠️ TWO PROBES OF MINE THAT WERE WRONG, AND WHAT THEY ALMOST BECAME

Recorded because the whole point of this exercise is not trusting a number
because it is alarming.

### P1. "19 meal plans miss their protein target" — a JOIN fan-out

My probe joined `meal_plans → meals → meal_items → macro_targets` and summed
protein. **You have 14 macro-target rows**, so every meal item was counted
fourteen times. It reported your plan at **3,738 g of protein against a 300 g
target**.

The real figure, computed without the fan-out: **256 g against 300 g** — 15%
under, which is worth a look but is not a scandal. Steph, Jerry, Claudine and
the rest were the same artifact.

**The only confirmed plan-vs-target miss remains Brooke's 198 g vs 160 g**,
which stands because it was measured a second way and because she reported it
herself.

### P2. "The cascade is broken" — a CTE snapshot

While verifying the cancel fix, one statement reported 4 orphaned sets and 2
scratch rows left behind. CTEs in a single statement read the same snapshot and
cannot see each other's writes. Re-queried separately: **0 and 0.**

Both of these produced a confident, specific, alarming number from a query that
was measuring something other than what I thought. That is the same shape as
2,500 green tests, and it is why every figure in the review list was re-run a
second way before it was written down.

---

## Verified clean in this pass

- No workout is completed for a future date (**0**) — #7's guard holds
- No `macro_targets` row has a null or zero calorie figure (**0**)
- All twelve `macro_targets` call sites order correctly before taking one row
- Every nudge check still green: **0 rows since the freeze**, sent still **20**
- Static audit clean, and proved able to fail (probe file flagged, exit 1)

## Still unproven, honestly

**#6 has not been observed working in production.** The rule is proved at unit
level — `"0"` stores as `0`, blank stays null — but no client has logged a set
since it deployed, so there is no live row to point at yet. Worth checking after
the next session.

**The open redirect returning 404** needs one click against production once
Vercel has redeployed.
