-- Back up measure_video_durations() before removing its apply loop.
--
-- Run BEFORE 20260816_video_job_stops_publishing_unreviewed.sql. Stores the
-- live definition verbatim, so restoring is `select def from` this table and
-- running it — no hunting through migration history for which version was
-- actually deployed, which is the thing that makes a rollback take an hour
-- instead of a minute.
--
-- Idempotent: `create table if not exists`, and the insert reads whatever is
-- currently defined. Running it twice keeps both snapshots, ordered by
-- saved_at, which is the useful behaviour rather than an error.

create table if not exists public.bak_measure_video_durations_20260816 (
  saved_at timestamptz not null default now(),
  proname  text not null,
  def      text not null
);

insert into public.bak_measure_video_durations_20260816 (proname, def)
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'measure_video_durations';
