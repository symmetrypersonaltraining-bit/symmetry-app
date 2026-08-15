-- Shared meal library: let every client READ the library rows.
--
-- Library meals live in my_meals with a NULL client_id. The existing
-- my_meals_owner policy is `client_id = my_client_id() OR is_trainer()`, so
-- without this a library row is invisible to every client — and invisibly so,
-- because an RLS filter returns an empty list rather than an error. The picker
-- would simply show nothing and nobody would know why.
--
-- WRITES ARE UNCHANGED. my_meals_owner still governs INSERT/UPDATE/DELETE and
-- still demands client_id = my_client_id(), so a client can read a library meal
-- and copy it into their own list, and can never edit or delete the shared one.
--
-- ── Why this file exists, written the day it nearly did not ───────────────
--
-- This policy was first applied by hand to the live database through the
-- Supabase API, with no migration file. docs/DYLAN-INSTANCE.md warns about
-- exactly that, in these words:
--
--   "Every schema change ships as a file in supabase/migrations/ in the same
--    commit as the code that needs it. Not applied by hand to one database and
--    remembered later — that is precisely how 186 of them went missing."
--
-- Dustin asked, an hour later, whether Dylan's instance was getting these
-- updates. It would not have got this one. The code would have deployed to his
-- Vercel project and his clients would have opened an empty library, with
-- nothing in the logs to explain it. Caught because he asked.

drop policy if exists my_meals_library_read on public.my_meals;

create policy my_meals_library_read on public.my_meals
  for select using (client_id is null);
