-- Copy a programme — usually a house template — into one of my own.
--
-- Dustin, 21 Aug, on the 26 house templates: "yes — duplicate to my own, then
-- edit freely." A trainer runs APT Correction as written, then takes a copy and
-- tailors it. The original is untouched, which is the whole point: the option
-- he rejected was letting them edit the originals, where the first tweak
-- rewrites a corrective track for every trainer's live clients.
--
-- Copies the whole tree in one transaction, because a half-copied programme is
-- worse than none: it looks assignable and is missing the back half of every
-- session.
--
-- TWO BUGS FOUND BY THE PROBE BEFORE THIS SHIPPED, both of which would have
-- looked fine in a list view:
--   1. Ordered by "order"; the column is `position` on phases, sections and
--      prescribed_exercises alike.
--   2. The section insert passed v_new_sec — the variable it was about to
--      assign — where it needed v_new_day. NOT NULL on sections.day_id caught
--      it; without that constraint every copy would have had orphaned sections
--      and no exercises.
--
-- Exercise references are NOT rewritten: they point at movements, and a
-- movement is either in the house library or one of this trainer's own.
-- fork_exercise_for_me covers the case where they later change one; doing it
-- here would fork 60 movements nobody asked to change.
create or replace function public.duplicate_program_for_me(
  p_program uuid,
  p_new_name text default null
)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me uuid := public.my_trainer_id();
  v_new_program uuid;
  v_name text;
  r_phase record; r_day record; r_sec record;
  v_new_phase uuid; v_new_day uuid; v_new_sec uuid;
begin
  if v_me is null then
    raise exception 'Not a trainer' using errcode = '42501';
  end if;

  -- Readable is enough to copy FROM: house templates are meant to be taken.
  -- Editing the original still requires trainer_can_edit_program, which this
  -- deliberately does not call.
  if not public.trainer_can_use_program(p_program) then
    raise exception 'That programme is not yours to copy' using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(p_new_name), ''), p.name || ' (my copy)')
    into v_name from public.programs p where p.id = p_program;
  if v_name is null then raise exception 'No such programme'; end if;

  insert into public.programs
    (name, category, structure_type, status, description, personal_for_client_id, owner_trainer_id)
  -- A copy starts as a draft. Landing live would put an unreviewed programme
  -- in front of a client the moment it is duplicated.
  select v_name, category, structure_type, 'draft', description, null, v_me
    from public.programs where id = p_program
  returning id into v_new_program;

  for r_phase in select * from public.phases where program_id = p_program order by position loop
    insert into public.phases (program_id, label, position, intent, approx_duration)
    values (v_new_program, r_phase.label, r_phase.position, r_phase.intent, r_phase.approx_duration)
    returning id into v_new_phase;

    for r_day in select * from public.days where phase_id = r_phase.id order by position loop
      insert into public.days
        (phase_id, label, position, day_of_week, swappable, client_owner_id, created_by, origin)
      values
        (v_new_phase, r_day.label, r_day.position, r_day.day_of_week, r_day.swappable,
         null, 'duplicate', 'duplicated')
      returning id into v_new_day;

      for r_sec in select * from public.sections where day_id = r_day.id order by position loop
        insert into public.sections (day_id, internal_name, client_facing_name, position)
        values (v_new_day, r_sec.internal_name, r_sec.client_facing_name, r_sec.position)
        returning id into v_new_sec;

        -- alternate_of deliberately NOT carried over: it points at another
        -- prescribed_exercise row, so copying the value would leave the copy
        -- pointing into the ORIGINAL programme. 0 of 10,051 rows use it.
        insert into public.prescribed_exercises
          (section_id, exercise_id, position, sets, volume_type, volume_value, unilateral,
           tempo, load_descriptor, cue, rest, superset_group, intensity_type,
           use_drop_sets, use_rest_pause, use_partials, tracked_fields, alternate_of)
        select v_new_sec, exercise_id, position, sets, volume_type, volume_value, unilateral,
               tempo, load_descriptor, cue, rest, superset_group, intensity_type,
               use_drop_sets, use_rest_pause, use_partials, tracked_fields, null
          from public.prescribed_exercises
         where section_id = r_sec.id
         order by position;
      end loop;
    end loop;
  end loop;

  return v_new_program;
end;
$$;

revoke all on function public.duplicate_program_for_me(uuid, text) from public;
grant execute on function public.duplicate_program_for_me(uuid, text) to authenticated;

comment on function public.duplicate_program_for_me is
  'Copy a programme tree into one owned by the calling trainer, as a draft. The original is never modified.';
