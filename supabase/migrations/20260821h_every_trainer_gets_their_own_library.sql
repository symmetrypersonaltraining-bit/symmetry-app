-- Every trainer gets their own movement library, without anyone starting empty.
--
-- Dustin, 21 Aug: "they need to have their own copy of the library where they
-- can do what they want with it but it should not effect any other trainers."
--
-- COPY-ON-WRITE rather than cloning 843 rows per trainer. A trainer sees the
-- whole house library from their first minute; the moment they change one, that
-- single movement forks into a private copy that is theirs to do anything with,
-- and the house row is untouched for everyone else. Hiding one is recorded
-- rather than deleted, for the same reason.
--
-- Cloning would have meant 843 rows per trainer, four copies of every video
-- URL, and no way to push a correction — fix a bad video and it stays bad in
-- three other libraries. This way the house library keeps improving for anyone
-- who has not overridden that specific movement.
alter table public.exercises
  add column if not exists owner_trainer_id uuid references public.trainers(id),
  add column if not exists forked_from_id  uuid references public.exercises(id);

comment on column public.exercises.owner_trainer_id is
  'NULL = house library, readable by every trainer. Set = private to that trainer.';
comment on column public.exercises.forked_from_id is
  'The house movement this private copy was made from, so a library can show what it overrides.';

create index if not exists idx_exercises_owner on public.exercises (owner_trainer_id);
create index if not exists idx_exercises_forked_from on public.exercises (forked_from_id);

-- A movement name is unique WITHIN a library, not across the database.
--
-- `exercises_name_key UNIQUE (name)` was right while there was one library and
-- wrong the moment each trainer has their own: forking "Barbell Back Squat"
-- collides with the house row of the same name, so the FIRST edit any trainer
-- makes fails. Found by a probe that forked one and watched it blow up.
--
-- NULLS NOT DISTINCT matters: the house library is owner_trainer_id NULL, and
-- Postgres treats NULLs as distinct by default — without it the house library
-- would lose its own uniqueness and could hold "Leg Press" twice.
alter table public.exercises drop constraint if exists exercises_name_key;
create unique index if not exists exercises_name_per_owner
  on public.exercises (name, owner_trainer_id) nulls not distinct;

create table if not exists public.exercise_hidden (
  trainer_id  uuid not null references public.trainers(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  hidden_at   timestamptz not null default now(),
  primary key (trainer_id, exercise_id)
);
alter table public.exercise_hidden enable row level security;

create policy "trainer_manages_own_hidden"
  on public.exercise_hidden for all to authenticated
  using (trainer_id = public.my_trainer_id())
  with check (trainer_id = public.my_trainer_id());

-- `all_read_exercises` USING (true) stays: a client must read the movement on
-- their own workout, and it is a name and a video, not anyone's data.
drop policy if exists "trainer_all_exercises" on public.exercises;

create policy "trainer_reads_exercises" on public.exercises for select to authenticated
  using (public.is_trainer());
create policy "trainer_adds_exercises" on public.exercises for insert to authenticated
  with check (public.is_trainer());
create policy "trainer_edits_own_exercises" on public.exercises for update to authenticated
  using (owner_trainer_id = public.my_trainer_id()
         or (public.is_owner() and owner_trainer_id is null))
  with check (owner_trainer_id = public.my_trainer_id()
              or (public.is_owner() and owner_trainer_id is null));
create policy "trainer_deletes_own_exercises" on public.exercises for delete to authenticated
  using (owner_trainer_id = public.my_trainer_id()
         or (public.is_owner() and owner_trainer_id is null));

create or replace function public.stamp_exercise_owner()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- A movement added by the OWNER goes into the house library, because that is
  -- what he is maintaining. Anyone else's goes into their own.
  if new.owner_trainer_id is null and not public.is_owner() then
    new.owner_trainer_id := public.my_trainer_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_exercise_owner on public.exercises;
create trigger trg_stamp_exercise_owner
  before insert on public.exercises
  for each row execute function public.stamp_exercise_owner();

-- ── the three operations, and the one view ────────────────────────────────
create or replace function public.fork_exercise_for_me(p_exercise uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_me uuid := public.my_trainer_id(); v_new uuid; v_owner uuid;
begin
  if v_me is null then raise exception 'Not a trainer' using errcode='42501'; end if;
  select owner_trainer_id into v_owner from public.exercises where id = p_exercise;
  if not found then raise exception 'No such movement'; end if;
  if v_owner = v_me then return p_exercise; end if;

  select id into v_new from public.exercises
   where owner_trainer_id = v_me and forked_from_id = p_exercise limit 1;
  if found then return v_new; end if;

  insert into public.exercises (
    name, everfit_name, aliases, modality, muscle_group, equipment_required,
    corrective_phase_tags, video_url, availability_status, client_owner_id,
    created_by, video_status, video_checked_at, default_tracked_fields,
    load_is_assistance, owner_trainer_id, forked_from_id)
  select
    name, everfit_name, aliases, modality, muscle_group, equipment_required,
    corrective_phase_tags, video_url, availability_status, client_owner_id,
    created_by, video_status, video_checked_at, default_tracked_fields,
    load_is_assistance, v_me, p_exercise
  from public.exercises where id = p_exercise
  returning id into v_new;

  -- Repoint only prescriptions inside programmes THIS trainer owns. A house
  -- template and another trainer's work both keep the original.
  update public.prescribed_exercises pe
     set exercise_id = v_new
    from public.sections s
    join public.days d on d.id = s.day_id
    join public.phases ph on ph.id = d.phase_id
    join public.programs pr on pr.id = ph.program_id
   where pe.section_id = s.id and pe.exercise_id = p_exercise
     and pr.owner_trainer_id = v_me;

  return v_new;
end;
$$;

create or replace function public.hide_exercise_for_me(p_exercise uuid, p_hidden boolean default true)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_me uuid := public.my_trainer_id();
begin
  if v_me is null then raise exception 'Not a trainer' using errcode='42501'; end if;
  if p_hidden then
    insert into public.exercise_hidden (trainer_id, exercise_id)
    values (v_me, p_exercise) on conflict do nothing;
  else
    delete from public.exercise_hidden where trainer_id = v_me and exercise_id = p_exercise;
  end if;
end;
$$;

create or replace view public.v_my_exercises as
  select e.*,
         (e.owner_trainer_id is not null) as is_mine,
         (e.forked_from_id is not null)   as is_my_edit_of_a_house_movement
    from public.exercises e
   where (
     e.owner_trainer_id = public.my_trainer_id()
     or (
       e.owner_trainer_id is null
       and not exists (select 1 from public.exercise_hidden h
                        where h.trainer_id = public.my_trainer_id() and h.exercise_id = e.id)
       and not exists (select 1 from public.exercises f
                        where f.owner_trainer_id = public.my_trainer_id() and f.forked_from_id = e.id)
     )
   );

comment on view public.v_my_exercises is
  'This trainer''s library: their own movements, plus house movements they have not hidden or overridden with a fork.';

revoke all on function public.fork_exercise_for_me(uuid) from public;
revoke all on function public.hide_exercise_for_me(uuid, boolean) from public;
grant execute on function public.fork_exercise_for_me(uuid) to authenticated;
grant execute on function public.hide_exercise_for_me(uuid, boolean) to authenticated;
grant select on public.v_my_exercises to authenticated;
