# Jennifer could not log a workout — 3 Sep 2026

**Resolved by a reload. The underlying bug is NOT fixed.**

    insert or update on table "set_logs" violates foreign key constraint
    "set_logs_prescribed_exercise_id_fkey"

## What happened

| time (UTC) | |
|---|---|
| 13:09:56 | She opens the workout. Her phone caches the prescribed-exercise ids as they are then, and a `workout_log` is created against day `a4ceefe1`. |
| 13:13:01 | **Every prescribed exercise on `a4ceefe1` is deleted and recreated with new ids.** |
| 13:13:31 | A second day appears — `7f92f56c`, "JD6 Thu — Squat & Press (3 Sep, original)", 8 exercises. Her screen reads 3/8. |
| 13:13 | Every set she ticks writes a `prescribed_exercise_id` that was destroyed seconds earlier. |

Nothing was missing and nothing was corrupt. Every exercise existed; the day was
intact. **Her phone was four minutes out of date and had no way to know.**

Confirmed by `min(created_at)` on both days' prescribed exercises: `13:13:01`
and `13:13:31`, both AFTER her `workout_log` at `13:09:56`.

Not a cron — no job runs at that minute. Nothing in `programme_audit` for three
hours either, so whatever rewrote them is not covered by that trigger, which is
its own gap worth closing.

## The actual bug

That rewrite is the fork mechanism doing its job — it is what stops one client's
edit reaching everyone else's copy. It works.

**What it does not do is tell an open logger that the ground moved.** The logger
caches prescribed-exercise ids in a localStorage draft and writes them blind, so
anything that rebuilds the day mid-session orphans that session silently: every
set from then on fails, and the client sees a foreign-key error they can do
nothing about.

Same shape as the 6 Aug incident already documented in `WorkoutLogger.tsx` — a
dead id surfacing as an FK violation — and the rule that came out of that one
applies here too: **a failed read is not a deletion.**

## The fix, not yet applied

In `WorkoutLogger.tsx`: when a set write fails because the prescribed exercise
is gone, re-read the day and retry against the current ids rather than throwing
the raw Postgres error at the client.

Held back deliberately. That file is on the off-limits list, it is 3,755 lines,
and it already carries two data-loss incidents. Before touching it we need to
know which path rewrote the day — a client tapping **swap** mid-session, or the
trainer editing the programme while she trained. The second is far more serious,
because it means any client training while Dustin re-programmes them is locked
out of their own session.

## CONFIRMED CAUSE — Dustin, 3 Sep

> "I was reprogramming mid session. I replaced the workout I was actually
> logging through claude project. once i had it revert today's workout it was
> good."

It was the serious version. Not a client tapping swap — **the trainer replacing
the day a client was actively logging, from a Claude project session writing
straight to the database.**

That also explains the empty audit trail. There is **no audit trigger on `days`,
`sections` or `prescribed_exercises`** — only the cross-client-edit guards
(`trg_pe_block_cross_client_edit`, `trg_section_block_cross_client_edit`) and
the owner/isolation stamps on `scheduled_workouts`. `programme_audit` exists and
nothing writes to it for programme content, so a rewrite from a Claude session
leaves no trace at all. Nobody could have reconstructed this from the audit; it
had to be reconstructed from `created_at` timestamps.

### What this means beyond one client

Any client training while their programme is being rewritten is locked out of
their own session, and the only recovery is a reload they have no way to know
about. It is not rare by nature — reprogramming mid-day is normal here — it has
just been invisible, because the client sees a Postgres error and gives up
rather than reporting it.
