# The last 51 exercise videos — what is actually there

**Measured 15 Aug against the live `exercise_video_candidates` table.**

## The handoff was wrong about this, and the error matters

`docs/HANDOFF-2026-08-14.md` and `docs/BACKLOG.md` both say:

> 45 of them sit at **61 seconds** against the 60-second ceiling.

That is not what the data says, and it points at the wrong decision. If 45 clips
really were sitting one second over the line, the obvious move would be to nudge
the ceiling to 65 and be done — and it would clear almost nothing.

## What is actually there

| shortest candidate | exercises | cumulative if the ceiling moved here |
|---|---|---|
| **no usable candidate at all** | **6** | — |
| ≤ 60s (already allowed) | 0 | 0 |
| 61–90s | 16 | 16 |
| 91–120s | 8 | 24 |
| 121–180s | 15 | 39 |
| over 180s | 6 | 45 |
| **total** | **51** | |

Only **seven** are within touching distance of the current 60-second ceiling:

```
Jumping Pull Up            61s      Roll Adductors with Ball     61s
Superman to W's            61s      Partner Nordic Curl          63s
Neutral Grip Pull Up       64s      Alternating Depth Plyo Pushup 66s
Crunch                     67s
```

At the other end, the best clip found for **Barbell Low Bar Back Squat is 1,098
seconds** — eighteen minutes. That is a tutorial, not a demonstration, and no
ceiling short enough to be useful will ever admit it.

## What this means for the decision

**Raising the ceiling is not the fix, and the exact number barely matters.**

- 90s clears 16 — but a 90-second clip is not a demo, it is a lesson, and the
  whole point of the ceiling was a client mid-set glancing at their phone.
- 180s would clear 39 and would make the library worse.

**The honest options:**

1. **Search for genuinely shorter clips** for the 45 that have one. This is the
   work the ceiling was protecting you from doing.
2. **Film them yourself.** Forty-five movements, one phone, one afternoon at
   Sevens. They would be correct, they would be short, and they would be yours —
   which was always the stated end state for this library.
3. **Accept 788 of 839 (93.9%)** and leave the tail. Every one of these is a
   less-common movement, which is exactly why nobody has filmed a ten-second
   version.

Option 2 is the one I would push for. The remaining movements are the awkward
ones, they are all things Dustin can demonstrate in fifteen seconds, and every
clip filmed is one that never needs sourcing again.

## Six with nothing at all

Four have never had a candidate found:

```
Lateral Bound to Toe Touch
Lunge to Balance Sagittal Plane
Medicine Ball Slam with Squat
Sandbag Step up
```

Two have a candidate whose link is dead:

```
Static Erector Spinae Stretch
TRX Chest Fly with Split Stance
```

## Three of the 51 are not worth sourcing at all

- **`Dumbbell Squat Clean`** — Olympic/power lifts are on the never-program
  list, so any video found for it is work that can only ever be wasted.
- **`Single Leg Romanian Deadlift — 3×10 ea`** and
  **`Kettlebell Turkish Get-Up (Lunge style`** — both are fragments of a pasted
  programme script that got parsed as exercise names. The 14 Aug handoff lists
  seven such rows; these two are still in the "missing a video" count and are
  inflating it. **Nothing has been deleted — that needs Dustin's say-so.**

So the real target is **45**, not 51, and six of those need sourcing from
scratch rather than a shorter alternative.

## Why this was not just done overnight

The pipeline writes candidates to the database and the duration check runs on
Vercel (a Cowork sandbox has no route to youtube.com — same class of thing as
the git-push 403; do not re-diagnose it). On the night of 14/15 Aug the database
instance had exhausted its CPU credits and was timing out roughly half of all
queries, which is the worst possible condition for a job that is mostly writes.

Everything above it on the night's list was finished. This was left, deliberately
and with the numbers corrected, rather than half-done against a database that
could not take it.

---

# ADDENDUM, 16 Aug — the ceiling is 30 seconds, not 60

**Everything above is measured against a 60-second ceiling. The automation does
not use 60.**

Two places define the same rule and they disagree:

| Where | Ceiling |
|---|---|
| `src/app/api/video-candidates/verify/route.ts` | `MAX_SECONDS = 60` |
| `public.measure_video_durations()` in the database | **30** |

The database function marks anything over **30** seconds `too_long`
(`status = case when v_secs <= 30 then 'pending' else 'too_long' end`) and only
auto-applies candidates at `duration_sec <= 30`. So a 45-second clip is
acceptable to the route and rejected by the job that actually runs.

Found by watching it happen. Ten candidates were seeded on 16 Aug for the five
exercises that had no candidate at all; the job measured them within minutes and
auto-approved four. Three were marked `too_long` at **48s, 49s and 53s** — all
comfortably inside the documented ceiling.

## What it is worth in practice

Measured against the live table, for exercises with no video and at least one
measured candidate (46 of them):

| shortest candidate | exercises |
|---|---|
| ≤ 30s (auto-approves today) | 0 |
| **31–60s (rejected today, would pass at 60)** | **1** |
| 61–90s | 16 |
| over 90s | 29 |

So aligning the database to 60 gains roughly **one or two exercises**, not
sixteen. The argument in the body of this document still holds: the fix is
finding shorter clips, not moving the line.

**The disagreement is the bug, regardless of the number.** Two sources of truth
for one rule means the analysis above was written against a ceiling the system
does not enforce — and anyone reasoning about "the 60-second rule" has been
reasoning about the wrong thing.

**Needs Dustin: 30 or 60?** 30 is a demonstration; 60 is what the code says and
what the reasoning in `verify/route.ts` argues for. Whichever he picks, it should
live in ONE place and the other should read it.
