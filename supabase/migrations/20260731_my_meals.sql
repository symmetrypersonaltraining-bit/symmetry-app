-- My Meals: each client's reusable saved-meal library.
--
-- The table was created by hand in prod (mkfiginpiesospsnktea) during the v3
-- nutrition build and had NO migration in the repo, so a fresh environment came
-- up without it and every save silently fell into the client's "storage isn't
-- ready yet" fallback. This file captures the shape that is actually live —
-- verified against information_schema 2026-07-31 — so the repo and prod agree.
-- Written idempotently: running it against prod is a no-op.
--
-- Shape notes:
--   items  jsonb — CustomItem[] (see src/lib/nutrition/dailyTotals.ts), the
--                  same array a day-custom meal carries in
--                  item_overrides.__custom.items, which is why a saved meal can
--                  be dropped straight back into any slot.
--   totals jsonb — { kcal, protein, carbs, fats } cached at save time for the
--                  list view; the items remain the source of truth.
CREATE TABLE IF NOT EXISTS public.my_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  name text,
  items jsonb DEFAULT '[]'::jsonb,
  totals jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS my_meals_client_idx ON public.my_meals USING btree (client_id);

ALTER TABLE public.my_meals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.my_meals TO anon, authenticated;

-- Matches the app_anon_all pattern the other client-app tables in this project
-- already use. NOTE for a future hardening pass: this is permissive (every
-- authenticated session can read any client's library). Tightening it to
-- client_id-scoped policies is a project-wide change across all seven
-- app_anon_all tables, not a my_meals-only one — see the handoff.
DROP POLICY IF EXISTS app_anon_all ON public.my_meals;
CREATE POLICY app_anon_all ON public.my_meals FOR ALL USING (true) WITH CHECK (true);
