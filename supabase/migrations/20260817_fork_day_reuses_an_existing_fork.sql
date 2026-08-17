-- Swapping to the same workout twice stops failing.
--
-- ── WHAT DUSTIN SAW, 17 AUG ────────────────────────────────────────────────
--
-- Tapping a workout in "SWAP TODAY FOR:" produced a white dialog reading:
--
--   Couldn't swap that in — your original workout is still there.
--   duplicate key value violates unique constraint "uq_days_no_identical_twin"
--
-- His words: "no limits on being able to replace workouts."
--
-- ── THE CHAIN ──────────────────────────────────────────────────────────────
--
-- OffPlanBanner inserts a row into scheduled_workouts. The BEFORE INSERT
-- trigger sw_enforce_day_isolation asks day_is_exclusive_to(), and for a shared
-- library day the answer is no — so it calls fork_day_for_client() to give the
-- client their own copy.
--
-- That function created a NEW day every single time. The second swap to the
-- same library workout therefore tried to insert a second identical fork, and
-- ran into:
--
--   uq_days_no_identical_twin
--     UNIQUE (client_owner_id, phase_id, label, position) NULLS NOT DISTINCT
--
-- The constraint is right: one client should not accumulate a pile of identical
-- personal copies of "Stage 1 Treadmill Walk". The forking was wrong to assume
-- it had never run before.
--
-- So swapping to a workout worked exactly once per client, forever, and failed
-- with raw Postgres text every time after.
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
--
-- Look for the fork first and return it. Matched on the same tuple the
-- constraint uses — owner, personal phase, label, position — with
-- `is not distinct from` so NULLs compare the way NULLS NOT DISTINCT does.
-- Nothing else in the function changes; the cloning path is byte-identical.
--
-- Reusing the existing fork also means any edit the client made to their copy
-- survives, which is the behaviour you want: it is their version of that
-- workout, not a fresh one each time.
--
-- Reversible: previous definition verbatim in
-- public.bak_fork_day_for_client_20260817.

create or replace function public.fork_day_for_client(p_day_id uuid, p_client_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_phase_id uuid;
  v_new_day  uuid;
  v_existing uuid;
  r_sec      record;
  v_new_sec  uuid;
begin
  v_phase_id := ensure_personal_phase(p_client_id);

  -- Already forked this one? Hand back the copy they already have.
  -- Same tuple as uq_days_no_identical_twin, and `is not distinct from`
  -- because that index is NULLS NOT DISTINCT.
  select d.id into v_existing
  from days d
  join days src on src.id = p_day_id
  where d.client_owner_id = p_client_id
    and d.phase_id        = v_phase_id
    and d.label           is not distinct from src.label
    and d.position        is not distinct from src.position
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  v_new_day := gen_random_uuid();

  insert into days (id, phase_id, label, position, created_at, day_of_week, swappable,
                    client_owner_id, created_by, origin)
  select v_new_day, v_phase_id, d.label, d.position, now(), d.day_of_week, d.swappable,
         p_client_id, d.created_by, coalesce(d.origin, 'library_fork')
  from days d where d.id = p_day_id;

  for r_sec in select * from sections where day_id = p_day_id order by position loop
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

  return v_new_day;
end;
$function$;
