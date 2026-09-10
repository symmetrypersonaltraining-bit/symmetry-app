-- ONE CLIENT, ONE COPY. SCHEDULING A LIBRARY WORKOUT DOES NOT CLONE THE LIBRARY.
--
-- 10 Sep 2026, 9:54am Central. Dustin ran programming for a new client, Mary
-- Ellen, from the Cowork "Client programming overhaul" session. It scheduled 35
-- workouts for her in one INSERT, pointing at days that live in the library
-- programme "Solo Training — 3-Day". Three minutes later the database held 70
-- new programmes, all named "Solo Training — 3-Day — Mary", 70 assignments,
-- 10,150 days, 32,935 sections and 102,585 prescribed exercises. None of them
-- carry a workout, a log or a note. Her 35 real workouts sit on four forked
-- days in "Mary — Personal Workouts", exactly where they belong.
--
-- WHAT MULTIPLIED. Two BEFORE INSERT triggers on scheduled_workouts fire in
-- name order, and the order was wrong:
--
--   trg_stamp_scheduled_workout_assignment   ran FIRST. The row's day was in a
--     library programme other clients are assigned to; the client had no
--     assignment to it; so it inserted one. That insert fired
--     trg_pa_enforce_program_isolation, which saw the programme was "taken",
--     copied the WHOLE programme (every phase, day, section and exercise) and
--     re-pointed the new assignment at the copy.
--   trg_sw_enforce_day_isolation             ran SECOND, forked the one day the
--     row needed into the client's personal programme and pointed the row at
--     the fork. So the copy was never used -- and never found again, because
--     the next row looked for an assignment on the ORIGINAL programme id, saw
--     none, and did it all over. One full copy per scheduled row. 35 rows, 35
--     copies; a second attempt at 9:57, 35 more.
--
-- Red proof, rolled back: two rows scheduled on library days -> +2 programmes,
-- +294 days.
--
-- THE RULE. A day is made the client's BEFORE anything asks which programme it
-- belongs to. Day isolation now fires first (triggers fire alphabetically, so
-- it is renamed to sort before the stamp); by the time the assignment is
-- stamped the day is already in the personal programme, whose assignment
-- exists. And, in case a whole programme is ever assigned twice, a fork now
-- remembers its parent (programs.forked_from_program_id) and the isolation
-- trigger reuses the client's existing fork instead of copying again; the
-- stamp treats an assignment on a fork as an assignment on the parent.
--
-- NOT DONE HERE: the 70 copies are still in place. Removing a programme is
-- Dustin's call, never a migration's. The library programme itself has
-- accumulated 147 days in one phase since 15 July (days built for other
-- clients, other blocks, other months); every copy carried all of them. That
-- is a separate decision, recorded in the handoff.

-- 1. A fork remembers its parent.
alter table public.programs
  add column if not exists forked_from_program_id uuid references public.programs(id) on delete set null;
comment on column public.programs.forked_from_program_id is
  'The library programme this one was copied from by pa_enforce_program_isolation. Null for originals and personal programmes. Lets the isolation trigger reuse a client''s existing copy instead of making another. 10 Sep 2026.';
create index if not exists programs_forked_from_program_id_idx
  on public.programs (forked_from_program_id) where forked_from_program_id is not null;

-- 2. The isolation trigger reuses the client's copy, and stamps the parent on a new one.
create or replace function public.pa_enforce_program_isolation()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_taken     boolean;
  v_existing  uuid;
  v_new_prog  uuid;
  v_name      text;
  v_client    text;
  r_ph        record;
  v_new_phase uuid;
  r_day       record;
  v_new_day   uuid;
  r_sec       record;
  v_new_sec   uuid;
begin
  if new.program_id is null or new.client_id is null then return new; end if;

  select exists (select 1 from program_assignments pa
                 where pa.program_id = new.program_id
                   and pa.client_id <> new.client_id
                   and (tg_op = 'INSERT' or pa.id <> new.id))
    into v_taken;
  if not v_taken then return new; end if;

  -- This client already has their own copy of this programme: point at it.
  select pa.program_id into v_existing
    from program_assignments pa
    join programs p on p.id = pa.program_id
   where pa.client_id = new.client_id
     and p.forked_from_program_id = new.program_id
     and (tg_op = 'INSERT' or pa.id <> new.id)
   order by pa.active desc, pa.assigned_at desc
   limit 1;
  if v_existing is not null then
    if new.current_phase_id is not null then
      select np.id into new.current_phase_id
        from phases op
        join phases np on np.program_id = v_existing and np.position = op.position
       where op.id = new.current_phase_id
       limit 1;
    end if;
    new.program_id := v_existing;
    return new;
  end if;

  select name into v_name from programs where id = new.program_id;
  select split_part(name,' ',1) into v_client from clients where id = new.client_id;
  v_new_prog := gen_random_uuid();

  insert into programs (id, name, category, structure_type, status, description, created_at, updated_at, forked_from_program_id)
  select v_new_prog, v_name || ' — ' || coalesce(v_client,'Client'),
         category, structure_type, status, description, now(), now(), new.program_id
  from programs where id = new.program_id;

  for r_ph in select * from phases where program_id = new.program_id order by position loop
    v_new_phase := gen_random_uuid();
    insert into phases (id, program_id, label, position, intent, approx_duration, created_at)
    values (v_new_phase, v_new_prog, r_ph.label, r_ph.position, r_ph.intent, r_ph.approx_duration, now());
    if new.current_phase_id = r_ph.id then new.current_phase_id := v_new_phase; end if;

    for r_day in select * from days where phase_id = r_ph.id order by position loop
      v_new_day := gen_random_uuid();
      insert into days (id, phase_id, label, position, created_at, day_of_week, swappable,
                        client_owner_id, created_by, origin)
      values (v_new_day, v_new_phase, r_day.label, r_day.position, now(), r_day.day_of_week,
              r_day.swappable, r_day.client_owner_id, r_day.created_by, r_day.origin);

      for r_sec in select * from sections where day_id = r_day.id order by position loop
        v_new_sec := gen_random_uuid();
        insert into sections (id, day_id, internal_name, client_facing_name, position, created_at)
        values (v_new_sec, v_new_day, r_sec.internal_name, r_sec.client_facing_name, r_sec.position, now());

        insert into prescribed_exercises (id, section_id, exercise_id, position, sets, volume_type, volume_value,
               unilateral, tempo, load_descriptor, cue, rest, superset_group, intensity_type,
               use_drop_sets, use_rest_pause, use_partials, alternate_of, created_at, tracked_fields)
        select gen_random_uuid(), v_new_sec, pe.exercise_id, pe.position, pe.sets, pe.volume_type, pe.volume_value,
               pe.unilateral, pe.tempo, pe.load_descriptor, pe.cue, pe.rest, pe.superset_group, pe.intensity_type,
               pe.use_drop_sets, pe.use_rest_pause, pe.use_partials, null, now(), pe.tracked_fields
        from prescribed_exercises pe where pe.section_id = r_sec.id;
      end loop;
    end loop;
  end loop;

  new.program_id := v_new_prog;
  return new;
end;
$function$;

-- 3. The stamp treats an assignment on the client's copy as an assignment on the parent.
create or replace function public.stamp_scheduled_workout_assignment()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_program uuid;
  v_phase   uuid;
  v_label   text;
  v_assign  uuid;
  v_actual  uuid;
  v_newday  uuid;
begin
  if new.assignment_id is not null or new.day_id is null or new.client_id is null then
    return new;
  end if;

  select ph.program_id, ph.id, d.label into v_program, v_phase, v_label
    from public.days d join public.phases ph on ph.id = d.phase_id
   where d.id = new.day_id;

  -- A day with no programme behind it — a one-off, a client-owned day — is
  -- legitimate and stays unassigned rather than being forced into one.
  if v_program is null then
    return new;
  end if;

  -- The programme itself, or this client's own copy of it.
  select pa.id, pa.program_id into v_assign, v_actual
    from public.program_assignments pa
    join public.programs p on p.id = pa.program_id
   where pa.client_id = new.client_id
     and (pa.program_id = v_program or p.forked_from_program_id = v_program)
   order by (pa.program_id = v_program) desc, pa.active desc, pa.assigned_at desc
   limit 1;

  if v_assign is null then
    insert into public.program_assignments (client_id, program_id, current_phase_id, active, assigned_at)
    values (new.client_id, v_program, v_phase, true, now())
    returning id into v_assign;
    select program_id into v_actual from public.program_assignments where id = v_assign;
  end if;

  -- The assignment is on a copy: follow it to the matching day in the copy.
  -- Only if the matching day is really there. Stamping an assignment onto a
  -- day that is not in its programme is the fault this whole thing exists to
  -- prevent, so if the copy is not recognisable the row is left alone and
  -- shows up in the integrity check instead.
  if v_actual is distinct from v_program then
    select nd.id into v_newday
      from public.phases nph join public.days nd on nd.phase_id = nph.id
     where nph.program_id = v_actual and nd.label = v_label
     limit 1;
    if v_newday is null then
      return new;
    end if;
    new.day_id := v_newday;
  end if;

  new.assignment_id := v_assign;
  return new;
end;
$function$;

-- The stamp's trigger is unchanged; restated so this file is a complete record.
drop trigger if exists trg_stamp_scheduled_workout_assignment on public.scheduled_workouts;
create trigger trg_stamp_scheduled_workout_assignment
  before insert or update of day_id on public.scheduled_workouts
  for each row execute function public.stamp_scheduled_workout_assignment();

-- 4. Day isolation fires BEFORE the assignment stamp. Triggers on one event
--    fire in name order; "trg_a_" sorts before "trg_stamp_" and "trg_sw_".
drop trigger if exists trg_sw_enforce_day_isolation on public.scheduled_workouts;
drop trigger if exists trg_a_sw_enforce_day_isolation_first on public.scheduled_workouts;
create trigger trg_a_sw_enforce_day_isolation_first
  before insert or update of day_id, client_id, status on public.scheduled_workouts
  for each row execute function public.sw_enforce_day_isolation();
comment on trigger trg_a_sw_enforce_day_isolation_first on public.scheduled_workouts is
  'Named to fire BEFORE trg_stamp_scheduled_workout_assignment (alphabetical). A library day is forked into the client''s personal programme first, so the stamp finds that programme''s assignment and never creates one on the library programme -- which used to copy the entire library programme once per scheduled row. 10 Sep 2026.';

-- 5. The 70 copies made on 10 Sep know their parent, so the guard covers them
--    until Dustin decides what to do with them.
update public.programs
   set forked_from_program_id = 'aaaa0002-0000-0000-0000-000000000001'
 where name = 'Solo Training — 3-Day — Mary'
   and forked_from_program_id is null
   and (created_at at time zone 'America/Chicago')::date = date '2026-09-10';
