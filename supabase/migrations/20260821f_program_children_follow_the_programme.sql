-- The tables under a programme inherit its walls.
--
-- Each one walks up to its programme and asks the same two questions, so a
-- child can never be more visible than its parent. Read and write are split:
-- a house template (owner_trainer_id null) is READABLE by every trainer and
-- CHANGEABLE by none but the owner — otherwise the first trainer to tweak a
-- corrective track would silently rewrite it for everybody.
--
-- Separate policies per command rather than one FOR ALL, because FOR ALL takes
-- a single expression and this genuinely needs two.

-- ── phases ────────────────────────────────────────────────────────────────
drop policy if exists "trainer_all_phases" on public.phases;
create policy "trainer_reads_phases" on public.phases for select to authenticated
  using (public.trainer_can_use_program(program_id));
create policy "trainer_writes_phases" on public.phases for insert to authenticated
  with check (public.trainer_can_edit_program(program_id));
create policy "trainer_updates_phases" on public.phases for update to authenticated
  using (public.trainer_can_edit_program(program_id))
  with check (public.trainer_can_edit_program(program_id));
create policy "trainer_deletes_phases" on public.phases for delete to authenticated
  using (public.trainer_can_edit_program(program_id));

-- ── days ──────────────────────────────────────────────────────────────────
drop policy if exists "trainer_all_days" on public.days;
create policy "trainer_reads_days" on public.days for select to authenticated
  using (exists (select 1 from public.phases ph
                  where ph.id = days.phase_id
                    and public.trainer_can_use_program(ph.program_id)));
create policy "trainer_writes_days" on public.days for insert to authenticated
  with check (exists (select 1 from public.phases ph
                       where ph.id = days.phase_id
                         and public.trainer_can_edit_program(ph.program_id)));
create policy "trainer_updates_days" on public.days for update to authenticated
  using (exists (select 1 from public.phases ph
                  where ph.id = days.phase_id
                    and public.trainer_can_edit_program(ph.program_id)))
  with check (exists (select 1 from public.phases ph
                       where ph.id = days.phase_id
                         and public.trainer_can_edit_program(ph.program_id)));
create policy "trainer_deletes_days" on public.days for delete to authenticated
  using (exists (select 1 from public.phases ph
                  where ph.id = days.phase_id
                    and public.trainer_can_edit_program(ph.program_id)));

-- ── sections ──────────────────────────────────────────────────────────────
drop policy if exists "trainer_all_sections" on public.sections;
create policy "trainer_reads_sections" on public.sections for select to authenticated
  using (exists (select 1 from public.days d join public.phases ph on ph.id = d.phase_id
                  where d.id = sections.day_id
                    and public.trainer_can_use_program(ph.program_id)));
create policy "trainer_writes_sections" on public.sections for insert to authenticated
  with check (exists (select 1 from public.days d join public.phases ph on ph.id = d.phase_id
                       where d.id = sections.day_id
                         and public.trainer_can_edit_program(ph.program_id)));
create policy "trainer_updates_sections" on public.sections for update to authenticated
  using (exists (select 1 from public.days d join public.phases ph on ph.id = d.phase_id
                  where d.id = sections.day_id
                    and public.trainer_can_edit_program(ph.program_id)))
  with check (exists (select 1 from public.days d join public.phases ph on ph.id = d.phase_id
                       where d.id = sections.day_id
                         and public.trainer_can_edit_program(ph.program_id)));
create policy "trainer_deletes_sections" on public.sections for delete to authenticated
  using (exists (select 1 from public.days d join public.phases ph on ph.id = d.phase_id
                  where d.id = sections.day_id
                    and public.trainer_can_edit_program(ph.program_id)));

-- ── prescribed_exercises ──────────────────────────────────────────────────
drop policy if exists "trainer_all_pe" on public.prescribed_exercises;
create policy "trainer_reads_pe" on public.prescribed_exercises for select to authenticated
  using (exists (select 1 from public.sections s join public.days d on d.id = s.day_id
                          join public.phases ph on ph.id = d.phase_id
                  where s.id = prescribed_exercises.section_id
                    and public.trainer_can_use_program(ph.program_id)));
create policy "trainer_writes_pe" on public.prescribed_exercises for insert to authenticated
  with check (exists (select 1 from public.sections s join public.days d on d.id = s.day_id
                               join public.phases ph on ph.id = d.phase_id
                       where s.id = prescribed_exercises.section_id
                         and public.trainer_can_edit_program(ph.program_id)));
create policy "trainer_updates_pe" on public.prescribed_exercises for update to authenticated
  using (exists (select 1 from public.sections s join public.days d on d.id = s.day_id
                          join public.phases ph on ph.id = d.phase_id
                  where s.id = prescribed_exercises.section_id
                    and public.trainer_can_edit_program(ph.program_id)))
  with check (exists (select 1 from public.sections s join public.days d on d.id = s.day_id
                               join public.phases ph on ph.id = d.phase_id
                       where s.id = prescribed_exercises.section_id
                         and public.trainer_can_edit_program(ph.program_id)));
create policy "trainer_deletes_pe" on public.prescribed_exercises for delete to authenticated
  using (exists (select 1 from public.sections s join public.days d on d.id = s.day_id
                          join public.phases ph on ph.id = d.phase_id
                  where s.id = prescribed_exercises.section_id
                    and public.trainer_can_edit_program(ph.program_id)));

-- ── program_versions ──────────────────────────────────────────────────────
drop policy if exists "trainer_all_program_versions" on public.program_versions;
create policy "trainer_reads_program_versions" on public.program_versions for select to authenticated
  using (public.trainer_can_use_program(program_id));
create policy "trainer_edits_program_versions" on public.program_versions for all to authenticated
  using (public.trainer_can_edit_program(program_id))
  with check (public.trainer_can_edit_program(program_id));

-- ── programs itself ───────────────────────────────────────────────────────
drop policy if exists "trainer_all_programs" on public.programs;
create policy "trainer_reads_programs" on public.programs for select to authenticated
  using (public.is_owner()
         or (public.is_trainer()
             and (owner_trainer_id is null or owner_trainer_id = public.my_trainer_id())));
create policy "trainer_creates_programs" on public.programs for insert to authenticated
  with check (public.is_trainer());
create policy "trainer_updates_programs" on public.programs for update to authenticated
  using (public.is_owner() or owner_trainer_id = public.my_trainer_id())
  with check (public.is_owner() or owner_trainer_id = public.my_trainer_id());
create policy "trainer_deletes_programs" on public.programs for delete to authenticated
  using (public.is_owner() or owner_trainer_id = public.my_trainer_id());

-- Speed: every policy above walks these edges on every row it checks.
create index if not exists idx_phases_program on public.phases (program_id);
create index if not exists idx_days_phase on public.days (phase_id);
create index if not exists idx_sections_day on public.sections (day_id);
create index if not exists idx_pe_section on public.prescribed_exercises (section_id);
