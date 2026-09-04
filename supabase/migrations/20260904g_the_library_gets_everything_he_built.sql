-- THE LIBRARY GETS EVERYTHING HE BUILT. NOT THE THINGS HE MODIFIED.
--
-- Dustin, 4 Sep: "go ahead and take care of it here. i do not want any of the
-- modified librrary workouts to be saved in library, if they are, get rid of
-- them leave the originals." And, immediately after: "leave them in scheduled
-- sessoins for clients!!!"
--
-- Both halves matter. A modified copy comes OUT of the library; it does not come
-- out of anybody's calendar.
--
-- ── FIRST, A CORRECTION TO 20260904d ────────────────────────────────────────
--
-- That migration said "what the owner builds is the library, whichever account
-- he built it from" and cleared his client stamp on the way in. Right for a new
-- workout, wrong for a modified one — and it is why eleven modified copies were
-- sitting in the library, every one of them forked or AI-replaced from his own
-- account. The exemption is the ORIGIN, not the person: a fork is a fork whoever
-- made it.
create or replace function public.owner_creations_are_library()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.origin, '') in ('library_fork', 'forked_for_swap', 'ai_adjust', 'ai_replace') then
    return new;
  end if;

  if new.client_owner_id is not null
     and exists (
       select 1
       from clients c
       join trainers t on (t.auth_user_id = c.auth_user_id or lower(t.email) = lower(c.email))
       where c.id = new.client_owner_id and t.role = 'owner' and t.active
     )
  then
    new.client_owner_id := null;
  end if;
  return new;
end;
$$;

-- ── THE ELEVEN THAT WERE ALREADY IN THERE ───────────────────────────────────
--
-- Nine are on his own calendar and some are logged, so they are re-owned to the
-- client who has them scheduled: out of the library, session and history intact.
-- Two were never scheduled and never logged — strays whose original still
-- exists — and those are deleted. Nothing is removed from a calendar.
create table if not exists bak_modified_in_library_20260904 as
select d.*, now() as taken_at from days d
where d.client_owner_id is null
  and coalesce(d.origin,'') in ('library_fork','forked_for_swap','ai_adjust','ai_replace');

update days d
set client_owner_id = (
  select sw.client_id from scheduled_workouts sw where sw.day_id = d.id order by sw.scheduled_date limit 1
)
where d.id in (select id from bak_modified_in_library_20260904)
  and exists (select 1 from scheduled_workouts sw where sw.day_id = d.id);

delete from sections where day_id in (
  select b.id from bak_modified_in_library_20260904 b
  where not exists (select 1 from scheduled_workouts sw where sw.day_id = b.id)
    and not exists (select 1 from workout_logs wl where wl.day_id = b.id));
delete from days d where d.id in (
  select b.id from bak_modified_in_library_20260904 b
  where not exists (select 1 from scheduled_workouts sw where sw.day_id = b.id)
    and not exists (select 1 from workout_logs wl where wl.day_id = b.id));

-- ── AND THE 419 HE BUILT THAT WERE STUCK AS PRIVATE ─────────────────────────
--
-- `client_owner_id` was set by four different routes and had come to mean "a
-- client-owned COPY" rather than "a client made this". By his rule only what a
-- CLIENT creates from their own account stays private — 22 rows. The rest are
-- his, and the library is meant to keep growing as he works.
--
-- Row by row on purpose, so one refusal does not abort the batch. Five were
-- refused, and every refusal was a guard doing its job:
--   * four hit uq_days_no_identical_twin — after the rename stripped "GG2 " and
--     "SG2 ", Gerard's and Sharon's backup days became identical twins, and the
--     library already holds one of each. Left client-owned; none is scheduled.
--   * one hit the naming guard: "Cardio — 20 Min Walk (Todd)", a name in
--     parentheses that the prefix rename did not reach. Renamed, then published.
--
-- Result: 1,096 workouts in the library, 99 client-owned (73 modified copies,
-- 22 client-made, 4 duplicate twins).
create table if not exists bak_days_published_to_library_20260904 as
select d.id, d.label, d.client_owner_id, d.origin, d.created_by, now() as taken_at
from days d
where d.client_owner_id is not null
  and coalesce(d.origin,'') not in ('library_fork','forked_for_swap','ai_adjust','ai_replace','manual','ai_activity')
  and coalesce(d.created_by,'') not in ('client_manual','client_ai','swap');

update days set label = regexp_replace(label, '\s*\((Todd|Sara|Jennifer|Claudine|Tyler|Gerard|Sharon|Grant|Robert|Celeste|Hassan|Laurie|Lesly|Madeleine|Martha|Krysta|Stacie|Sariah|Cheyenne|Christine|Bobbie|Troy|Dustin)\)\s*$', '')
where label ~ '\((Todd|Sara|Jennifer|Claudine|Tyler|Gerard|Sharon|Grant|Robert|Celeste|Hassan|Laurie|Lesly|Madeleine|Martha|Krysta|Stacie|Sariah|Cheyenne|Christine|Bobbie|Troy|Dustin)\)\s*$';

do $$
declare r record;
begin
  for r in select id from bak_days_published_to_library_20260904 loop
    begin
      update days set client_owner_id = null where id = r.id;
    exception when others then
      null;  -- a guard refused it; see the note above. Deliberately not fatal.
    end;
  end loop;
end $$;
