-- Permanent, per-client memory for the coach.
--
-- Dustin, 2026-08-13: "I need you to confirm that the AI, when dealing with
-- clients, is going to have a memory of what it's talked about with them in the
-- past and how far back that goes. It needs to be permanent, so it always
-- remembers what it talked about with them and uses that data for each client
-- individually."
--
-- It did not. ai_chat_sessions had zero rows for every client, ever, and the
-- coach sheet said so out loud in a comment: "Fresh conversation each open (no
-- persistence tonight)." A client who explained in September that they travel
-- on Tuesdays, cannot stand cottage cheese, and get a shoulder flare on
-- overhead press had to explain all three again in October.
--
-- TWO TABLES, BECAUSE "PERMANENT" AND "SENT EVERY TIME" CANNOT BE THE SAME
-- THING. A year of conversation is far too much to hand the model on every
-- message: it would be slow, it would be expensive, and the two sentences that
-- matter would drown in three hundred that do not.
--
--   ai_chat_turns   — every turn, both sides, forever. The record. Only the
--                     newest handful is ever sent verbatim.
--   ai_client_memory— one row per client: a running picture that IS sent on
--                     every message. New turns fold into it periodically, so it
--                     stays current without re-reading the whole history.

-- ── the permanent transcript ────────────────────────────────────────────────
create table if not exists public.ai_chat_turns (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  role        text not null check (role in ('client', 'coach')),
  content     text not null,
  -- Which screen it was said on. "I'm sore" means something different typed on
  -- the workout tab than typed on the nutrition tab.
  surface     text,
  created_at  timestamptz not null default now()
);

-- The read is always "this client, newest first", and the fold is always "this
-- client, everything since a timestamp".
create index if not exists ai_chat_turns_client_time
  on public.ai_chat_turns (client_id, created_at desc);

-- ── the running picture ─────────────────────────────────────────────────────
create table if not exists public.ai_client_memory (
  client_id      uuid primary key references public.clients(id) on delete cascade,
  -- Prose. What this client has told the coach about themselves, in the
  -- coach's words, written to be read aloud into a prompt.
  summary        text not null default '',
  -- Discrete durable facts, each with the date it was said, so the coach can
  -- say "you mentioned in September" instead of asserting it timelessly.
  -- [{ "fact": "...", "said_on": "2026-09-04" }, ...]
  facts          jsonb not null default '[]'::jsonb,
  -- Everything at or before this instant is already reflected in summary/facts.
  -- The fold reads only what is newer, so it stays cheap forever.
  folded_through timestamptz,
  turn_count     integer not null default 0,
  updated_at     timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Everything the coach writes here is written by the service role. These
-- policies are so a client can see their own history and the trainer can see
-- everyone's; nobody can read anybody else's.
alter table public.ai_chat_turns    enable row level security;
alter table public.ai_client_memory enable row level security;

drop policy if exists ai_chat_turns_read on public.ai_chat_turns;
create policy ai_chat_turns_read on public.ai_chat_turns
  for select using (
    public.is_trainer()
    or client_id in (select id from public.clients where auth_user_id = auth.uid())
  );

drop policy if exists ai_client_memory_read on public.ai_client_memory;
create policy ai_client_memory_read on public.ai_client_memory
  for select using (
    public.is_trainer()
    or client_id in (select id from public.clients where auth_user_id = auth.uid())
  );

-- Deliberately no insert/update/delete policy for either table. Memory is
-- written by the server on the client's behalf; a client editing what the coach
-- remembers about them, from the browser, is not a feature.
