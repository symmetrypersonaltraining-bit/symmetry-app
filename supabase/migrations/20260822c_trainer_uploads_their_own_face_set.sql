-- A trainer uploads their own twenty faces.
--
-- Dustin, 21 Aug: trainers get "their own avatar / bot persona set".
--
-- Dustin's and Stephanie's sets are folders committed to /public/bots. A
-- trainer joining next week cannot commit to the repo, so theirs go to storage
-- under assets/bots/<set>/, and faceSrc() resolves a set name beginning `u-`
-- to that public URL instead of a local path. A prefix rather than a second
-- column, so everything that already passes a set name around is untouched.
--
-- The `assets` bucket already exists, is public-read, caps files at 5 MB and
-- accepts images only — right for twenty stickers, and one fewer thing to get
-- wrong than a new bucket.

-- Only a trainer, and only into their OWN folder. The path is
-- bots/u-<trainer id>/<slug>.webp, so the second segment is the check.
create policy "trainer_writes_own_bot_faces"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = 'bots'
    and (storage.foldername(name))[2] = 'u-' || public.my_trainer_id()::text
  );

create policy "trainer_updates_own_bot_faces"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = 'bots'
    and (storage.foldername(name))[2] = 'u-' || public.my_trainer_id()::text
  );

create policy "trainer_deletes_own_bot_faces"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = 'bots'
    and (storage.foldername(name))[2] = 'u-' || public.my_trainer_id()::text
  );

create policy "bot_faces_are_publicly_readable"
  on storage.objects for select
  using (bucket_id = 'assets');

-- The set name is now `u-<uuid>`, 38 characters. The first version of this
-- validator capped at 31 and would have rejected every uploaded set while
-- still accepting the short built-in names. Caught before a trainer tried it.
create or replace function public.set_my_bot_set(p_bot_set text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_me uuid := public.my_trainer_id();
begin
  if v_me is null then raise exception 'Not a trainer' using errcode='42501'; end if;
  -- A folder name, not a path. No slashes, no dots, no traversal — this value
  -- is concatenated into an <img> src.
  if p_bot_set is not null and p_bot_set <> ''
     and p_bot_set !~ '^[a-z0-9][a-z0-9_-]{0,45}$' then
    raise exception 'A bot set is a short plain name — letters, numbers, dashes';
  end if;
  -- And if it claims to be an uploaded set, it has to be THIS trainer's.
  if p_bot_set like 'u-%' and p_bot_set <> 'u-' || v_me::text then
    raise exception 'That is not your avatar set' using errcode='42501';
  end if;
  update public.trainers set bot_set = nullif(btrim(p_bot_set), '') where id = v_me;
end;
$$;
