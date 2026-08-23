-- THE TRAINER AGENT'S MEMORY BELONGS TO THE TRAINER, NOT TO THE INSTANCE.
--
-- `ai_chat_sessions` had no column naming a trainer. The agent drawer stored
-- ONE rolling thread keyed on nothing but the string 'trainer_agent', read and
-- written through the service role. With a single trainer that read as "his
-- conversation". The moment a second trainer signed in it meant something else
-- entirely:
--
--   * Brooke opening the drawer read Dustin's thread verbatim — which is a
--     transcript of him discussing named clients, their injuries and their
--     money.
--   * Her first question overwrote it.
--   * Her "Clear" deleted it.
--
-- None of that surfaced an error. The row was simply the newest one.
--
-- owner_user_id is the auth user the thread belongs to. Nullable because the
-- table also predates this and a null row is nobody's — only the owner can see
-- one, so an unclaimed row cannot leak sideways. The table was empty when this
-- ran (verified), so there is nothing to backfill and no bak_ table needed.
--
-- The API routes use the service role and therefore bypass all of this; the
-- policy is the second line, not the first. The first is the .eq() they now
-- carry.

alter table public.ai_chat_sessions
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

create index if not exists ai_chat_sessions_trainer_thread
  on public.ai_chat_sessions (context_type, owner_user_id, updated_at desc);

drop policy if exists trainer_all_ai_chat on public.ai_chat_sessions;
create policy trainer_own_ai_chat on public.ai_chat_sessions
  for all to authenticated
  using (owner_user_id = auth.uid() or (owner_user_id is null and public.is_owner()))
  with check (owner_user_id = auth.uid() or (owner_user_id is null and public.is_owner()));
