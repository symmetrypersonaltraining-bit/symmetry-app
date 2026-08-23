-- THREE CHECKS THAT WERE ALWAYS RED ON CORRECT DATA.
--
-- A critical that is always red is worse than no check: it teaches everyone to
-- scroll past the critical row. run_integrity_checks already carries that
-- lesson in its own comments, written about anon_writable_policies -- "which is
-- how the one check that would ever catch a real hole came to be permanently,
-- meaninglessly red." Two of its criticals had since become exactly that.
--
-- personal_program_without_assignment listed six clients including Dustin. All
-- six have an active assignment and future work; what they do not have is an
-- active assignment to their PERSONAL programme, because they are on a block. A
-- dormant personal programme is what moving onto a block looks like. Critical
-- belongs to the state where a client has no active assignment AT ALL -- that
-- is when the app tells somebody they have no programme.
--
-- scheduled_day_outside_assigned_program listed Sara Prince for exactly one
-- row: today's session, already COMPLETED, under a personal programme that went
-- dormant when she finished it. `active` means "has work from today onward", so
-- a session completed earlier today sits on the wrong side of its own boundary.
-- History was already excluded for yesterday; it needed excluding for a
-- finished session today.
--
-- client_coverage_under_14_days flagged Jerry Bourgeois every run. Jerry is
-- nutrition only -- clients.nutrition_only is true precisely so that stops being
-- something Dustin has to keep saying, and a check that reports his workout
-- schedule running out is saying it for him.
--
-- All three are rewritten FROM THE FUNCTION'S OWN SOURCE with replace(), so the
-- 5,368 characters that are not changing are never retyped, and each replace
-- raises if its fragment is missing so a silent no-op is impossible.

do $$
declare src text; out text;
begin
  src := pg_get_functiondef('public.run_integrity_checks'::regproc);

  out := replace(
    src,
    'where p.personal_for_client_id is not null
    and not exists (select 1 from program_assignments pa
                    where pa.client_id=p.personal_for_client_id and pa.program_id=p.id and pa.active)',
    'where p.personal_for_client_id is not null
    and c.archived_at is null
    -- A dormant personal programme is what being on a block LOOKS like. This
    -- is critical only when the client has no active assignment at all.
    and not exists (select 1 from program_assignments pax
                    where pax.client_id = c.id and pax.active)
    and not exists (select 1 from program_assignments pa
                    where pa.client_id=p.personal_for_client_id and pa.program_id=p.id and pa.active)');
  if out = src then raise exception 'fragment 1 (personal programme) not found'; end if;
  src := out;

  out := replace(
    src,
    'and sw.scheduled_date >= v_today_ct
    and c.archived_at is null
    and not exists (select 1 from program_assignments pa
                    where pa.client_id=sw.client_id and pa.program_id=ph.program_id and pa.active)',
    'and sw.scheduled_date >= v_today_ct
    and sw.status = ''scheduled''
    and c.archived_at is null
    and not exists (select 1 from program_assignments pa
                    where pa.client_id=sw.client_id and pa.program_id=ph.program_id and pa.active)');
  if out = src then raise exception 'fragment 2 (day outside programme) not found'; end if;
  src := out;

  out := replace(
    src,
    'join clients c on c.id=x.client_id
  where c.archived_at is null and x.mx < v_today_ct + 14',
    'join clients c on c.id=x.client_id
  where c.archived_at is null and not coalesce(c.nutrition_only, false)
    and x.mx < v_today_ct + 14');
  if out = src then raise exception 'fragment 3 (coverage) not found'; end if;

  execute out;
end $$;
