-- TWO THINGS THAT WERE COSTING AND EARNING NOTHING.
--
-- Dustin, 13 Sep 2026, after asking what the rollup and the video jobs were
-- actually for: *"turn off the duration job n drop daily_logs"*.
--
-- ── 1. video-duration-measure ────────────────────────────────────────────────
--
-- pg_cron jobid 34, `*/10 * * * *` — 144 firings a day, and every one of them
-- today returned "0 rows". Its own guard says why:
--
--   select public.measure_video_durations(6)
--   where exists (select 1 from public.exercise_video_candidates
--                 where status = 'pending' ...)
--
-- The pending queue has not moved since 13 Aug. It was measuring an empty queue
-- every ten minutes and had been for a month.
--
-- check-exercise-videos (jobid 29, `15 6,18 * * *`) STAYS. That one is a
-- YouTube oEmbed ping — no API key, no quota, no cost — and it is what catches
-- a demo that has gone dead on a client mid-workout. 817 of 858 exercises carry
-- a video; one is already flagged dead. Different job, opposite verdict.
--
-- ── 2. daily_logs ────────────────────────────────────────────────────────────
--
-- A free-text daily check-in, one row per client per date. 321 rows, TWO
-- clients, 2024-08-28 → 2026-08-02, last written by hand on 2 Aug. Nothing on
-- any schedule writes it. The only thing left reading it was the trainer
-- agent's read-only allow-list in src/lib/ai/agent-tools.ts — where a dead
-- table name is worse than absent, because the model can spend a tool call
-- discovering it is empty.
--
-- Backed up to bak_daily_logs_20260913 first: 321 rows, counted against the
-- 321 in the original before the drop. RLS is enabled on the backup with no
-- policy, so it is unreachable through PostgREST.
--
-- jarvis.daily_logs is a pass-through view — the jarvis schema mirrors every
-- public table one-for-one — so the mirror goes with the table. Nothing else
-- depended on it: no foreign key pointed at it and no other view read it.

select cron.unschedule('video-duration-measure');

alter table public.bak_daily_logs_20260913 enable row level security;

drop view jarvis.daily_logs;

drop table public.daily_logs;
