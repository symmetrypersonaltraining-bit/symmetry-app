-- BUG B — a swapped day kept the label of the movement it no longer contained.
--
-- Filed by the programming session 2026-08-13, then re-verified here against
-- the live rows before a line was written:
--
--   day eecfddf2  label "Deload — Cardio (20 min Walk)"   content Elliptical Trainer 20 min
--                 scheduled_workouts.updated_at 2026-07-14, though day_id changed 13 Aug
--   day c54cd364  label "Fat Loss Cardio Phase 3: Stair Master"
--                 content Treadmill Incline Walk 30 min          (Claudine Ocon, 31 Jul)
--
-- Two different clients, so not account-specific.
--
-- swap_prescribed_exercise did three of four things right: forked the day so
-- the original's history survived, repointed scheduled_workouts at the fork,
-- swapped the exercise. Then it stopped. It never renamed the fork and never
-- bumped updated_at, so nothing downstream could tell a swap had happened.
--
-- WHY A LABEL IS WORTH THIS MUCH CARE. It is what the UI prints, and what any
-- adherence calculation or AI summary reads unless it walks all the way through
-- to prescribed_exercises. The app was reporting a walk that was an elliptical.
-- It also manufactures fake "duplicate day" groups — same label, different
-- content — indistinguishable from a genuine duplication bug without opening
-- both and comparing.
--
-- ── THE ONE REAL DESIGN DECISION: WHEN TO RENAME ──────────────────────────
--
-- A label means different things on different days. On a single-exercise day it
-- names the MOVEMENT — "Deload — Cardio (20 min Walk)" IS the walk. On a
-- twelve-exercise day it names the SESSION, and "Push A" is still Push A after
-- one movement is swapped; rewriting it would be a second corruption shipped as
-- the fix for the first.
--
-- So only single-exercise days are relabelled. Checked against live data before
-- choosing the rule rather than after: 9 of the 35 library_fork days hold one
-- exercise, and BOTH known-wrong labels are among those 9. Every multi-exercise
-- fork keeps its name.
--
-- The programme prefix is preserved. "Deload — Cardio" and "Fat Loss Cardio
-- Phase 3" are real context both a client and Dustin navigate by; rebuilding
-- the whole label from the exercise name would fix the lie and throw away the
-- meaning. Only the part naming the movement is rebuilt, and the delimiter is
-- kept so the result reads like the labels around it rather than like a repair.
--
-- ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────
--
-- No insert into schedule_change_proposals. The brief suggested it — "table
-- exists, has a day_id FK" — and it was a reasonable guess, but the database
-- disagreed: its CHECK constraints allow reason IN (moved, cancelled,
-- uncovered, orphaned, pattern_shift, retired) and status IN (pending,
-- approved, rejected, superseded). A completed exercise swap is neither
-- proposed nor a schedule change.
--
-- The first version of this migration inserted there anyway, wrapped in
-- `exception when others then null` — correct in itself, since an audit row
-- must never fail a client's swap mid-session. The consequence was that it
-- failed silently on EVERY swap and still returned ok:true. Caught by asserting
-- the audit row existed after a live end-to-end test, which is the only way
-- that class of thing is ever caught.
--
-- The trail lives on the rows instead, and is strictly better:
--   days.swapped_from_day_id       which library day this came from
--   days.created_by = 'swap'       which code path made it (it used to inherit
--                                  'trainer' from the library row, even when
--                                  the app did it — the brief called this out)
--   scheduled_workouts.updated_at  when it was repointed
--
-- `select * from days where created_by = 'swap'` is the audit query, and unlike
-- a proposals row it cannot drift out of sync with what it describes.
--
-- ── VERIFICATION ──────────────────────────────────────────────────────────
-- Run live against one of Dustin's own future sessions (sw 9d57e2d4, 14 Aug),
-- swapping Outdoor Walk → Elliptical Trainer:
--   label      → "Deload — Cardio (20 min Elliptical Trainer)"   ✓
--   updated_at → bumped from 2026-07-14 to now                    ✓
--   created_by → 'swap'                                           ✓
--   swapped_from_day_id → the library day                         ✓
--   original day → label and contents untouched                   ✓
-- then rolled back to the byte, with the fork removed after checking all eight
-- FK tables referencing days.id showed zero references to it.

alter table public.days
  add column if not exists swapped_from_day_id uuid references public.days(id);

comment on column public.days.swapped_from_day_id is
  'The library day this fork came from, when a swap created it. Lets the original be found without parsing the label.';

create or replace function public.swap_prescribed_exercise(
  p_scheduled_workout_id uuid, p_pe_id uuid, p_new_exercise_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client   uuid;
  v_day      uuid;
  v_owner    uuid;
  v_new_day  uuid;
  v_sec_pos  int;
  v_pe_pos   int;
  v_new_pe   uuid;
  v_forked   boolean := false;
  v_n_ex     int;
  v_label    text;
  v_new_name text;
  v_vol      text;
  v_cut      int;
  v_relabel  text := null;
begin
  select sw.client_id, sw.day_id into v_client, v_day
  from scheduled_workouts sw where sw.id = p_scheduled_workout_id;
  if v_client is null then
    return jsonb_build_object('ok', false, 'error', 'scheduled workout not found');
  end if;

  select d.client_owner_id into v_owner from days d where d.id = v_day;

  if v_owner is distinct from v_client then
    select s.position, pe.position into v_sec_pos, v_pe_pos
    from prescribed_exercises pe join sections s on s.id = pe.section_id
    where pe.id = p_pe_id;
    if v_sec_pos is null then
      return jsonb_build_object('ok', false, 'error', 'exercise not found on that day');
    end if;

    v_new_day := public.fork_day_for_client(v_day, v_client);
    v_forked := true;

    update days
       set swapped_from_day_id = v_day,
           created_by = 'swap'
     where id = v_new_day;

    -- Only THIS session moves; the rest of the series stays on the library day.
    -- updated_at moves with day_id — it did not before, so a row could point at
    -- a day created weeks after its own last-modified stamp, which is exactly
    -- how this bug stayed invisible.
    update scheduled_workouts
       set day_id = v_new_day, updated_at = now()
     where id = p_scheduled_workout_id;

    select pe.id into v_new_pe
    from prescribed_exercises pe join sections s on s.id = pe.section_id
    where s.day_id = v_new_day and s.position = v_sec_pos and pe.position = v_pe_pos;
  else
    v_new_day := v_day;
    v_new_pe  := p_pe_id;
    update scheduled_workouts set updated_at = now() where id = p_scheduled_workout_id;
  end if;

  if v_new_pe is null then
    return jsonb_build_object('ok', false, 'error', 'could not locate the exercise in the copy');
  end if;

  update prescribed_exercises set exercise_id = p_new_exercise_id where id = v_new_pe;

  -- ── relabel, but ONLY when the label is naming the movement ──────────────
  -- On a one-exercise day the label IS the movement ("Deload — Cardio (20 min
  -- Walk)"). On a twelve-exercise day it names the session, and "Push A" is
  -- still Push A after one swap — rewriting that would be its own corruption.
  -- Checked against live data first: 9 of 35 forks hold one exercise, and both
  -- known-wrong labels are among those 9.
  select count(*) into v_n_ex
  from sections s join prescribed_exercises pe on pe.section_id = s.id
  where s.day_id = v_new_day;

  if v_n_ex = 1 then
    select d.label into v_label from days d where d.id = v_new_day;
    select e.name, pe.volume_value into v_new_name, v_vol
    from sections s join prescribed_exercises pe on pe.section_id = s.id
    join exercises e on e.id = pe.exercise_id
    where s.day_id = v_new_day limit 1;

    if v_new_name is not null then
      -- Keep the programme prefix — "Deload — Cardio", "Fat Loss Cardio Phase
      -- 3" is real context both sides rely on — and rebuild only the movement
      -- part, preserving the delimiter so it reads like its neighbours.
      v_cut := greatest(
        coalesce(position(' (' in v_label), 0),
        coalesce(position(': ' in v_label), 0)
      );
      if v_cut > 0 and substr(v_label, v_cut, 2) = ' (' then
        v_relabel := substr(v_label, 1, v_cut - 1)
                     || ' (' || coalesce(nullif(trim(v_vol), '') || ' ', '') || v_new_name || ')';
      elsif v_cut > 0 then
        v_relabel := substr(v_label, 1, v_cut - 1) || ': ' || v_new_name;
      else
        v_relabel := v_new_name;
      end if;

      if v_relabel is distinct from v_label then
        update days set label = v_relabel where id = v_new_day;
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'forked', v_forked, 'day_id', v_new_day,
                            'pe_id', v_new_pe, 'relabelled', v_relabel);
end;
$function$;

-- ── repair the two rows that are wrong TODAY ───────────────────────────────
-- Same rule the function now applies, so history and every future swap agree.
-- Backed up first to bak_stale_labels_20260813. This renames; it merges and
-- deletes nothing — the four label-sharing day pairs in the brief still need
-- Dustin's decision, and two of them stop looking like duplicates once the
-- labels are honest.
with one_ex as (
  select d.id, d.label, e.name as ex_name, pe.volume_value as vol
  from days d
  join sections s on s.day_id = d.id
  join prescribed_exercises pe on pe.section_id = s.id
  join exercises e on e.id = pe.exercise_id
  where d.origin = 'library_fork'
    and (select count(*) from sections s2 join prescribed_exercises p2 on p2.section_id = s2.id
          where s2.day_id = d.id) = 1
    and position(lower(e.name) in lower(d.label)) = 0
), calc as (
  select id, label, ex_name, vol,
    greatest(coalesce(position(' (' in label), 0), coalesce(position(': ' in label), 0)) as cut
  from one_ex
)
update days d
   set label = case
     when c.cut > 0 and substr(c.label, c.cut, 2) = ' (' then
       substr(c.label, 1, c.cut - 1) || ' (' || coalesce(nullif(trim(c.vol), '') || ' ', '') || c.ex_name || ')'
     when c.cut > 0 then substr(c.label, 1, c.cut - 1) || ': ' || c.ex_name
     else c.ex_name end
  from calc c
 where d.id = c.id;
