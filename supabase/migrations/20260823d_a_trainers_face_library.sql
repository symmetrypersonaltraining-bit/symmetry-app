-- A TRAINER'S FACE LIBRARY: MANY IMAGES PER SLOT, NOT ONE.
--
-- Dustin, 23 Aug: "can we create a library in all trainer apps to upload
-- avatars to be cycled through? a section for each type: group msg bot, ai
-- cards, celebrations, etc. needs to be coded so that you use those avatars in
-- appropriate places w proper emotions."
--
-- Most of that already existed and was half-true. `trainers.bot_set` and
-- 20260822c gave every trainer twenty named slots in `assets/bots/u-<id>/`, and
-- faceSrc() already picked a face by emotional register rather than by
-- filename. Three things were missing, and one of them was a live fault:
--
--   1. ONE image per slot. The upload wrote `<slug>.webp` with upsert:true, so
--      a second upload replaced the first. Nothing could be "cycled through".
--   2. No sections — twenty slots in one flat grid, with no answer to "which
--      ones matter most".
--   3. THE FALLBACK WAS A LIE. The upload screen said "anything you haven't
--      uploaded falls back to the standard set" and the walkthrough said "five
--      tonight and the rest at the weekend is completely fine". Neither was
--      true: setDir() chose ONE directory for the whole set, so an uploaded set
--      missing hydrate.webp emitted a URL for a file that is not there and
--      rendered a BROKEN IMAGE — on the trainer's own clients' screens, with
--      nothing to explain it. A trainer following the app's own advice would
--      have hit it immediately.
--
-- This table is (1). faceSrc resolving per SLUG rather than per set is (3), and
-- it is what makes a part-finished library an ordinary state. (2) is
-- FACE_SECTIONS in src/lib/ai/faceSlots.ts.
--
-- The row, not the file, is what the app reads. Listing a storage folder at
-- render time is not something a React component can do synchronously, and the
-- coach's whole library has to arrive with the coach or every card in the app
-- flickers one paint after it draws.
--
-- Storage RLS is unchanged and already covers this: 20260822c keys writes on
-- the folder being `bots/u-<my trainer id>/`, and these files live in exactly
-- that folder under a longer name.

create table if not exists public.trainer_face_variants (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references public.trainers(id) on delete cascade,
  -- One of FACE_SLUGS. Deliberately not an enum: the slot list lives in code
  -- beside the moods it mirrors, and a migration to add a face would be a
  -- migration nobody remembers to write.
  slug         text not null,
  storage_path text not null,
  ord          smallint not null default 0,
  created_at   timestamptz not null default now(),
  -- The same file cannot be registered twice, so a retried upload after a
  -- half-failed insert cannot leave two rows pointing at one image.
  unique (trainer_id, storage_path)
);

create index if not exists tfv_trainer_slug on public.trainer_face_variants (trainer_id, slug, ord);

alter table public.trainer_face_variants enable row level security;
revoke all on public.trainer_face_variants from public, anon;
grant select, insert, update, delete on public.trainer_face_variants to authenticated;

-- READ: anyone in this trainer's room. A client has to resolve their OWN
-- coach's faces — that is the whole point — and a trainer their own.
drop policy if exists tfv_read on public.trainer_face_variants;
create policy tfv_read on public.trainer_face_variants
  for select to authenticated
  using (trainer_id = public.my_group_trainer_id() or trainer_id = public.my_trainer_id());

-- WRITE: your own library only.
drop policy if exists tfv_write on public.trainer_face_variants;
create policy tfv_write on public.trainer_face_variants
  for all to authenticated
  using (trainer_id = public.my_trainer_id())
  with check (trainer_id = public.my_trainer_id());
