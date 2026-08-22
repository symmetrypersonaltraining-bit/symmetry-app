-- Each trainer's clients get their own group chat, challenges and leaderboard.
--
-- Dustin, 21 Aug: "split per trainer — each has their own", and then, when it
-- mattered: "my clients should not be effected by splitting the group chat. my
-- clients continue to see my app's group chat. each trainer gets their own set
-- up for their clients only."
--
-- So this migration MOVES NOTHING. All 168 existing group messages and all 4
-- challenges are stamped to the owner, which is where they already effectively
-- lived — his clients open the app tomorrow and see the same room, the same
-- history, the same names. What changes is only that a NEW trainer's clients
-- get an empty room of their own instead of walking into his.
--
-- Backups first: bak_messages_group_20260821, bak_group_challenges_20260821.
--
-- `Anyone reads group messages` was `USING (is_group = true)` — literally
-- anyone signed in, including another trainer's client.
alter table public.messages
  add column if not exists group_trainer_id uuid references public.trainers(id);
alter table public.group_challenges
  add column if not exists trainer_id uuid references public.trainers(id);

update public.messages
   set group_trainer_id = (select id from public.trainers where role = 'owner' limit 1)
 where is_group and group_trainer_id is null;

update public.group_challenges
   set trainer_id = (select id from public.trainers where role = 'owner' limit 1)
 where trainer_id is null;

create index if not exists idx_messages_group_trainer
  on public.messages (group_trainer_id) where is_group;
create index if not exists idx_group_challenges_trainer
  on public.group_challenges (trainer_id);

create or replace function public.my_group_trainer_id()
returns uuid language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    public.my_trainer_id(),
    (select c.trainer_id from public.clients c where c.auth_user_id = auth.uid() limit 1)
  );
$$;

comment on function public.my_group_trainer_id is
  'The group room this person belongs to: a trainer''s own, or a client''s trainer''s. NULL means no room.';

drop policy if exists "Anyone reads group messages" on public.messages;

create policy "read_own_group_messages"
  on public.messages for select to authenticated
  using (
    is_group = true
    and group_trainer_id is not null
    and group_trainer_id = public.my_group_trainer_id()
  );

create or replace function public.stamp_group_message()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.is_group then
    new.group_trainer_id := coalesce(new.group_trainer_id, public.my_group_trainer_id());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_group_message on public.messages;
create trigger trg_stamp_group_message
  before insert on public.messages
  for each row execute function public.stamp_group_message();

drop policy if exists "group_challenges_select" on public.group_challenges;
drop policy if exists "group_challenges_update" on public.group_challenges;
drop policy if exists "group_challenges_delete" on public.group_challenges;

create policy "read_own_group_challenges"
  on public.group_challenges for select to authenticated
  using (trainer_id = public.my_group_trainer_id());

create policy "trainer_updates_own_challenges"
  on public.group_challenges for update to authenticated
  using (public.is_trainer() and trainer_id = public.my_trainer_id())
  with check (public.is_trainer() and trainer_id = public.my_trainer_id());

create policy "trainer_deletes_own_challenges"
  on public.group_challenges for delete to authenticated
  using (public.is_trainer() and trainer_id = public.my_trainer_id());

create or replace function public.stamp_group_challenge()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.trainer_id := coalesce(new.trainer_id, public.my_trainer_id());
  return new;
end;
$$;

drop trigger if exists trg_stamp_group_challenge on public.group_challenges;
create trigger trg_stamp_group_challenge
  before insert on public.group_challenges
  for each row execute function public.stamp_group_challenge();
