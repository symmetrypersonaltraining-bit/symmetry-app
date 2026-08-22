-- Each trainer decides which bots and cards run in THEIR app.
--
-- Dustin, 21 Aug: "they need... access to decide what bots and cards they use
-- and how they function on their app only" — Coach Bot, the birthday bot, the
-- weekly focus sweep, and their own avatar set.
--
-- Those first three were app_flags, which is GLOBAL: one switch for the whole
-- business. Justin turning Coach Bot off would have silenced it in Dustin's
-- group chat too, with nothing recording who did it. app_flags stays as the
-- master switch — owner only as of this morning — and a per-trainer row decides
-- what happens inside each trainer's own app underneath it.
--
-- BOTH have to be on. The owner can take a feature off the whole business
-- without visiting three settings screens, and a trainer can decline a feature
-- the owner has enabled. Neither can force the other's hand.
create table if not exists public.trainer_features (
  trainer_id        uuid primary key references public.trainers(id) on delete cascade,
  coachbot_enabled  boolean not null default true,
  birthdays_enabled boolean not null default true,
  weekly_focus_enabled boolean not null default true,
  updated_at        timestamptz not null default now()
);

alter table public.trainer_features enable row level security;

create policy "trainer_manages_own_features"
  on public.trainer_features for all to authenticated
  using (trainer_id = public.my_trainer_id())
  with check (trainer_id = public.my_trainer_id());

-- The owner can read what everyone chose, because he is the one who gets asked
-- why a client did not get a birthday message.
create policy "owner_reads_all_features"
  on public.trainer_features for select to authenticated
  using (public.is_owner());

-- Everyone starts with everything on: the app behaves exactly as it does today
-- until somebody deliberately turns something off.
insert into public.trainer_features (trainer_id)
select id from public.trainers
on conflict (trainer_id) do nothing;

-- One answer, so a cron job and a settings screen cannot disagree.
create or replace function public.trainer_feature_on(p_trainer uuid, p_feature text)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select case p_feature
    when 'coachbot'     then coalesce((select coachbot_enabled     from public.trainer_features where trainer_id = p_trainer), true)
                             and coalesce((select enabled from public.app_flags where key = 'coachbot_live'), false)
    when 'birthdays'    then coalesce((select birthdays_enabled    from public.trainer_features where trainer_id = p_trainer), true)
                             and coalesce((select enabled from public.app_flags where key = 'birthday_bot_live'), false)
    when 'weekly_focus' then coalesce((select weekly_focus_enabled from public.trainer_features where trainer_id = p_trainer), true)
    else false
  end;
$$;

comment on function public.trainer_feature_on is
  'Is this feature live for this trainer? The app-wide flag AND the trainer''s own choice must both allow it. A missing per-trainer row reads as ON, so a trainer added tomorrow behaves normally.';

grant execute on function public.trainer_feature_on(uuid, text) to authenticated;

-- A trainer's own avatar set already had a home — trainers.bot_set names a
-- folder of 20 faces under /public/bots. It simply had no way to be set from
-- inside the app, like everything else on that row.
create or replace function public.set_my_bot_set(p_bot_set text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := public.my_trainer_id();
begin
  if v_me is null then raise exception 'Not a trainer' using errcode='42501'; end if;
  -- A folder name, not a path. Anything else is a way to point the app's
  -- <img> tags somewhere they should not go.
  if p_bot_set is not null and p_bot_set <> '' and p_bot_set !~ '^[a-z0-9][a-z0-9_-]{0,30}$' then
    raise exception 'A bot set is a short plain name — letters, numbers, dashes';
  end if;
  update public.trainers set bot_set = nullif(btrim(p_bot_set), '') where id = v_me;
end;
$$;

revoke all on function public.set_my_bot_set(text) from public;
grant execute on function public.set_my_bot_set(text) to authenticated;
