-- Approving a 'moved' proposal moves THAT session, and is no longer blocked by
-- unsupervised work sharing the date.
--
-- ── Measured on live data before changing anything ─────────────────────────
--
-- For each of the 6 pending 'moved' proposals, how the CURRENT function would
-- behave if Dustin approved it today:
--
--   client            from -> to        rows it would UPDATE   target rows: any / supervised
--   Cheyenne Martin   08-17 -> 08-19            1                     1 / 0
--   Cheyenne Martin   08-24 -> 08-26            1                     1 / 0
--   Greg Lennon       08-17 -> 08-22            2                     1 / 0
--   Sariah Duncan     08-19 -> 08-18            3                     2 / 0
--   Sariah Duncan     08-19 -> 08-20            3                     2 / 0
--   Sariah Duncan     08-26 -> 08-27            3                     2 / 0
--
-- Two separate faults, and between them the move feature does not work at all.
--
-- ── 1. The occupancy check counts homework as an occupied date ─────────────
--
--   and not exists (select 1 from scheduled_workouts x
--                    where x.client_id = ... and x.scheduled_date = v_p.to_date
--                      and x.deleted_at is null)
--
-- No `supervised` filter. Unsupervised sessions — the work a client does on
-- their own — sit on most dates in most programmes: Sariah has one on nearly
-- every day of the month. So "is the target date free?" answers NO almost
-- always, and the guard that exists to stop two supervised sessions colliding
-- instead blocks every move.
--
-- Look at the last column: `target supervised rows` is **0 for all six**. Every
-- pending move is a guaranteed no-op today. Dustin approves it, the function
-- reports `approved_no_op`, and nothing moves. The feature the spec is about
-- has never been able to apply a single proposal.
--
-- Two supervised sessions on one date is still refused. That is the collision
-- worth refusing, and it is the only one.
--
-- ── 2. The update matches by DATE, so it moves the whole day ───────────────
--
--   where sw.client_id = v_p.client_id and sw.scheduled_date = v_p.from_date
--
-- The proposal carries `scheduled_workout_id` — the exact row the detector
-- paired — and it was not used. Match by client and date and you match every
-- session on that date: for Greg 2 rows, for Sariah 3. Approving "move Monday's
-- supervised session to Saturday" would have dragged his unsupervised work to
-- Saturday with it, and `rows_changed` would have said 2 as though that were
-- the intent.
--
-- Now it targets `sw.id = v_p.scheduled_workout_id`, with client and from_date
-- kept as a staleness guard: if the session has already been moved since the
-- proposal was raised, from_date no longer matches and it correctly no-ops
-- rather than moving a row from somewhere unexpected.
--
-- A 'moved' proposal without a scheduled_workout_id is refused outright instead
-- of falling back to the date match. The detector always sets it (0 of the 6
-- pending rows are null), so the fallback only ever fires for a row built by
-- hand — exactly the case where guessing is worst.
--
-- ── Not changed ────────────────────────────────────────────────────────────
--
-- The trainer-only email check, the never-move-a-logged-session rule
-- (`workout_log_id is null`), the refusal to act on a proposal twice,
-- delete-and-reinsert still never happening, and every non-'moved' reason
-- staying a pure acknowledgement that touches no schedule rows. Approval is
-- still manual; nothing here auto-applies.
--
-- Reversible: previous definition verbatim in
-- public.bak_resolve_schedule_proposal_20260816.

create or replace function public.resolve_schedule_proposal(p_id uuid, p_decision text, p_note text default null::text)
 returns table(proposal_id uuid, client text, reason text, outcome text, rows_changed integer, detail text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_p       schedule_change_proposals%rowtype;
  v_client  text;
  v_changed int := 0;
  v_outcome text;
  v_detail  text;
  v_email   text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
begin
  if coalesce(v_email, '') <> 'symmetrypersonaltraining@gmail.com' then
    raise exception 'resolve_schedule_proposal is trainer-only';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'p_decision must be approve or reject, got %', p_decision;
  end if;

  select * into v_p from schedule_change_proposals where id = p_id;
  if not found then raise exception 'no proposal %', p_id; end if;
  if v_p.status <> 'pending' then
    raise exception 'proposal % is already %, refusing to act twice', p_id, v_p.status;
  end if;

  select c.name into v_client from clients c where c.id = v_p.client_id;

  if p_decision = 'reject' then
    update schedule_change_proposals set status='rejected', resolved_at=now() where id=p_id;
    v_outcome := 'rejected'; v_detail := 'no schedule rows touched';

  elsif v_p.reason = 'moved' and v_p.to_date is not null then
    if v_p.scheduled_workout_id is null then
      -- Nothing to aim at. Falling back to "everything on that date" is how the
      -- previous version moved a client's homework along with their session.
      raise exception 'proposal % is a move with no scheduled_workout_id - refusing to guess which session', p_id;
    end if;
    -- The one mechanical fix: same row, new date, provenance preserved.
    with moved as (
      update scheduled_workouts sw
         set scheduled_date = v_p.to_date, moved_from_date = v_p.from_date, updated_at = now()
       where sw.id = v_p.scheduled_workout_id          -- THAT session, not the date
         and sw.client_id = v_p.client_id
         and sw.scheduled_date = v_p.from_date         -- stale proposal: no-op, do not guess
         and sw.deleted_at is null
         and sw.workout_log_id is null                 -- never move a logged session
         and not exists (select 1 from scheduled_workouts x
                          where x.client_id = v_p.client_id
                            and x.scheduled_date = v_p.to_date
                            and x.deleted_at is null
                            and x.supervised                 -- homework is not a collision
                            and x.id <> sw.id)
      returning sw.id
    ) select count(*) into v_changed from moved;
    update schedule_change_proposals set status='approved', resolved_at=now() where id=p_id;
    v_outcome := case when v_changed>0 then 'applied' else 'approved_no_op' end;
    v_detail  := case when v_changed>0
                   then 'moved '||v_changed||' row(s) '||v_p.from_date||' -> '||v_p.to_date||', moved_from_date set'
                   else 'nothing to move: that session is no longer live and unlogged on '||v_p.from_date
                        ||', or a supervised session already sits on '||v_p.to_date end;

  else
    -- cancelled / uncovered / orphaned / retired / pattern_shift.
    -- Acknowledged. No schedule rows touched, ever.
    update schedule_change_proposals set status='approved', resolved_at=now() where id=p_id;
    v_outcome := 'acknowledged';
    v_detail  := case v_p.reason
                   when 'cancelled' then 'appointment cancelled - the workout stays where it is, per Dustin'
                   else v_p.reason||' needs a programming decision, not a mechanical fix - marked handled, no schedule rows touched'
                 end;
  end if;

  if p_note is not null then
    update schedule_change_proposals
       set detail = coalesce(detail,'{}'::jsonb) || jsonb_build_object('trainer_note', p_note)
     where id = p_id;
  end if;

  return query select p_id, v_client, v_p.reason, v_outcome, v_changed, v_detail;
end;
$function$;
