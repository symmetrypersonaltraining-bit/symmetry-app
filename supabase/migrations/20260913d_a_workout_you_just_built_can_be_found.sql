-- A WORKOUT YOU JUST BUILT CAN BE FOUND.
--
-- Dustin, 13 Sep 2026: *"when ai writes a workout we tell it, app shoukd build
-- that workout in the clients personal workout library to be used again from
-- any path that searches workouts to log."*
--
-- Chasing that turned up something bigger than the AI paths.
--
-- ── days.exercise_count HAS BEEN A LIE SINCE AT LEAST 1 SEP ──────────────────
--
-- It is a plain integer column, default 0, and NOTHING maintains it. Not a
-- trigger, not a generated expression, and — checked by grep across src/ —
-- not one line of application code. Every non-zero value in there is the
-- residue of a one-off backfill.
--
-- So every day created since then reads 0 no matter what is in it:
--
--   "Daily Mobility & Rehab — Ankle, Foot & Hip (Home)"   16 exercises, count 0
--   "Foundations — Supervised Intro (Knee & Ankle …)"     13 exercises, count 0
--   "Full Body — Level 1 Day A …"                         11 exercises, count 0
--   "— Thu Full Body Circuit B (Solo, Sevens)"            13 exercises, count 0
--
-- Two things read it, and both are wrong in a way nobody would connect back to
-- a stale column:
--
--   /api/library-search filters `.gt("exercise_count", 0)`, so NOTHING built in
--   the last two weeks can be found by searching — AI-written, trainer-written,
--   swapped, all of it. That is the exact failure he reported, and it was never
--   about the AI paths.
--
--   AddWorkoutButton prints "0 exercises" under every recent workout, which
--   reads as an empty workout rather than a stale number.
--
-- The library PAGE looked fine throughout, because it counts properly via the
-- library_day_exercise_counts RPC. That is why this survived: the one screen
-- somebody would check was the one screen not using the column.
--
-- ── MAKE THE COLUMN TRUE RATHER THAN TEACHING EACH READER TO COUNT ───────────
--
-- Two readers today and no reason to think they are the last. A trigger fixes
-- every one of them at once, including the ones not written yet, and keeps the
-- cheap filter cheap — library-search runs this over the whole library on every
-- keystroke, so a join-and-count there is not free.
--
-- NOTE ON THE AUDIT TRAIL: days carries a statement-level audit trigger, so a
-- genuine count change now leaves a programme_audit row alongside the one for
-- the exercise change itself. The `is distinct from` guard below means an
-- update that would not change the number writes nothing at all, so this only
-- happens when the count really moved.

create or replace function public.days_sync_exercise_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sec_ids uuid[] := '{}';
begin
  -- NEW and OLD are not both available on every operation, so each is taken
  -- only where it exists. A move between sections touches two days.
  if tg_op <> 'DELETE' then sec_ids := sec_ids || new.section_id; end if;
  if tg_op <> 'INSERT' then sec_ids := sec_ids || old.section_id; end if;

  update public.days d
     set exercise_count = c.n
    from (
      select s.day_id, count(pe.id)::int as n
        from public.sections s
        left join public.prescribed_exercises pe on pe.section_id = s.id
       where s.day_id in (select distinct s2.day_id
                            from public.sections s2
                           where s2.id = any(sec_ids))
       group by s.day_id
    ) c
   where d.id = c.day_id
     and d.exercise_count is distinct from c.n;

  return null;
end
$$;

drop trigger if exists trg_days_sync_exercise_count on public.prescribed_exercises;

-- Row level, not statement level: the volumes here are a dozen rows at a time
-- (a whole programme is 10,866 rows in total), and a row trigger is the version
-- that is obviously correct about which sections were touched.
--
-- `update of section_id` only: changing sets, reps or a cue cannot change a
-- count, and firing on those would put the audit trigger to work for nothing.
create trigger trg_days_sync_exercise_count
after insert or delete or update of section_id on public.prescribed_exercises
for each row execute function public.days_sync_exercise_count();

-- ── AND MAKE THE EXISTING ROWS TRUE ─────────────────────────────────────────
--
-- Backed up first: the column is about to be overwritten wholesale, and the old
-- values are the only record of what the stale backfill contained.
create table if not exists public.bak_days_exercise_count_20260913 as
  select id, exercise_count, now() as backed_up_at from public.days;

alter table public.bak_days_exercise_count_20260913 enable row level security;

update public.days d
   set exercise_count = c.n
  from (
    select s.day_id, count(pe.id)::int as n
      from public.sections s
      left join public.prescribed_exercises pe on pe.section_id = s.id
     group by s.day_id
  ) c
 where d.id = c.day_id
   and d.exercise_count is distinct from c.n;

-- A day with no sections at all has no row in that aggregate, and its count is
-- 0 by definition. Covered separately so it cannot keep a stale number.
update public.days d
   set exercise_count = 0
 where d.exercise_count is distinct from 0
   and not exists (select 1 from public.sections s where s.day_id = d.id);
