// ─────────────────────────────────────────────
// Symmetry Personal Training — Database Types
// ─────────────────────────────────────────────

export type Client = {
  id: string;
  name: string;
  email: string | null;
  auth_user_id: string | null;
  created_at: string;
};

export type Program = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type ProgramAssignment = {
  id: string;
  client_id: string;
  program_id: string;
  start_date: string | null;
  active: boolean;
  created_at: string;
};

export type Phase = {
  id: string;
  program_id: string;
  label: string;
  position: number;
  week_start: number | null;
  week_end: number | null;
};

export type Day = {
  id: string;
  phase_id: string;
  label: string;
  position: number;
  day_of_week: number | null;
  notes: string | null;
};

export type Section = {
  id: string;
  day_id: string;
  label: string;
  position: number;
  notes: string | null;
};

export type Exercise = {
  id: string;
  name: string;
  category: string | null;
  muscle_group: string | null;
  equipment: string | null;
  unilateral: boolean;
};

export type PrescribedExercise = {
  id: string;
  section_id: string;
  exercise_id: string;
  position: number;
  sets: number;
  volume_type: "reps" | "rep_range" | "duration" | "distance" | "hold_pattern";
  volume_value: string | null;
  unilateral: boolean;
  tempo: string | null;
  load_descriptor: string | null;
  cue: string | null;
  rest: string | null;
  superset_group: string | null;
  intensity_type: string | null;
  use_drop_sets: boolean;
  use_rest_pause: boolean;
  use_partials: boolean;
  alternate_of: string | null;
  exercise?: Exercise;
};

export type WorkoutLog = {
  id: string;
  client_id: string;
  day_id: string;
  log_date: string;
  started_at: string | null;
  completed_at: string | null;
  completed: boolean;
  duration_minutes: number | null;
  note: string | null;
  created_at: string;
};

export type SetLog = {
  id: string;
  workout_log_id: string;
  prescribed_exercise_id: string;
  client_id: string;
  set_number: number;
  weight_lbs: number | null;
  weight: number | null; // legacy column
  reps: number | null;
  rpe: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  completed: boolean;
  notes: string | null;
  logged_at: string;
  created_at: string;
};

export type BodyWeightLog = {
  id: string;
  client_id: string;
  weight_lbs: number;
  body_fat_pct: number | null;
  notes: string | null;
  logged_at: string;
  created_at: string;
};

// ─── Composed/enriched types ────────────────

export type DayWithSections = Day & {
  sections: (Section & {
    prescribed_exercises: PrescribedExercise[];
  })[];
};

export type WorkoutLogWithSets = WorkoutLog & {
  set_logs: SetLog[];
};
