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
