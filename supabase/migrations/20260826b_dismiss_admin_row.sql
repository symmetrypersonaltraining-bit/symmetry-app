-- THE X ON TODAY'S ADMIN HAS NEVER ONCE WORKED.
--
-- Dustin, 26 Aug: "programming running out won't let me clear".
-- admin_dismissals has had zero rows in it since the day it shipped.
--
-- The client wrote:
--     .upsert({...}, { onConflict: "trainer_id,row_key,subject_id" })
--
-- but the unique index from 20260824a is on an EXPRESSION:
--     (trainer_id, row_key, COALESCE(subject_id, '000...'::uuid))
--
-- Postgres matches an ON CONFLICT target against an index, not against a list
-- of column names that look similar, so every call was rejected outright with
-- 42P10 -- before it ever mattered whether a row already existed. Not a
-- conflict-handling bug: the insert never happened at all. The optimistic
-- update in the client was doing its job perfectly the whole time, putting the
-- row back and saying so.
--
-- The expression index is the RIGHT index, and 20260824a says why: NULL is not
-- distinct from NULL in a plain unique index, so a bare (trainer_id, row_key,
-- subject_id) index would happily store the same whole-row dismissal a hundred
-- times over. Rather than weaken the index to suit what PostgREST can express,
-- the write moves in here where ON CONFLICT can name the same expression.
--
-- SECURITY DEFINER, but it derives the trainer from my_trainer_id() and takes
-- no trainer parameter, so a caller can only ever dismiss their own rows.
create or replace function public.dismiss_admin_row(
  p_row_key text,
  p_until date,
  p_subject_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trainer uuid := public.my_trainer_id();
begin
  if v_trainer is null then
    raise exception 'no trainer for this user';
  end if;
  if p_row_key is null or length(trim(p_row_key)) = 0 then
    raise exception 'row_key is required';
  end if;

  insert into public.admin_dismissals (trainer_id, row_key, subject_id, until, dismissed_at)
  values (v_trainer, p_row_key, p_subject_id, p_until, now())
  on conflict (trainer_id, row_key, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set until = excluded.until, dismissed_at = excluded.dismissed_at;
end;
$$;

revoke all on function public.dismiss_admin_row(text, date, uuid) from public, anon;
grant execute on function public.dismiss_admin_row(text, date, uuid) to authenticated;
