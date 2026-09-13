-- EVERY AI NUMBER LEAVES A RECEIPT.
--
-- Dustin, 13 Sep 2026: "We need a log from these on all client apps so you can
-- catch where we need to improve ... build a log so I can have you check for
-- screw ups in future."
--
-- Three bad meals in three days were each found the same way: he noticed, and
-- then the row was reverse-engineered from meal_adherence_logs afterwards. What
-- that row cannot say is HOW the number was reached -- which food name was
-- asked for, which catalogue row answered, whether a page was read or a guess
-- was made, and what could not be priced at all. Without that, every fault is
-- found by the client and diagnosed by inference.
--
-- This records the pricing decision itself, once per AI nutrition request, on
-- every client's app. It is an audit trail, not a feature: nothing reads it in
-- the product.

create table if not exists public.ai_nutrition_log (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid references public.clients(id) on delete set null,
  -- Which door: parse | act | meal_edit | photo | plan_build | recipe_ai.
  surface        text not null,
  -- What the person actually said or sent, so a bad answer can be reproduced.
  request_text   text,
  model          text,
  intent         text,
  -- One entry per food: what was asked for, what answered, and from where.
  --   {requested, name, amount, unit, p, c, f, kcal, food_id, verified,
  --    estimated, source_url}
  items          jsonb not null default '[]'::jsonb,
  -- Names nothing could price. These contribute nothing to any total, so a
  -- non-empty array is a meal the client is looking at with a food missing.
  unresolved     text[] not null default '{}',
  totals         jsonb,
  -- Denormalised so a scan for trouble is an index hit, not a jsonb crawl.
  any_estimated  boolean not null default false,
  any_unresolved boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists ai_nutrition_log_client_time
  on public.ai_nutrition_log (client_id, created_at desc);
-- The audit query: show me everything that guessed or came up short.
create index if not exists ai_nutrition_log_trouble
  on public.ai_nutrition_log (created_at desc)
  where any_estimated or any_unresolved;

alter table public.ai_nutrition_log enable row level security;

-- Trainers read it; nothing else does. A client has no reason to see the
-- machinery behind their own number, and writes come from the service role.
drop policy if exists ai_nutrition_log_trainer_read on public.ai_nutrition_log;
create policy ai_nutrition_log_trainer_read on public.ai_nutrition_log
  for select to authenticated
  using (public.is_trainer());
