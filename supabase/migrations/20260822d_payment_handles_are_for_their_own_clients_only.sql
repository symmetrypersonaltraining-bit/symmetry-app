-- A trainer's payment handles are for THEIR clients. Nobody else. Including me.
--
-- Dustin, 21 Aug 2026: "for this part, I do not want anyone but their own
-- clients seeing their pmt info."
--
-- WHY THIS IS NOT AN RLS POLICY
-- RLS is ROW-level. The three read policies on `trainers` already decide which
-- ROWS you see — your own, your trainer's if you are a client, all of them if
-- you are the owner — and the moment a row is visible, every column on it is.
-- There is no `using` clause that hides five columns of a row you are otherwise
-- allowed to read, and the surfaces that need those rows (a client seeing their
-- coach's name, the owner listing trainers) genuinely need them.
--
-- Postgres COLUMN privileges are the mechanism that draws that line, so SELECT
-- on the whole table is revoked and re-granted column by column, skipping the
-- five payment columns. A query asking for one now fails outright rather than
-- returning a null, which is the correct failure: silent nulls would have shown
-- a client an empty pay screen and nobody would have known why.
--
-- This applies to the OWNER too. Dustin cannot read another trainer's Venmo tag
-- through the table. That is the sentence quoted above, not an oversight.
--
-- INSERT/UPDATE are deliberately left alone: there is no INSERT or UPDATE
-- policy on `trainers` at all, so RLS denies every row and the privilege is
-- unreachable. Writes go through update_my_trainer_profile(), which is
-- SECURITY DEFINER and scoped to the caller's own row.

revoke select on public.trainers from authenticated;
revoke select on public.trainers from anon;

grant select (
  id, auth_user_id, email, name, first_name, role, active, created_at,
  avatar_url, bot_set
) on public.trainers to authenticated;

-- The gate. Two askers get an answer: the trainer themself, and a client of
-- that trainer. Everyone else gets zero rows — not an error, because a pay
-- destination that cannot be read must degrade to "not set up yet", never to a
-- blank client home screen.
create or replace function public.trainer_pay_details(p_trainer uuid)
returns table (
  recipient_name  text,
  venmo_username  text,
  zelle_email     text,
  cashapp_handle  text,
  pay_phone       text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_allowed boolean;
begin
  select p_trainer = public.my_trainer_id()
      or p_trainer = (select c.trainer_id
                        from public.clients c
                       where c.auth_user_id = auth.uid()
                       limit 1)
    into v_allowed;

  if not coalesce(v_allowed, false) then
    return;
  end if;

  return query
  select coalesce(nullif(btrim(t.pay_display_name), ''), t.name),
         t.venmo_username,
         t.zelle_email,
         t.cashapp_handle,
         t.pay_phone
    from public.trainers t
   where t.id = p_trainer;
end;
$$;

grant execute on function public.trainer_pay_details(uuid) to authenticated;
