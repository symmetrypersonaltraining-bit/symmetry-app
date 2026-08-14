-- Goals on the Progress screen. See src/lib/goals.ts for the maths and the two
-- decisions it turns on; this is only the storage.
--
-- Four decisions Dustin made in the mock-up round:
--   METRICS   body weight and composition only.
--   WHO SETS  both — and his are visible AS his, and are refusable.
--   OFF TRACK honest, plus one specific fix in real numbers.
--   MISSED    rolls forward at the pace actually achieved; the old attempt
--             stays visible. Nothing framed as a failure, nothing hidden.
--
-- start_value / start_date are STORED, not derived. Computing the start as
-- "the earliest weigh-in before the goal" breaks the moment somebody backfills
-- an old weight or corrects one: the goal silently re-anchors and the progress
-- meter jumps with nothing explaining why. Where a person started is a fact
-- about the day the goal was set.
--
-- status is not a boolean because five of its six values carry meaning the
-- client will read. 'rolled' is deliberately not called 'missed' or 'failed',
-- and 'declined' is kept rather than deleted — "he suggested 138 and I said
-- that was too aggressive" is exactly the conversation worth still having in
-- three months.

create table if not exists public.client_goals (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  metric        text not null check (metric in ('weight', 'body_fat_pct', 'lean_mass')),
  target_value  numeric not null,
  target_date   date not null,
  start_value   numeric,
  start_date    date,
  set_by        text not null check (set_by in ('trainer', 'client')),
  status        text not null default 'active'
                check (status in ('proposed', 'active', 'hit', 'rolled', 'declined', 'closed')),
  rolled_from_id uuid references public.client_goals(id) on delete set null,
  rolled_to_id   uuid references public.client_goals(id) on delete set null,
  note          text,
  accepted_at   timestamptz,
  achieved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ONE running goal per metric per client, enforced by the database.
--
-- Two active weight goals means two goal lines on the chart and two "required
-- rates" for the coach, which would have to pick one without being able to say
-- why. Learned the same night as the duplicate-days bug: if the database does
-- not forbid it, it happens, and it gets found later by a confused person
-- rather than by an error. 'proposed' counts as running — nobody should be
-- looking at two competing suggestions for the same number.
create unique index if not exists uq_client_goal_one_active_per_metric
  on public.client_goals (client_id, metric)
  where status in ('proposed', 'active');

create index if not exists idx_client_goals_client on public.client_goals (client_id, status);

alter table public.client_goals enable row level security;

-- Same shape as `metrics`, the closest existing analogue.
create policy client_rw_goals on public.client_goals
  for all using (client_id = my_client_id()) with check (client_id = my_client_id());
create policy trainer_all_goals on public.client_goals
  for all using (is_trainer()) with check (is_trainer());
