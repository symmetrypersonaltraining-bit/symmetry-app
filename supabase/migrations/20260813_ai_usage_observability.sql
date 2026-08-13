-- ─────────────────────────────────────────────────────────────────────────────
-- AI observability — 2026-08-13
--
-- WHY: 23 routes call Claude and `ai_usage_log` only ever recorded SUCCESSES.
-- There is no status column, so a route that has been failing for a week is
-- indistinguishable from a route nobody used. That is exactly how the 8 Aug
-- outage ran unnoticed for two days, and how the movement screen has been
-- discarding every result it produces without anything surfacing it.
--
-- This migration is ADDITIVE ONLY. Nothing is dropped, nothing is rewritten,
-- no existing row changes meaning. Every new column is nullable or defaulted,
-- so code that predates it keeps working unchanged and a revert of the app
-- needs no revert of the database.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ai_usage_log
  -- 'ok' | 'error' | 'pending'. Defaulted to 'ok' so the ~650 historical rows,
  -- all of which were only ever written after a successful call, stay truthful.
  add column if not exists status text not null default 'ok',
  -- The failure message, truncated by the caller. Null on success.
  add column if not exists error text,
  -- Wall-clock ms from request start to completion. Null when unknown.
  add column if not exists latency_ms integer,
  -- When the attempt STARTED. The row is written before the model call and
  -- completed after, so a route that dies mid-call still leaves evidence.
  add column if not exists started_at timestamptz;

comment on column public.ai_usage_log.status is
  'ok | error | pending. Written pending before the model call, completed after. A row stuck at pending means the route died mid-call.';
comment on column public.ai_usage_log.error is
  'Failure message when status = error. Null otherwise.';
comment on column public.ai_usage_log.latency_ms is
  'Wall-clock milliseconds for the model call. Null when unknown.';
comment on column public.ai_usage_log.started_at is
  'When the attempt began, set at insert. created_at remains the row insert time.';

-- Backfill: historical rows have no start time. Use created_at so the health
-- page can order by attempt time without special-casing nulls.
update public.ai_usage_log set started_at = created_at where started_at is null;

-- The AI health page asks "per feature, when did this last succeed and when did
-- it last fail" over a rolling window. Without this it is a full scan of the
-- table on every page load, which gets slower every day the app is used.
create index if not exists idx_ai_usage_feature_created
  on public.ai_usage_log (feature, created_at desc);

create index if not exists idx_ai_usage_status_created
  on public.ai_usage_log (status, created_at desc)
  where status <> 'ok';
