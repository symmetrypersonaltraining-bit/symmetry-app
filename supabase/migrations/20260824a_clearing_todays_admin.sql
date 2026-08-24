-- CLEARING TODAY'S ADMIN.
--
-- Dustin, 24 Aug: "I need a dismiss button on all of these and once I dismiss
-- it doesn't come back up. for instance I dont program for trainers so they
-- shoukd not be on here. steph is exception I do hers. either way I shoukd be
-- abke to dismiss anything in admin and it should be marked as taken care of.
-- no big deal if it comes up once a month but I need to be abke to clear the
-- list."
--
-- Two separate things, and it matters that they are separate.
--
-- 1. THE STRUCTURAL ONE. Five of the fourteen names under "Programming running
--    out" were TRAINERS — every trainer carries a self-coached client row of
--    their own, and they were sitting in his coverage count as though he had
--    forgotten to programme them. `clients.is_self_coached` already existed and
--    already meant exactly this. Nothing read it. That is not something he
--    should have to dismiss every month; it is a filter that was never applied.
--    Steph's flag was wrong — he writes hers — and is now false.
--
-- 2. THE HUMAN ONE. Everything else. A row he has looked at and handled should
--    go away when he says so.
--
-- WHY `until` AND NOT A BOOLEAN. A row that can be silenced forever will
-- eventually hide something that matters, and by then neither of us will
-- remember it was hidden. His own words set the interval: "no big deal if it
-- comes up once a month". Thirty days is long enough to be genuinely out of the
-- way and short enough that anything still true comes back on its own.
--
-- subject_id is here for dismissing ONE PERSON out of a row rather than the
-- whole row. Nothing writes it yet — the self-coached filter removed the case
-- that made it urgent — but the unique index is built for it now so adding it
-- later is not a migration against live data.

create table if not exists public.admin_dismissals (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references public.trainers(id) on delete cascade,
  -- The Row.key in TodaysAdmin: 'coverage', 'notes', 'money', 'focus', ...
  row_key      text not null,
  -- One person inside that row, or null for the whole row.
  subject_id   uuid,
  dismissed_at timestamptz not null default now(),
  until        date not null
);

-- coalesce, because NULL is not distinct from NULL in a unique index and two
-- whole-row dismissals of the same row would otherwise both be allowed.
create unique index if not exists admin_dismissals_one_per_thing
  on public.admin_dismissals (trainer_id, row_key, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists admin_dismissals_live on public.admin_dismissals (trainer_id, until);

alter table public.admin_dismissals enable row level security;
revoke all on public.admin_dismissals from public, anon;
grant select, insert, update, delete on public.admin_dismissals to authenticated;

-- Your own list only. A dismissal is a statement about one coach's attention.
drop policy if exists admin_dismissals_own on public.admin_dismissals;
create policy admin_dismissals_own on public.admin_dismissals
  for all to authenticated
  using (trainer_id = public.my_trainer_id())
  with check (trainer_id = public.my_trainer_id());

update public.clients set is_self_coached = false
 where name = 'Steph Gautreaux' and is_self_coached;
