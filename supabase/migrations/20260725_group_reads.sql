-- Per-user group-chat read tracking so group (is_group=true) messages get
-- per-recipient unread — additive, non-destructive. Applied to prod
-- (mkfiginpiesospsnktea) 2026-07-25.
CREATE TABLE IF NOT EXISTS public.group_reads (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_reads ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.group_reads TO anon, authenticated;

DROP POLICY IF EXISTS group_reads_select_own ON public.group_reads;
CREATE POLICY group_reads_select_own ON public.group_reads
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS group_reads_insert_own ON public.group_reads;
CREATE POLICY group_reads_insert_own ON public.group_reads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS group_reads_update_own ON public.group_reads;
CREATE POLICY group_reads_update_own ON public.group_reads
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
