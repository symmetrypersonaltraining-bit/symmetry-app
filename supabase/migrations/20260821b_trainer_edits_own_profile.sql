-- A trainer sets up their own name, photo and payment handles.
--
-- Dustin, 21 Aug: "there has to be a way for a trainer to set up their own
-- payment details, their name, their photo, all of this stuff... this needs to
-- be set up exactly like mine."
--
-- Worth saying plainly: there was no "like mine" to copy. NOTHING in the app
-- has ever written to public.trainers — not one insert, not one update. Both
-- existing trainer rows were populated by hand in SQL, the Settings "Profile"
-- card is read-only text, and two items on the tutorial's own setup checklist
-- (profile photo, payment details) could not be completed by anybody, owner
-- included. This builds it for the first time, for everyone.
--
-- An RPC rather than an UPDATE policy, for one reason: RLS is row-level, so a
-- policy that lets a trainer edit their own row lets them edit EVERY column of
-- it — including `role`, which is how is_owner() decides who runs the place,
-- and `email`/`auth_user_id`, which is how my_trainer_id() decides who they
-- are. A trainer could promote themselves to owner and see the whole business.
-- This function writes eight columns and cannot be asked to write a ninth.
create or replace function public.update_my_trainer_profile(
  p_name              text default null,
  p_first_name        text default null,
  p_avatar_url        text default null,
  p_venmo_username    text default null,
  p_zelle_email       text default null,
  p_cashapp_handle    text default null,
  p_pay_phone         text default null,
  p_pay_display_name  text default null
)
returns public.trainers
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid := public.my_trainer_id();
  v_row public.trainers;
begin
  if v_id is null then
    raise exception 'Not a trainer' using errcode = '42501';
  end if;

  -- NULL means "leave this alone"; empty string means "clear it". Without the
  -- distinction, saving the form with one field blank would wipe every field
  -- the form did not happen to send.
  update public.trainers t
     set name             = coalesce(nullif(btrim(p_name), ''), t.name),
         first_name       = case when p_first_name is null then t.first_name
                                 else nullif(btrim(p_first_name), '') end,
         avatar_url       = case when p_avatar_url is null then t.avatar_url
                                 else nullif(btrim(p_avatar_url), '') end,
         venmo_username   = case when p_venmo_username is null then t.venmo_username
                                 else nullif(btrim(p_venmo_username), '') end,
         zelle_email      = case when p_zelle_email is null then t.zelle_email
                                 else nullif(btrim(p_zelle_email), '') end,
         cashapp_handle   = case when p_cashapp_handle is null then t.cashapp_handle
                                 else nullif(btrim(p_cashapp_handle), '') end,
         pay_phone        = case when p_pay_phone is null then t.pay_phone
                                 else nullif(btrim(p_pay_phone), '') end,
         pay_display_name = case when p_pay_display_name is null then t.pay_display_name
                                 else nullif(btrim(p_pay_display_name), '') end
   where t.id = v_id
  returning t.* into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_my_trainer_profile(text,text,text,text,text,text,text,text) from public;
grant execute on function public.update_my_trainer_profile(text,text,text,text,text,text,text,text) to authenticated;

comment on function public.update_my_trainer_profile is
  'A trainer edits their OWN name, photo and payment handles. Cannot touch role, email, auth_user_id or active — those decide who they are and what they can see.';
