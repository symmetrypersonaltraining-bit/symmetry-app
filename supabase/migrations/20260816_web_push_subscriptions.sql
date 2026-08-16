-- Web Push subscriptions — the reason nobody was getting notified.
--
-- Dustin, 16 Aug: "Noone is chatting in the group chat. confirm they are
-- getting notification."
--
-- They were not, and it was not close. 29 active clients with logins; TWO rows
-- in device_tokens, his own and one other. Not "switched off" — only two
-- preference rows are disabled in the whole table. Nobody could receive a push
-- at all, because PushRegister returns immediately unless it is running inside
-- the Android APK (Capacitor.isNativePlatform()), and the service worker — the
-- thing that could reach everyone else — had no push handling in it whatsoever.
--
-- So 100 group messages in a fortnight went out and 27 people were never told
-- about any of them. The silence was not disinterest.
--
-- Web Push is the standard route: it works in the installed web app on Android
-- and on iOS 16.4+ when added to the home screen. No APK, no sideloading past a
-- Play Protect warning.
--
-- One row per BROWSER, not per user — the same person on a phone and a laptop
-- has two subscriptions and should be reached on both. The endpoint is the
-- natural key: the browser mints it, and re-subscribing on the same browser
-- returns the same endpoint, so upsert-on-endpoint keeps the table clean by
-- itself.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Set when the push service tells us the subscription is dead (404/410).
  -- Kept rather than deleted so "they used to have push and it lapsed" stays
  -- distinguishable from "they never set it up" — different conversations.
  failed_at   timestamptz,
  last_error  text
);

create unique index if not exists push_subscriptions_endpoint_key
  on public.push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id) where failed_at is null;

alter table public.push_subscriptions enable row level security;

-- A person manages their OWN subscriptions and nobody else's. The server sends
-- with the service role, which bypasses RLS, so nothing here needs to grant a
-- trainer read access to anyone's endpoints — an endpoint is a capability to
-- push to that device, and it should not be readable by another client.
drop policy if exists push_subs_select_own on public.push_subscriptions;
create policy push_subs_select_own on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists push_subs_insert_own on public.push_subscriptions;
create policy push_subs_insert_own on public.push_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists push_subs_update_own on public.push_subscriptions;
create policy push_subs_update_own on public.push_subscriptions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists push_subs_delete_own on public.push_subscriptions;
create policy push_subs_delete_own on public.push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);
