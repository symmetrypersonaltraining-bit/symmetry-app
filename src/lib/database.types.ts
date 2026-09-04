// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Regenerate with (Git Bash, never PowerShell — PowerShell's `>` writes UTF-16
// and the file will not parse):
//
//   npx supabase login
//   npx supabase gen types typescript --project-id "mkfiginpiesospsnktea" \
//     --schema public > src/lib/database.types.ts
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// Nothing has ever bound the type checker to the actual database. Types were
// written by hand at each query site as inline casts:
//
//   const existingLog = (existingLogs as { id: string; completed: boolean;
//     set_logs: unknown[] }[] | null)?.[0] ?? null;
//
// A cast is an assertion, not a check. Rename a column in Postgres and every
// one of those keeps compiling and starts returning undefined at runtime. This
// file is the shape the database ACTUALLY has, so that once the Supabase client
// factories are parameterised with it, a wrong table or column name becomes a
// compile error instead of a silent null on somebody's phone.
//
// ── Two things to know before relying on it ─────────────────────────────────
//
// 1. THERE ARE NO POSTGRES ENUMS IN THIS DATABASE. The `Enums` block below is
//    literally `[_ in never]: never`. Every constrained column — billing_type,
//    status, source — is `text` with a CHECK constraint, and `gen types` cannot
//    see CHECK constraints. So `billing_type` generates as `string | null`, NOT
//    a union of the five allowed values. Any plan that says "extract the
//    billing_type union from the generated types" has nothing to extract; the
//    column has to become a real pg_enum first, or the union has to come from
//    somewhere else.
//
// 2. IT INCLUDES THE 44 REMAINING bak_* BACKUP TABLES. Cosmetic noise, not a
//    fault. They disappear from here when they are dropped.
//
// Generated 3 Sep 2026 against project mkfiginpiesospsnktea (Postgres 17.6).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_dismissals: {
        Row: {
          dismissed_at: string
          id: string
          row_key: string
          subject_id: string | null
          trainer_id: string
          until: string
        }
        Insert: {
          dismissed_at?: string
          id?: string
          row_key: string
          subject_id?: string | null
          trainer_id: string
          until: string
        }
        Update: {
          dismissed_at?: string
          id?: string
          row_key?: string
          subject_id?: string | null
          trainer_id?: string
          until?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_dismissals_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_action_log: {
        Row: {
          action: string
          actor: string
          client_id: string | null
          created_at: string
          id: string
          summary: string
          undo: Json | null
          undo_error: string | null
          undone_at: string | null
        }
        Insert: {
          action: string
          actor?: string
          client_id?: string | null
          created_at?: string
          id?: string
          summary: string
          undo?: Json | null
          undo_error?: string | null
          undone_at?: string | null
        }
        Update: {
          action?: string
          actor?: string
          client_id?: string | null
          created_at?: string
          id?: string
          summary?: string
          undo?: Json | null
          undo_error?: string | null
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "ai_action_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_action_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_action_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_action_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      ai_chat_sessions: {
        Row: {
          client_id: string | null
          context_type: string | null
          created_at: string | null
          id: string
          messages: Json | null
          owner_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          context_type?: string | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          owner_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          context_type?: string | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          owner_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "ai_chat_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_chat_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_chat_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_chat_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      ai_chat_turns: {
        Row: {
          client_id: string
          content: string
          created_at: string
          id: string
          role: string
          surface: string | null
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string
          id?: string
          role: string
          surface?: string | null
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
          surface?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_turns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_turns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "ai_chat_turns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_chat_turns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_chat_turns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_turns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_chat_turns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      ai_client_memory: {
        Row: {
          client_id: string
          facts: Json
          folded_through: string | null
          summary: string
          turn_count: number
          updated_at: string
        }
        Insert: {
          client_id: string
          facts?: Json
          folded_through?: string | null
          summary?: string
          turn_count?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          facts?: Json
          folded_through?: string | null
          summary?: string
          turn_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_client_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_client_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "ai_client_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_client_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_client_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_client_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_client_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      ai_nudge_log: {
        Row: {
          body: string | null
          client_id: string
          created_at: string
          id: string
          segment: string
          sent: boolean
          suppressed: string | null
          tone: string | null
        }
        Insert: {
          body?: string | null
          client_id: string
          created_at?: string
          id?: string
          segment: string
          sent?: boolean
          suppressed?: string | null
          tone?: string | null
        }
        Update: {
          body?: string | null
          client_id?: string
          created_at?: string
          id?: string
          segment?: string
          sent?: boolean
          suppressed?: string | null
          tone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_nudge_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_nudge_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "ai_nudge_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_nudge_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_nudge_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_nudge_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_nudge_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      ai_program_drafts: {
        Row: {
          ai_reasoning: string | null
          approved_at: string | null
          block_end_date: string | null
          block_start_date: string | null
          cardio_sessions: string[] | null
          client_id: string
          created_at: string | null
          id: string
          phase: string
          program_name: string
          status: string | null
          trainer_notes: string | null
          updated_at: string | null
          week_a_sessions: string[] | null
          week_b_sessions: string[] | null
        }
        Insert: {
          ai_reasoning?: string | null
          approved_at?: string | null
          block_end_date?: string | null
          block_start_date?: string | null
          cardio_sessions?: string[] | null
          client_id: string
          created_at?: string | null
          id?: string
          phase: string
          program_name: string
          status?: string | null
          trainer_notes?: string | null
          updated_at?: string | null
          week_a_sessions?: string[] | null
          week_b_sessions?: string[] | null
        }
        Update: {
          ai_reasoning?: string | null
          approved_at?: string | null
          block_end_date?: string | null
          block_start_date?: string | null
          cardio_sessions?: string[] | null
          client_id?: string
          created_at?: string | null
          id?: string
          phase?: string
          program_name?: string
          status?: string | null
          trainer_notes?: string | null
          updated_at?: string | null
          week_a_sessions?: string[] | null
          week_b_sessions?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_program_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_program_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "ai_program_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_program_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_program_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_program_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "ai_program_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          client_id: string | null
          cost_usd: number | null
          created_at: string | null
          error: string | null
          feature: string | null
          id: string
          latency_ms: number | null
          model: string | null
          started_at: string | null
          status: string
          tokens_in: number | null
          tokens_out: number | null
          trainer_id: string | null
          used_on: string | null
        }
        Insert: {
          client_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          error?: string | null
          feature?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          started_at?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          trainer_id?: string | null
          used_on?: string | null
        }
        Update: {
          client_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          error?: string | null
          feature?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          started_at?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          trainer_id?: string | null
          used_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      app_api_keys: {
        Row: {
          name: string
          note: string | null
          updated_at: string
          value: string
        }
        Insert: {
          name: string
          note?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          name?: string
          note?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      app_feedback: {
        Row: {
          app_instance: string | null
          app_version: string | null
          change_summary: string | null
          client_context: string | null
          client_id: string | null
          commit_sha: string | null
          created_at: string
          id: string
          image_summary: string | null
          photo_url: string | null
          preview_url: string | null
          reported_by: string | null
          resolved_at: string | null
          screenshot_url: string | null
          source: string | null
          status: string
          trainer_email: string | null
          transcript: string
          user_agent: string | null
        }
        Insert: {
          app_instance?: string | null
          app_version?: string | null
          change_summary?: string | null
          client_context?: string | null
          client_id?: string | null
          commit_sha?: string | null
          created_at?: string
          id?: string
          image_summary?: string | null
          photo_url?: string | null
          preview_url?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          screenshot_url?: string | null
          source?: string | null
          status?: string
          trainer_email?: string | null
          transcript: string
          user_agent?: string | null
        }
        Update: {
          app_instance?: string | null
          app_version?: string | null
          change_summary?: string | null
          client_context?: string | null
          client_id?: string | null
          commit_sha?: string | null
          created_at?: string
          id?: string
          image_summary?: string | null
          photo_url?: string | null
          preview_url?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          screenshot_url?: string | null
          source?: string | null
          status?: string
          trainer_email?: string | null
          transcript?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "app_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "app_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "app_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "app_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      app_flags: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_scheduler_key: {
        Row: {
          created_at: string
          id: number
          key: string
          rotated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          key: string
          rotated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          key?: string
          rotated_at?: string | null
        }
        Relationships: []
      }
      app_users: {
        Row: {
          auth_user_id: string | null
          client_id: string | null
          created_at: string | null
          display_name: string | null
          id: string
          role: string
        }
        Insert: {
          auth_user_id?: string | null
          client_id?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          role?: string
        }
        Update: {
          auth_user_id?: string | null
          client_id?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "app_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "app_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "app_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "app_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      appointments: {
        Row: {
          assessment_name: string | null
          cancellation_notice_hours: number | null
          client_id: string | null
          created_at: string | null
          ends_at: string | null
          gcal_cancelled_at: string | null
          gcal_color_id: string | null
          gcal_event_id: string | null
          gcal_recurring_id: string | null
          google_event_id: string | null
          id: string
          notes: string | null
          scheduled_at: string
          source: string
          status: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          assessment_name?: string | null
          cancellation_notice_hours?: number | null
          client_id?: string | null
          created_at?: string | null
          ends_at?: string | null
          gcal_cancelled_at?: string | null
          gcal_color_id?: string | null
          gcal_event_id?: string | null
          gcal_recurring_id?: string | null
          google_event_id?: string | null
          id?: string
          notes?: string | null
          scheduled_at: string
          source?: string
          status?: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          assessment_name?: string | null
          cancellation_notice_hours?: number | null
          client_id?: string | null
          created_at?: string | null
          ends_at?: string | null
          gcal_cancelled_at?: string | null
          gcal_color_id?: string | null
          gcal_event_id?: string | null
          gcal_recurring_id?: string | null
          google_event_id?: string | null
          id?: string
          notes?: string | null
          scheduled_at?: string
          source?: string
          status?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      bak_ai_nudge_log_20260827: {
        Row: {
          body: string | null
          client_id: string | null
          created_at: string | null
          id: string | null
          segment: string | null
          sent: boolean | null
          suppressed: string | null
          tone: string | null
        }
        Insert: {
          body?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string | null
          segment?: string | null
          sent?: boolean | null
          suppressed?: string | null
          tone?: string | null
        }
        Update: {
          body?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string | null
          segment?: string | null
          sent?: boolean | null
          suppressed?: string | null
          tone?: string | null
        }
        Relationships: []
      }
      bak_calendar_payments_noamount_20260829: {
        Row: {
          amount: number | null
          cadence: string | null
          client_id: string | null
          created_at: string | null
          google_event_id: string | null
          has_reminder: boolean | null
          id: string | null
          payment_date: string | null
          source: string | null
          synced_at: string | null
          title: string | null
        }
        Insert: {
          amount?: number | null
          cadence?: string | null
          client_id?: string | null
          created_at?: string | null
          google_event_id?: string | null
          has_reminder?: boolean | null
          id?: string | null
          payment_date?: string | null
          source?: string | null
          synced_at?: string | null
          title?: string | null
        }
        Update: {
          amount?: number | null
          cadence?: string | null
          client_id?: string | null
          created_at?: string | null
          google_event_id?: string | null
          has_reminder?: boolean | null
          id?: string | null
          payment_date?: string | null
          source?: string | null
          synced_at?: string | null
          title?: string | null
        }
        Relationships: []
      }
      bak_chestpress_swap_20260831: {
        Row: {
          alternate_of: string | null
          captured_at: string | null
          created_at: string | null
          cue: string | null
          exercise_id: string | null
          id: string | null
          intensity_type: string | null
          load_descriptor: string | null
          position: number | null
          rest: string | null
          section_id: string | null
          sets: number | null
          superset_group: string | null
          tempo: string | null
          tracked_fields: string[] | null
          unilateral: boolean | null
          use_drop_sets: boolean | null
          use_partials: boolean | null
          use_rest_pause: boolean | null
          volume_type: string | null
          volume_value: string | null
        }
        Insert: {
          alternate_of?: string | null
          captured_at?: string | null
          created_at?: string | null
          cue?: string | null
          exercise_id?: string | null
          id?: string | null
          intensity_type?: string | null
          load_descriptor?: string | null
          position?: number | null
          rest?: string | null
          section_id?: string | null
          sets?: number | null
          superset_group?: string | null
          tempo?: string | null
          tracked_fields?: string[] | null
          unilateral?: boolean | null
          use_drop_sets?: boolean | null
          use_partials?: boolean | null
          use_rest_pause?: boolean | null
          volume_type?: string | null
          volume_value?: string | null
        }
        Update: {
          alternate_of?: string | null
          captured_at?: string | null
          created_at?: string | null
          cue?: string | null
          exercise_id?: string | null
          id?: string | null
          intensity_type?: string | null
          load_descriptor?: string | null
          position?: number | null
          rest?: string | null
          section_id?: string | null
          sets?: number | null
          superset_group?: string | null
          tempo?: string | null
          tracked_fields?: string[] | null
          unilateral?: boolean | null
          use_drop_sets?: boolean | null
          use_partials?: boolean | null
          use_rest_pause?: boolean | null
          volume_type?: string | null
          volume_value?: string | null
        }
        Relationships: []
      }
      bak_christine_calpay_20260831: {
        Row: {
          amount: number | null
          cadence: string | null
          client_id: string | null
          created_at: string | null
          google_event_id: string | null
          has_reminder: boolean | null
          id: string | null
          payment_date: string | null
          source: string | null
          synced_at: string | null
          title: string | null
        }
        Insert: {
          amount?: number | null
          cadence?: string | null
          client_id?: string | null
          created_at?: string | null
          google_event_id?: string | null
          has_reminder?: boolean | null
          id?: string | null
          payment_date?: string | null
          source?: string | null
          synced_at?: string | null
          title?: string | null
        }
        Update: {
          amount?: number | null
          cadence?: string | null
          client_id?: string | null
          created_at?: string | null
          google_event_id?: string | null
          has_reminder?: boolean | null
          id?: string | null
          payment_date?: string | null
          source?: string | null
          synced_at?: string | null
          title?: string | null
        }
        Relationships: []
      }
      bak_christine_dupe_20260831: {
        Row: {
          amount_due: number | null
          approved_at: string | null
          billing_credits: number | null
          client_ack_at: string | null
          client_id: string | null
          created_at: string | null
          credit_details: Json | null
          due_date: string | null
          email_sent_at: string | null
          google_event_id: string | null
          half_price_sessions: number | null
          id: string | null
          notes: string | null
          notification_status: string | null
          paid_confirmed_at: string | null
          reminder_sent_at: string | null
          sms_message: string | null
          sms_sent_at: string | null
        }
        Insert: {
          amount_due?: number | null
          approved_at?: string | null
          billing_credits?: number | null
          client_ack_at?: string | null
          client_id?: string | null
          created_at?: string | null
          credit_details?: Json | null
          due_date?: string | null
          email_sent_at?: string | null
          google_event_id?: string | null
          half_price_sessions?: number | null
          id?: string | null
          notes?: string | null
          notification_status?: string | null
          paid_confirmed_at?: string | null
          reminder_sent_at?: string | null
          sms_message?: string | null
          sms_sent_at?: string | null
        }
        Update: {
          amount_due?: number | null
          approved_at?: string | null
          billing_credits?: number | null
          client_ack_at?: string | null
          client_id?: string | null
          created_at?: string | null
          credit_details?: Json | null
          due_date?: string | null
          email_sent_at?: string | null
          google_event_id?: string | null
          half_price_sessions?: number | null
          id?: string | null
          notes?: string | null
          notification_status?: string | null
          paid_confirmed_at?: string | null
          reminder_sent_at?: string | null
          sms_message?: string | null
          sms_sent_at?: string | null
        }
        Relationships: []
      }
      bak_claudine_empty_prog_20260902: {
        Row: {
          id: string | null
          src: string | null
          v1: string | null
          v2: string | null
        }
        Insert: {
          id?: string | null
          src?: string | null
          v1?: string | null
          v2?: string | null
        }
        Update: {
          id?: string | null
          src?: string | null
          v1?: string | null
          v2?: string | null
        }
        Relationships: []
      }
      bak_claudine_legacy_cardio_20260902: {
        Row: {
          appointment_id: string | null
          assignment_id: string | null
          client_id: string | null
          created_at: string | null
          day_id: string | null
          deleted_at: string | null
          id: string | null
          moved_by: string | null
          moved_from_date: string | null
          position: number | null
          published_workout_id: string | null
          scheduled_date: string | null
          source: string | null
          status: string | null
          supervised: boolean | null
          updated_at: string | null
          workout_log_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string | null
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string | null
          supervised?: boolean | null
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string | null
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string | null
          supervised?: boolean | null
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Relationships: []
      }
      bak_claudine_supersets_20260831: {
        Row: {
          alternate_of: string | null
          captured_at: string | null
          created_at: string | null
          cue: string | null
          exercise_id: string | null
          id: string | null
          intensity_type: string | null
          load_descriptor: string | null
          position: number | null
          rest: string | null
          section_id: string | null
          sets: number | null
          superset_group: string | null
          tempo: string | null
          tracked_fields: string[] | null
          unilateral: boolean | null
          use_drop_sets: boolean | null
          use_partials: boolean | null
          use_rest_pause: boolean | null
          volume_type: string | null
          volume_value: string | null
        }
        Insert: {
          alternate_of?: string | null
          captured_at?: string | null
          created_at?: string | null
          cue?: string | null
          exercise_id?: string | null
          id?: string | null
          intensity_type?: string | null
          load_descriptor?: string | null
          position?: number | null
          rest?: string | null
          section_id?: string | null
          sets?: number | null
          superset_group?: string | null
          tempo?: string | null
          tracked_fields?: string[] | null
          unilateral?: boolean | null
          use_drop_sets?: boolean | null
          use_partials?: boolean | null
          use_rest_pause?: boolean | null
          volume_type?: string | null
          volume_value?: string | null
        }
        Update: {
          alternate_of?: string | null
          captured_at?: string | null
          created_at?: string | null
          cue?: string | null
          exercise_id?: string | null
          id?: string | null
          intensity_type?: string | null
          load_descriptor?: string | null
          position?: number | null
          rest?: string | null
          section_id?: string | null
          sets?: number | null
          superset_group?: string | null
          tempo?: string | null
          tracked_fields?: string[] | null
          unilateral?: boolean | null
          use_drop_sets?: boolean | null
          use_partials?: boolean | null
          use_rest_pause?: boolean | null
          volume_type?: string | null
          volume_value?: string | null
        }
        Relationships: []
      }
      bak_client_program_feedback_20260901: {
        Row: {
          answer: string | null
          answered_at: string | null
          asked_at: string | null
          client_id: string | null
          client_name: string | null
          delivered_at: string | null
          id: string | null
          question: string | null
          taken_at: string | null
          week_start: string | null
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          asked_at?: string | null
          client_id?: string | null
          client_name?: string | null
          delivered_at?: string | null
          id?: string | null
          question?: string | null
          taken_at?: string | null
          week_start?: string | null
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          asked_at?: string | null
          client_id?: string | null
          client_name?: string | null
          delivered_at?: string | null
          id?: string | null
          question?: string | null
          taken_at?: string | null
          week_start?: string | null
        }
        Relationships: []
      }
      bak_clients_archive_20260829: {
        Row: {
          archive_effective_on: string | null
          archived_at: string | null
          id: string | null
          name: string | null
          payment_reminders_enabled: boolean | null
          taken_at: string | null
        }
        Insert: {
          archive_effective_on?: string | null
          archived_at?: string | null
          id?: string | null
          name?: string | null
          payment_reminders_enabled?: boolean | null
          taken_at?: string | null
        }
        Update: {
          archive_effective_on?: string | null
          archived_at?: string | null
          id?: string | null
          name?: string | null
          payment_reminders_enabled?: boolean | null
          taken_at?: string | null
        }
        Relationships: []
      }
      bak_clients_billing_20260829: {
        Row: {
          billing_anchor_day: number | null
          billing_anchor_day_2: number | null
          billing_cadence: string | null
          billing_type: string | null
          current_fees: number | null
          expected_sessions_per_cycle: number | null
          flat_billing: boolean | null
          id: string | null
          name: string | null
          payment_reminders_enabled: boolean | null
          session_rate: number | null
          taken_at: string | null
          training_frequency: number | null
        }
        Insert: {
          billing_anchor_day?: number | null
          billing_anchor_day_2?: number | null
          billing_cadence?: string | null
          billing_type?: string | null
          current_fees?: number | null
          expected_sessions_per_cycle?: number | null
          flat_billing?: boolean | null
          id?: string | null
          name?: string | null
          payment_reminders_enabled?: boolean | null
          session_rate?: number | null
          taken_at?: string | null
          training_frequency?: number | null
        }
        Update: {
          billing_anchor_day?: number | null
          billing_anchor_day_2?: number | null
          billing_cadence?: string | null
          billing_type?: string | null
          current_fees?: number | null
          expected_sessions_per_cycle?: number | null
          flat_billing?: boolean | null
          id?: string | null
          name?: string | null
          payment_reminders_enabled?: boolean | null
          session_rate?: number | null
          taken_at?: string | null
          training_frequency?: number | null
        }
        Relationships: []
      }
      bak_clients_weight_20260903: {
        Row: {
          backed_up_at: string | null
          current_body_fat_pct: number | null
          current_weight: number | null
          id: string | null
          name: string | null
        }
        Insert: {
          backed_up_at?: string | null
          current_body_fat_pct?: number | null
          current_weight?: number | null
          id?: string | null
          name?: string | null
        }
        Update: {
          backed_up_at?: string | null
          current_body_fat_pct?: number | null
          current_weight?: number | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
      bak_days_claudine_labels_20260901: {
        Row: {
          client_owner_id: string | null
          created_at: string | null
          created_by: string | null
          day_of_week: number | null
          id: string | null
          label: string | null
          origin: string | null
          phase_id: string | null
          position: number | null
          swappable: boolean | null
          swapped_from_day_id: string | null
        }
        Insert: {
          client_owner_id?: string | null
          created_at?: string | null
          created_by?: string | null
          day_of_week?: number | null
          id?: string | null
          label?: string | null
          origin?: string | null
          phase_id?: string | null
          position?: number | null
          swappable?: boolean | null
          swapped_from_day_id?: string | null
        }
        Update: {
          client_owner_id?: string | null
          created_at?: string | null
          created_by?: string | null
          day_of_week?: number | null
          id?: string | null
          label?: string | null
          origin?: string | null
          phase_id?: string | null
          position?: number | null
          swappable?: boolean | null
          swapped_from_day_id?: string | null
        }
        Relationships: []
      }
      bak_days_labels_20260901_rename: {
        Row: {
          backed_up_at: string | null
          created_at: string | null
          id: string | null
          label: string | null
          phase_id: string | null
          position: number | null
        }
        Insert: {
          backed_up_at?: string | null
          created_at?: string | null
          id?: string | null
          label?: string | null
          phase_id?: string | null
          position?: number | null
        }
        Update: {
          backed_up_at?: string | null
          created_at?: string | null
          id?: string | null
          label?: string | null
          phase_id?: string | null
          position?: number | null
        }
        Relationships: []
      }
      bak_dropped_tables_manifest_20260902: {
        Row: {
          decision: string | null
          recorded_at: string | null
          row_count: number | null
          size_bytes: number | null
          size_pretty: string | null
          table_name: string
        }
        Insert: {
          decision?: string | null
          recorded_at?: string | null
          row_count?: number | null
          size_bytes?: number | null
          size_pretty?: string | null
          table_name: string
        }
        Update: {
          decision?: string | null
          recorded_at?: string | null
          row_count?: number | null
          size_bytes?: number | null
          size_pretty?: string | null
          table_name?: string
        }
        Relationships: []
      }
      bak_dustin_m5_20260827: {
        Row: {
          adherence: string | null
          analysis_status: string | null
          client_id: string | null
          created_at: string | null
          est_carbs: number | null
          est_fats: number | null
          est_fiber: number | null
          est_kcal: number | null
          est_micros: Json | null
          est_protein: number | null
          est_sat_fat: number | null
          est_sodium: number | null
          est_sugar: number | null
          food_id: string | null
          id: string | null
          item_overrides: Json | null
          log_date: string | null
          macros_pending: boolean | null
          meal_id: string | null
          meal_position: number | null
          notes: string | null
          off_plan_details: string | null
          off_plan_macros: Json | null
          off_plan_notes: string | null
          photo_url: string | null
          servings: number | null
          source: string | null
          trainer_macro_override: Json | null
        }
        Insert: {
          adherence?: string | null
          analysis_status?: string | null
          client_id?: string | null
          created_at?: string | null
          est_carbs?: number | null
          est_fats?: number | null
          est_fiber?: number | null
          est_kcal?: number | null
          est_micros?: Json | null
          est_protein?: number | null
          est_sat_fat?: number | null
          est_sodium?: number | null
          est_sugar?: number | null
          food_id?: string | null
          id?: string | null
          item_overrides?: Json | null
          log_date?: string | null
          macros_pending?: boolean | null
          meal_id?: string | null
          meal_position?: number | null
          notes?: string | null
          off_plan_details?: string | null
          off_plan_macros?: Json | null
          off_plan_notes?: string | null
          photo_url?: string | null
          servings?: number | null
          source?: string | null
          trainer_macro_override?: Json | null
        }
        Update: {
          adherence?: string | null
          analysis_status?: string | null
          client_id?: string | null
          created_at?: string | null
          est_carbs?: number | null
          est_fats?: number | null
          est_fiber?: number | null
          est_kcal?: number | null
          est_micros?: Json | null
          est_protein?: number | null
          est_sat_fat?: number | null
          est_sodium?: number | null
          est_sugar?: number | null
          food_id?: string | null
          id?: string | null
          item_overrides?: Json | null
          log_date?: string | null
          macros_pending?: boolean | null
          meal_id?: string | null
          meal_position?: number | null
          notes?: string | null
          off_plan_details?: string | null
          off_plan_macros?: Json | null
          off_plan_notes?: string | null
          photo_url?: string | null
          servings?: number | null
          source?: string | null
          trainer_macro_override?: Json | null
        }
        Relationships: []
      }
      bak_fn_grants_20260902: {
        Row: {
          anon_could: boolean | null
          auth_could: boolean | null
          captured_at: string | null
          fn_args: string | null
          fn_def: string | null
          fn_name: unknown
          svc_could: boolean | null
        }
        Insert: {
          anon_could?: boolean | null
          auth_could?: boolean | null
          captured_at?: string | null
          fn_args?: string | null
          fn_def?: string | null
          fn_name?: unknown
          svc_could?: boolean | null
        }
        Update: {
          anon_could?: boolean | null
          auth_could?: boolean | null
          captured_at?: string | null
          fn_args?: string | null
          fn_def?: string | null
          fn_name?: unknown
          svc_could?: boolean | null
        }
        Relationships: []
      }
      bak_generate_due_payment_reminders_20260901: {
        Row: {
          def: string | null
          proname: unknown
          taken_at: string | null
        }
        Insert: {
          def?: string | null
          proname?: unknown
          taken_at?: string | null
        }
        Update: {
          def?: string | null
          proname?: unknown
          taken_at?: string | null
        }
        Relationships: []
      }
      bak_hassan_billing_20260901: {
        Row: {
          amount_due: number | null
          approved_at: string | null
          billing_credits: number | null
          captured_at: string | null
          client_ack_at: string | null
          client_id: string | null
          created_at: string | null
          credit_details: Json | null
          due_date: string | null
          email_sent_at: string | null
          google_event_id: string | null
          half_price_sessions: number | null
          id: string | null
          notes: string | null
          notification_status: string | null
          paid_confirmed_at: string | null
          reminder_sent_at: string | null
          sms_message: string | null
          sms_sent_at: string | null
        }
        Insert: {
          amount_due?: number | null
          approved_at?: string | null
          billing_credits?: number | null
          captured_at?: string | null
          client_ack_at?: string | null
          client_id?: string | null
          created_at?: string | null
          credit_details?: Json | null
          due_date?: string | null
          email_sent_at?: string | null
          google_event_id?: string | null
          half_price_sessions?: number | null
          id?: string | null
          notes?: string | null
          notification_status?: string | null
          paid_confirmed_at?: string | null
          reminder_sent_at?: string | null
          sms_message?: string | null
          sms_sent_at?: string | null
        }
        Update: {
          amount_due?: number | null
          approved_at?: string | null
          billing_credits?: number | null
          captured_at?: string | null
          client_ack_at?: string | null
          client_id?: string | null
          created_at?: string | null
          credit_details?: Json | null
          due_date?: string | null
          email_sent_at?: string | null
          google_event_id?: string | null
          half_price_sessions?: number | null
          id?: string | null
          notes?: string | null
          notification_status?: string | null
          paid_confirmed_at?: string | null
          reminder_sent_at?: string | null
          sms_message?: string | null
          sms_sent_at?: string | null
        }
        Relationships: []
      }
      bak_hassan_client_20260901: {
        Row: {
          ai_focus: string | null
          ai_focus_date: string | null
          ai_focus_question: string | null
          ai_focus_question_date: string | null
          ai_food_focus: string | null
          ai_food_focus_week: string | null
          archive_effective_on: string | null
          archived_at: string | null
          assessment_id: string | null
          auth_user_id: string | null
          avatar_url: string | null
          billing_anchor_day: number | null
          billing_anchor_day_2: number | null
          billing_anchor_weekday: number | null
          billing_cadence: string | null
          billing_type: string | null
          captured_at: string | null
          created_at: string | null
          current_body_fat_pct: number | null
          current_fees: number | null
          current_weight: number | null
          date_of_birth: string | null
          days_per_week: number | null
          digest_snoozed_until: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          exclude_from_rankings: boolean | null
          expected_sessions_per_cycle: number | null
          experience_level: string | null
          flat_billing: boolean | null
          id: string | null
          injuries: string | null
          injuries_limitations: string | null
          is_self_coached: boolean | null
          medical_notes: string | null
          movement_screen_enabled: boolean | null
          name: string | null
          notes: string | null
          nutrition_only: boolean | null
          onboarding_complete: boolean | null
          online_only: boolean | null
          paid_by_client_id: string | null
          payment_reminders_enabled: boolean | null
          phone: string | null
          plan_locked: boolean | null
          primary_goal: string | null
          secondary_goals: string | null
          session_rate: number | null
          slug: string | null
          start_date: string | null
          trainer_id: string | null
          training_days: string | null
          training_frequency: number | null
          updated_at: string | null
          week_brief_seen_week: string | null
          weekly_focus: string | null
          weekly_focus_source: string | null
          weekly_focus_week: string | null
        }
        Insert: {
          ai_focus?: string | null
          ai_focus_date?: string | null
          ai_focus_question?: string | null
          ai_focus_question_date?: string | null
          ai_food_focus?: string | null
          ai_food_focus_week?: string | null
          archive_effective_on?: string | null
          archived_at?: string | null
          assessment_id?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          billing_anchor_day?: number | null
          billing_anchor_day_2?: number | null
          billing_anchor_weekday?: number | null
          billing_cadence?: string | null
          billing_type?: string | null
          captured_at?: string | null
          created_at?: string | null
          current_body_fat_pct?: number | null
          current_fees?: number | null
          current_weight?: number | null
          date_of_birth?: string | null
          days_per_week?: number | null
          digest_snoozed_until?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          exclude_from_rankings?: boolean | null
          expected_sessions_per_cycle?: number | null
          experience_level?: string | null
          flat_billing?: boolean | null
          id?: string | null
          injuries?: string | null
          injuries_limitations?: string | null
          is_self_coached?: boolean | null
          medical_notes?: string | null
          movement_screen_enabled?: boolean | null
          name?: string | null
          notes?: string | null
          nutrition_only?: boolean | null
          onboarding_complete?: boolean | null
          online_only?: boolean | null
          paid_by_client_id?: string | null
          payment_reminders_enabled?: boolean | null
          phone?: string | null
          plan_locked?: boolean | null
          primary_goal?: string | null
          secondary_goals?: string | null
          session_rate?: number | null
          slug?: string | null
          start_date?: string | null
          trainer_id?: string | null
          training_days?: string | null
          training_frequency?: number | null
          updated_at?: string | null
          week_brief_seen_week?: string | null
          weekly_focus?: string | null
          weekly_focus_source?: string | null
          weekly_focus_week?: string | null
        }
        Update: {
          ai_focus?: string | null
          ai_focus_date?: string | null
          ai_focus_question?: string | null
          ai_focus_question_date?: string | null
          ai_food_focus?: string | null
          ai_food_focus_week?: string | null
          archive_effective_on?: string | null
          archived_at?: string | null
          assessment_id?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          billing_anchor_day?: number | null
          billing_anchor_day_2?: number | null
          billing_anchor_weekday?: number | null
          billing_cadence?: string | null
          billing_type?: string | null
          captured_at?: string | null
          created_at?: string | null
          current_body_fat_pct?: number | null
          current_fees?: number | null
          current_weight?: number | null
          date_of_birth?: string | null
          days_per_week?: number | null
          digest_snoozed_until?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          exclude_from_rankings?: boolean | null
          expected_sessions_per_cycle?: number | null
          experience_level?: string | null
          flat_billing?: boolean | null
          id?: string | null
          injuries?: string | null
          injuries_limitations?: string | null
          is_self_coached?: boolean | null
          medical_notes?: string | null
          movement_screen_enabled?: boolean | null
          name?: string | null
          notes?: string | null
          nutrition_only?: boolean | null
          onboarding_complete?: boolean | null
          online_only?: boolean | null
          paid_by_client_id?: string | null
          payment_reminders_enabled?: boolean | null
          phone?: string | null
          plan_locked?: boolean | null
          primary_goal?: string | null
          secondary_goals?: string | null
          session_rate?: number | null
          slug?: string | null
          start_date?: string | null
          trainer_id?: string | null
          training_days?: string | null
          training_frequency?: number | null
          updated_at?: string | null
          week_brief_seen_week?: string | null
          weekly_focus?: string | null
          weekly_focus_source?: string | null
          weekly_focus_week?: string | null
        }
        Relationships: []
      }
      bak_hassan_meals_20260831: {
        Row: {
          amount: number | null
          basis: string | null
          captured_at: string | null
          carbs: number | null
          created_at: string | null
          fats: number | null
          food: string | null
          id: string | null
          is_unlimited: boolean | null
          kcal: number | null
          meal_id: string | null
          micros: Json | null
          position: number | null
          protein: number | null
          unit: string | null
        }
        Insert: {
          amount?: number | null
          basis?: string | null
          captured_at?: string | null
          carbs?: number | null
          created_at?: string | null
          fats?: number | null
          food?: string | null
          id?: string | null
          is_unlimited?: boolean | null
          kcal?: number | null
          meal_id?: string | null
          micros?: Json | null
          position?: number | null
          protein?: number | null
          unit?: string | null
        }
        Update: {
          amount?: number | null
          basis?: string | null
          captured_at?: string | null
          carbs?: number | null
          created_at?: string | null
          fats?: number | null
          food?: string | null
          id?: string | null
          is_unlimited?: boolean | null
          kcal?: number | null
          meal_id?: string | null
          micros?: Json | null
          position?: number | null
          protein?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      bak_integrity_checks_multi_active_20260902: {
        Row: {
          check_name: string | null
          count: number | null
          detail: Json | null
          id: number | null
          ran_at: string | null
          severity: string | null
        }
        Insert: {
          check_name?: string | null
          count?: number | null
          detail?: Json | null
          id?: number | null
          ran_at?: string | null
          severity?: string | null
        }
        Update: {
          check_name?: string | null
          count?: number | null
          detail?: Json | null
          id?: number | null
          ran_at?: string | null
          severity?: string | null
        }
        Relationships: []
      }
      bak_jenn_corrective_superseded_20260901: {
        Row: {
          appointment_id: string | null
          assignment_id: string | null
          client_id: string | null
          created_at: string | null
          day_id: string | null
          deleted_at: string | null
          id: string | null
          moved_by: string | null
          moved_from_date: string | null
          position: number | null
          published_workout_id: string | null
          scheduled_date: string | null
          source: string | null
          status: string | null
          supervised: boolean | null
          updated_at: string | null
          workout_log_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string | null
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string | null
          supervised?: boolean | null
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string | null
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string | null
          supervised?: boolean | null
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Relationships: []
      }
      bak_jenn_moved_completed_20260901: {
        Row: {
          id: string | null
          src: string | null
          v1: string | null
          v2: string | null
          v3: string | null
        }
        Insert: {
          id?: string | null
          src?: string | null
          v1?: string | null
          v2?: string | null
          v3?: string | null
        }
        Update: {
          id?: string | null
          src?: string | null
          v1?: string | null
          v2?: string | null
          v3?: string | null
        }
        Relationships: []
      }
      bak_jennifer_wrongcopy_20260901_assign: {
        Row: {
          active: boolean | null
          assigned_at: string | null
          client_id: string | null
          combination_group: string | null
          current_day_in_rotation: number | null
          current_phase_id: string | null
          id: string | null
          program_id: string | null
        }
        Insert: {
          active?: boolean | null
          assigned_at?: string | null
          client_id?: string | null
          combination_group?: string | null
          current_day_in_rotation?: number | null
          current_phase_id?: string | null
          id?: string | null
          program_id?: string | null
        }
        Update: {
          active?: boolean | null
          assigned_at?: string | null
          client_id?: string | null
          combination_group?: string | null
          current_day_in_rotation?: number | null
          current_phase_id?: string | null
          id?: string | null
          program_id?: string | null
        }
        Relationships: []
      }
      bak_jennifer_wrongcopy_20260901_sw: {
        Row: {
          appointment_id: string | null
          assignment_id: string | null
          client_id: string | null
          created_at: string | null
          day_id: string | null
          deleted_at: string | null
          id: string | null
          moved_by: string | null
          moved_from_date: string | null
          position: number | null
          published_workout_id: string | null
          scheduled_date: string | null
          source: string | null
          status: string | null
          supervised: boolean | null
          updated_at: string | null
          workout_log_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string | null
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string | null
          supervised?: boolean | null
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string | null
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string | null
          supervised?: boolean | null
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Relationships: []
      }
      bak_lauren_reopen_20260902: {
        Row: {
          id: string | null
          src: string | null
          v1: string | null
          v2: string | null
          v3: string | null
        }
        Insert: {
          id?: string | null
          src?: string | null
          v1?: string | null
          v2?: string | null
          v3?: string | null
        }
        Update: {
          id?: string | null
          src?: string | null
          v1?: string | null
          v2?: string | null
          v3?: string | null
        }
        Relationships: []
      }
      bak_meal_plans_archived_clients_20260901: {
        Row: {
          change_reason: string | null
          client_id: string | null
          created_at: string | null
          created_by_client: boolean | null
          day_group: number[] | null
          effective_date: string | null
          id: string | null
          status: string | null
          taken_at: string | null
          title: string | null
          version_number: number | null
        }
        Insert: {
          change_reason?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by_client?: boolean | null
          day_group?: number[] | null
          effective_date?: string | null
          id?: string | null
          status?: string | null
          taken_at?: string | null
          title?: string | null
          version_number?: number | null
        }
        Update: {
          change_reason?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by_client?: boolean | null
          day_group?: number[] | null
          effective_date?: string | null
          id?: string | null
          status?: string | null
          taken_at?: string | null
          title?: string | null
          version_number?: number | null
        }
        Relationships: []
      }
      bak_payment_reminders_20260829_billing: {
        Row: {
          amount_due: number | null
          approved_at: string | null
          billing_credits: number | null
          client_ack_at: string | null
          client_id: string | null
          created_at: string | null
          credit_details: Json | null
          due_date: string | null
          email_sent_at: string | null
          google_event_id: string | null
          half_price_sessions: number | null
          id: string | null
          notes: string | null
          notification_status: string | null
          paid_confirmed_at: string | null
          reminder_sent_at: string | null
          sms_message: string | null
          sms_sent_at: string | null
          taken_at: string | null
        }
        Insert: {
          amount_due?: number | null
          approved_at?: string | null
          billing_credits?: number | null
          client_ack_at?: string | null
          client_id?: string | null
          created_at?: string | null
          credit_details?: Json | null
          due_date?: string | null
          email_sent_at?: string | null
          google_event_id?: string | null
          half_price_sessions?: number | null
          id?: string | null
          notes?: string | null
          notification_status?: string | null
          paid_confirmed_at?: string | null
          reminder_sent_at?: string | null
          sms_message?: string | null
          sms_sent_at?: string | null
          taken_at?: string | null
        }
        Update: {
          amount_due?: number | null
          approved_at?: string | null
          billing_credits?: number | null
          client_ack_at?: string | null
          client_id?: string | null
          created_at?: string | null
          credit_details?: Json | null
          due_date?: string | null
          email_sent_at?: string | null
          google_event_id?: string | null
          half_price_sessions?: number | null
          id?: string | null
          notes?: string | null
          notification_status?: string | null
          paid_confirmed_at?: string | null
          reminder_sent_at?: string | null
          sms_message?: string | null
          sms_sent_at?: string | null
          taken_at?: string | null
        }
        Relationships: []
      }
      bak_payment_reminders_christine_20260831: {
        Row: {
          amount_due: number | null
          approved_at: string | null
          billing_credits: number | null
          client_ack_at: string | null
          client_id: string | null
          client_name: string | null
          created_at: string | null
          credit_details: Json | null
          due_date: string | null
          email_sent_at: string | null
          google_event_id: string | null
          half_price_sessions: number | null
          id: string | null
          notes: string | null
          notification_status: string | null
          paid_confirmed_at: string | null
          reminder_sent_at: string | null
          sms_message: string | null
          sms_sent_at: string | null
          taken_at: string | null
        }
        Insert: {
          amount_due?: number | null
          approved_at?: string | null
          billing_credits?: number | null
          client_ack_at?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string | null
          credit_details?: Json | null
          due_date?: string | null
          email_sent_at?: string | null
          google_event_id?: string | null
          half_price_sessions?: number | null
          id?: string | null
          notes?: string | null
          notification_status?: string | null
          paid_confirmed_at?: string | null
          reminder_sent_at?: string | null
          sms_message?: string | null
          sms_sent_at?: string | null
          taken_at?: string | null
        }
        Update: {
          amount_due?: number | null
          approved_at?: string | null
          billing_credits?: number | null
          client_ack_at?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string | null
          credit_details?: Json | null
          due_date?: string | null
          email_sent_at?: string | null
          google_event_id?: string | null
          half_price_sessions?: number | null
          id?: string | null
          notes?: string | null
          notification_status?: string | null
          paid_confirmed_at?: string | null
          reminder_sent_at?: string | null
          sms_message?: string | null
          sms_sent_at?: string | null
          taken_at?: string | null
        }
        Relationships: []
      }
      bak_payment_reminders_quit_20260830: {
        Row: {
          amount_due: number | null
          approved_at: string | null
          billing_credits: number | null
          client_ack_at: string | null
          client_id: string | null
          client_name: string | null
          created_at: string | null
          credit_details: Json | null
          due_date: string | null
          email_sent_at: string | null
          google_event_id: string | null
          half_price_sessions: number | null
          id: string | null
          notes: string | null
          notification_status: string | null
          paid_confirmed_at: string | null
          reminder_sent_at: string | null
          sms_message: string | null
          sms_sent_at: string | null
          taken_at: string | null
        }
        Insert: {
          amount_due?: number | null
          approved_at?: string | null
          billing_credits?: number | null
          client_ack_at?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string | null
          credit_details?: Json | null
          due_date?: string | null
          email_sent_at?: string | null
          google_event_id?: string | null
          half_price_sessions?: number | null
          id?: string | null
          notes?: string | null
          notification_status?: string | null
          paid_confirmed_at?: string | null
          reminder_sent_at?: string | null
          sms_message?: string | null
          sms_sent_at?: string | null
          taken_at?: string | null
        }
        Update: {
          amount_due?: number | null
          approved_at?: string | null
          billing_credits?: number | null
          client_ack_at?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string | null
          credit_details?: Json | null
          due_date?: string | null
          email_sent_at?: string | null
          google_event_id?: string | null
          half_price_sessions?: number | null
          id?: string | null
          notes?: string | null
          notification_status?: string | null
          paid_confirmed_at?: string | null
          reminder_sent_at?: string | null
          sms_message?: string | null
          sms_sent_at?: string | null
          taken_at?: string | null
        }
        Relationships: []
      }
      bak_programs_nullowner_20260901: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string | null
          name: string | null
          owner_trainer_id: string | null
          personal_for_client_id: string | null
          status: string | null
          structure_type: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          owner_trainer_id?: string | null
          personal_for_client_id?: string | null
          status?: string | null
          structure_type?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          owner_trainer_id?: string | null
          personal_for_client_id?: string | null
          status?: string | null
          structure_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bak_recalc_fn_20260829: {
        Row: {
          def: string | null
          proname: unknown
          taken_at: string | null
        }
        Insert: {
          def?: string | null
          proname?: unknown
          taken_at?: string | null
        }
        Update: {
          def?: string | null
          proname?: unknown
          taken_at?: string | null
        }
        Relationships: []
      }
      bak_rls_initplan_20260903: {
        Row: {
          backed_up_at: string | null
          cmd: string | null
          permissive: string | null
          policyname: unknown
          qual: string | null
          roles: unknown[] | null
          schemaname: unknown
          tablename: unknown
          with_check: string | null
        }
        Insert: {
          backed_up_at?: string | null
          cmd?: string | null
          permissive?: string | null
          policyname?: unknown
          qual?: string | null
          roles?: unknown[] | null
          schemaname?: unknown
          tablename?: unknown
          with_check?: string | null
        }
        Update: {
          backed_up_at?: string | null
          cmd?: string | null
          permissive?: string | null
          policyname?: unknown
          qual?: string | null
          roles?: unknown[] | null
          schemaname?: unknown
          tablename?: unknown
          with_check?: string | null
        }
        Relationships: []
      }
      bak_run_integrity_checks_20260903: {
        Row: {
          backed_up_at: string | null
          def: string | null
        }
        Insert: {
          backed_up_at?: string | null
          def?: string | null
        }
        Update: {
          backed_up_at?: string | null
          def?: string | null
        }
        Relationships: []
      }
      bak_sariah_sd6_20260826: {
        Row: {
          alternate_of: string | null
          captured_at: string | null
          created_at: string | null
          cue: string | null
          exercise_id: string | null
          id: string | null
          intensity_type: string | null
          load_descriptor: string | null
          position: number | null
          rest: string | null
          section_id: string | null
          sets: number | null
          superset_group: string | null
          tempo: string | null
          tracked_fields: string[] | null
          unilateral: boolean | null
          use_drop_sets: boolean | null
          use_partials: boolean | null
          use_rest_pause: boolean | null
          volume_type: string | null
          volume_value: string | null
        }
        Insert: {
          alternate_of?: string | null
          captured_at?: string | null
          created_at?: string | null
          cue?: string | null
          exercise_id?: string | null
          id?: string | null
          intensity_type?: string | null
          load_descriptor?: string | null
          position?: number | null
          rest?: string | null
          section_id?: string | null
          sets?: number | null
          superset_group?: string | null
          tempo?: string | null
          tracked_fields?: string[] | null
          unilateral?: boolean | null
          use_drop_sets?: boolean | null
          use_partials?: boolean | null
          use_rest_pause?: boolean | null
          volume_type?: string | null
          volume_value?: string | null
        }
        Update: {
          alternate_of?: string | null
          captured_at?: string | null
          created_at?: string | null
          cue?: string | null
          exercise_id?: string | null
          id?: string | null
          intensity_type?: string | null
          load_descriptor?: string | null
          position?: number | null
          rest?: string | null
          section_id?: string | null
          sets?: number | null
          superset_group?: string | null
          tempo?: string | null
          tracked_fields?: string[] | null
          unilateral?: boolean | null
          use_drop_sets?: boolean | null
          use_partials?: boolean | null
          use_rest_pause?: boolean | null
          volume_type?: string | null
          volume_value?: string | null
        }
        Relationships: []
      }
      bak_search_food_catalog_def_20260831: {
        Row: {
          def: string | null
          proname: unknown
          saved_at: string | null
        }
        Insert: {
          def?: string | null
          proname?: unknown
          saved_at?: string | null
        }
        Update: {
          def?: string | null
          proname?: unknown
          saved_at?: string | null
        }
        Relationships: []
      }
      bak_shell_set_logs_20260831: {
        Row: {
          client_id: string | null
          completed: boolean | null
          created_at: string | null
          distance_meters: number | null
          duration_seconds: number | null
          exercise_id: string | null
          heart_rate: number | null
          id: string | null
          logged_at: string | null
          notes: string | null
          prescribed_exercise_id: string | null
          reps: number | null
          rpe: number | null
          set_number: number | null
          speed: number | null
          weight: number | null
          weight_lbs: number | null
          workout_log_id: string | null
        }
        Insert: {
          client_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          exercise_id?: string | null
          heart_rate?: number | null
          id?: string | null
          logged_at?: string | null
          notes?: string | null
          prescribed_exercise_id?: string | null
          reps?: number | null
          rpe?: number | null
          set_number?: number | null
          speed?: number | null
          weight?: number | null
          weight_lbs?: number | null
          workout_log_id?: string | null
        }
        Update: {
          client_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          exercise_id?: string | null
          heart_rate?: number | null
          id?: string | null
          logged_at?: string | null
          notes?: string | null
          prescribed_exercise_id?: string | null
          reps?: number | null
          rpe?: number | null
          set_number?: number | null
          speed?: number | null
          weight?: number | null
          weight_lbs?: number | null
          workout_log_id?: string | null
        }
        Relationships: []
      }
      bak_sw_claudine_dupe_strength_20260901: {
        Row: {
          appointment_id: string | null
          assignment_id: string | null
          client_id: string | null
          created_at: string | null
          day_id: string | null
          deleted_at: string | null
          id: string | null
          moved_by: string | null
          moved_from_date: string | null
          position: number | null
          published_workout_id: string | null
          scheduled_date: string | null
          source: string | null
          status: string | null
          supervised: boolean | null
          updated_at: string | null
          workout_log_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string | null
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string | null
          supervised?: boolean | null
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string | null
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string | null
          supervised?: boolean | null
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Relationships: []
      }
      bak_sw_jenn_future_completed_20260902: {
        Row: {
          appointment_id: string | null
          assignment_id: string | null
          client_id: string | null
          created_at: string | null
          day_id: string | null
          deleted_at: string | null
          id: string | null
          moved_by: string | null
          moved_from_date: string | null
          position: number | null
          published_workout_id: string | null
          scheduled_date: string | null
          source: string | null
          status: string | null
          supervised: boolean | null
          updated_at: string | null
          workout_log_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string | null
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string | null
          supervised?: boolean | null
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string | null
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string | null
          supervised?: boolean | null
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Relationships: []
      }
      bak_sw_retro_isolation_20260901: {
        Row: {
          client_id: string | null
          id: string | null
          old_day_id: string | null
          scheduled_date: string | null
          status: string | null
        }
        Insert: {
          client_id?: string | null
          id?: string | null
          old_day_id?: string | null
          scheduled_date?: string | null
          status?: string | null
        }
        Update: {
          client_id?: string | null
          id?: string | null
          old_day_id?: string | null
          scheduled_date?: string | null
          status?: string | null
        }
        Relationships: []
      }
      bak_sw_shared_day_isolation_20260901: {
        Row: {
          appointment_id: string | null
          assignment_id: string | null
          client_id: string | null
          created_at: string | null
          day_id: string | null
          deleted_at: string | null
          id: string | null
          moved_by: string | null
          moved_from_date: string | null
          position: number | null
          published_workout_id: string | null
          scheduled_date: string | null
          source: string | null
          status: string | null
          supervised: boolean | null
          updated_at: string | null
          workout_log_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string | null
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string | null
          supervised?: boolean | null
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string | null
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string | null
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string | null
          supervised?: boolean | null
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Relationships: []
      }
      bak_view_grants_20260902: {
        Row: {
          anon_select: boolean | null
          auth_select: boolean | null
          captured_at: string | null
          definition: string | null
          kind: string | null
          object_name: unknown
          reloptions: string | null
        }
        Insert: {
          anon_select?: boolean | null
          auth_select?: boolean | null
          captured_at?: string | null
          definition?: string | null
          kind?: string | null
          object_name?: unknown
          reloptions?: string | null
        }
        Update: {
          anon_select?: boolean | null
          auth_select?: boolean | null
          captured_at?: string | null
          definition?: string | null
          kind?: string | null
          object_name?: unknown
          reloptions?: string | null
        }
        Relationships: []
      }
      bak_workout_log_shells_20260831: {
        Row: {
          client_id: string | null
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          day_id: string | null
          duration_minutes: number | null
          id: string | null
          log_date: string | null
          note: string | null
          source: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          client_id?: string | null
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          day_id?: string | null
          duration_minutes?: number | null
          id?: string | null
          log_date?: string | null
          note?: string | null
          source?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          client_id?: string | null
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          day_id?: string | null
          duration_minutes?: number | null
          id?: string | null
          log_date?: string | null
          note?: string | null
          source?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      billing_adjustments: {
        Row: {
          amount: number
          applied: boolean | null
          apply_to_month: string | null
          appointment_id: string | null
          client_id: string
          created_at: string | null
          id: string
          reason: string | null
        }
        Insert: {
          amount: number
          applied?: boolean | null
          apply_to_month?: string | null
          appointment_id?: string | null
          client_id: string
          created_at?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          amount?: number
          applied?: boolean | null
          apply_to_month?: string | null
          appointment_id?: string | null
          client_id?: string
          created_at?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_adjustments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_adjustments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_adjustments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "billing_adjustments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "billing_adjustments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "billing_adjustments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_adjustments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "billing_adjustments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      birthday_posts: {
        Row: {
          client_id: string
          kind: string
          posted_at: string
          year: number
        }
        Insert: {
          client_id: string
          kind: string
          posted_at?: string
          year: number
        }
        Update: {
          client_id?: string
          kind?: string
          posted_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "birthday_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthday_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "birthday_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "birthday_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "birthday_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthday_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "birthday_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      calendar_payments: {
        Row: {
          amount: number | null
          cadence: string | null
          client_id: string | null
          created_at: string | null
          google_event_id: string | null
          has_reminder: boolean | null
          id: string
          payment_date: string | null
          source: string | null
          synced_at: string | null
          title: string | null
        }
        Insert: {
          amount?: number | null
          cadence?: string | null
          client_id?: string | null
          created_at?: string | null
          google_event_id?: string | null
          has_reminder?: boolean | null
          id?: string
          payment_date?: string | null
          source?: string | null
          synced_at?: string | null
          title?: string | null
        }
        Update: {
          amount?: number | null
          cadence?: string | null
          client_id?: string | null
          created_at?: string | null
          google_event_id?: string | null
          has_reminder?: boolean | null
          id?: string
          payment_date?: string | null
          source?: string | null
          synced_at?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "calendar_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "calendar_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "calendar_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "calendar_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      cardio_logs: {
        Row: {
          avg_hr: number | null
          calories: number | null
          client_id: string
          created_at: string | null
          distance: number | null
          duration_minutes: number | null
          id: string
          log_date: string
          source: string | null
          type: string | null
        }
        Insert: {
          avg_hr?: number | null
          calories?: number | null
          client_id: string
          created_at?: string | null
          distance?: number | null
          duration_minutes?: number | null
          id?: string
          log_date: string
          source?: string | null
          type?: string | null
        }
        Update: {
          avg_hr?: number | null
          calories?: number | null
          client_id?: string
          created_at?: string | null
          distance?: number | null
          duration_minutes?: number | null
          id?: string
          log_date?: string
          source?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cardio_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cardio_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "cardio_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "cardio_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "cardio_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cardio_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "cardio_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      challenge_participants: {
        Row: {
          challenge_id: string
          client_id: string
          id: string
          joined_at: string
        }
        Insert: {
          challenge_id: string
          client_id: string
          id?: string
          joined_at?: string
        }
        Update: {
          challenge_id?: string
          client_id?: string
          id?: string
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_participants_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "group_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_participants_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "v_active_challenge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_participants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_participants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "challenge_participants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "challenge_participants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "challenge_participants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_participants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "challenge_participants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      challenge_templates: {
        Row: {
          emoji: string
          metric: string
          ord: number
          scoring_note: string
          tagline: string
          title: string
        }
        Insert: {
          emoji: string
          metric: string
          ord: number
          scoring_note: string
          tagline: string
          title: string
        }
        Update: {
          emoji?: string
          metric?: string
          ord?: number
          scoring_note?: string
          tagline?: string
          title?: string
        }
        Relationships: []
      }
      claude_handoff: {
        Row: {
          body: string
          created_at: string | null
          id: string
          status: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          status?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      client_announcements_seen: {
        Row: {
          client_id: string
          key: string
          seen_at: string
        }
        Insert: {
          client_id: string
          key: string
          seen_at?: string
        }
        Update: {
          client_id?: string
          key?: string
          seen_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_announcements_seen_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_announcements_seen_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "client_announcements_seen_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_announcements_seen_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_announcements_seen_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_announcements_seen_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_announcements_seen_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      client_app_settings: {
        Row: {
          ai_daily_chat_limit: number | null
          ai_daily_chat_limit_advanced: number | null
          ai_daily_parse_limit: number | null
          ai_daily_photo_limit: number | null
          ai_daily_plan_build_limit: number | null
          ai_daily_verify_limit: number | null
          ai_pool_only: boolean
          ai_tier: string
          calendar_visibility_days: number | null
          can_reschedule: boolean | null
          can_self_assign: boolean | null
          checkin_nudges_off: boolean
          checkin_snoozed_until: string | null
          client_id: string
          coach_enabled: boolean | null
          depth_level: number | null
          first_login_completed: boolean | null
          leaderboard_opt_in: boolean
          nudges_enabled: boolean
          nutrition_v3: boolean | null
          password_is_temporary: boolean | null
          pwa_prompt_dismissed: boolean | null
          reschedule_window_days: number | null
          seen_ai_workout_notice: boolean | null
          theme: string | null
          updated_at: string | null
          workout_ai: boolean | null
          workout_build_daily_limit: number | null
        }
        Insert: {
          ai_daily_chat_limit?: number | null
          ai_daily_chat_limit_advanced?: number | null
          ai_daily_parse_limit?: number | null
          ai_daily_photo_limit?: number | null
          ai_daily_plan_build_limit?: number | null
          ai_daily_verify_limit?: number | null
          ai_pool_only?: boolean
          ai_tier?: string
          calendar_visibility_days?: number | null
          can_reschedule?: boolean | null
          can_self_assign?: boolean | null
          checkin_nudges_off?: boolean
          checkin_snoozed_until?: string | null
          client_id: string
          coach_enabled?: boolean | null
          depth_level?: number | null
          first_login_completed?: boolean | null
          leaderboard_opt_in?: boolean
          nudges_enabled?: boolean
          nutrition_v3?: boolean | null
          password_is_temporary?: boolean | null
          pwa_prompt_dismissed?: boolean | null
          reschedule_window_days?: number | null
          seen_ai_workout_notice?: boolean | null
          theme?: string | null
          updated_at?: string | null
          workout_ai?: boolean | null
          workout_build_daily_limit?: number | null
        }
        Update: {
          ai_daily_chat_limit?: number | null
          ai_daily_chat_limit_advanced?: number | null
          ai_daily_parse_limit?: number | null
          ai_daily_photo_limit?: number | null
          ai_daily_plan_build_limit?: number | null
          ai_daily_verify_limit?: number | null
          ai_pool_only?: boolean
          ai_tier?: string
          calendar_visibility_days?: number | null
          can_reschedule?: boolean | null
          can_self_assign?: boolean | null
          checkin_nudges_off?: boolean
          checkin_snoozed_until?: string | null
          client_id?: string
          coach_enabled?: boolean | null
          depth_level?: number | null
          first_login_completed?: boolean | null
          leaderboard_opt_in?: boolean
          nudges_enabled?: boolean
          nutrition_v3?: boolean | null
          password_is_temporary?: boolean | null
          pwa_prompt_dismissed?: boolean | null
          reschedule_window_days?: number | null
          seen_ai_workout_notice?: boolean | null
          theme?: string | null
          updated_at?: string | null
          workout_ai?: boolean | null
          workout_build_daily_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_app_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_app_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "client_app_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_app_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_app_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_app_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_app_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      client_assessments: {
        Row: {
          activity_level: string | null
          ai_assessment_summary: string | null
          ai_program_recommendation: string | null
          arms_fall_forward: boolean | null
          assessed_at: string | null
          balance_deficits: boolean | null
          block_length_weeks: number | null
          block_start_date: string | null
          cardio_days_of_week: string[] | null
          cardio_days_per_week: number | null
          cardio_intensity: string | null
          cardio_modality: string | null
          chronic_conditions: string | null
          client_id: string | null
          compensation_confidence: Json | null
          compensation_severity: Json | null
          contraindicated_movements: string | null
          created_at: string | null
          created_by_trainer_id: string | null
          current_injuries: string | null
          date_of_birth: string | null
          days_per_week: number | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          equipment_access: string | null
          excessive_forward_lean: boolean | null
          experience_level: string | null
          feet_turn_out: boolean | null
          first_name: string | null
          forward_head: boolean | null
          goal_notes: string | null
          goal_timeline: string | null
          hip_issues: boolean | null
          id: string
          knees_cave_in: boolean | null
          last_name: string | null
          lateral_asymmetry: boolean | null
          low_back_arch: boolean | null
          medical_clearance: boolean | null
          medications: string | null
          movement_assessment_id: string | null
          nutrition_notes: string | null
          occupation_type: string | null
          ohsa_notes: string | null
          pain_location: string | null
          pain_onset: string | null
          phone: string | null
          preferred_time: string | null
          primary_goal: string | null
          prior_surgeries: string | null
          secondary_goal: string | null
          session_length_minutes: number | null
          sleep_hours: number | null
          solo_day_focus: string | null
          solo_days_of_week: string[] | null
          solo_days_per_week: number | null
          source: string | null
          status: string | null
          stress_level: number | null
          target_weight: number | null
          trained_days_of_week: string[] | null
          trained_days_per_week: number | null
          trainer_notes: string | null
          training_location: string | null
          updated_at: string | null
          years_training: number | null
        }
        Insert: {
          activity_level?: string | null
          ai_assessment_summary?: string | null
          ai_program_recommendation?: string | null
          arms_fall_forward?: boolean | null
          assessed_at?: string | null
          balance_deficits?: boolean | null
          block_length_weeks?: number | null
          block_start_date?: string | null
          cardio_days_of_week?: string[] | null
          cardio_days_per_week?: number | null
          cardio_intensity?: string | null
          cardio_modality?: string | null
          chronic_conditions?: string | null
          client_id?: string | null
          compensation_confidence?: Json | null
          compensation_severity?: Json | null
          contraindicated_movements?: string | null
          created_at?: string | null
          created_by_trainer_id?: string | null
          current_injuries?: string | null
          date_of_birth?: string | null
          days_per_week?: number | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          equipment_access?: string | null
          excessive_forward_lean?: boolean | null
          experience_level?: string | null
          feet_turn_out?: boolean | null
          first_name?: string | null
          forward_head?: boolean | null
          goal_notes?: string | null
          goal_timeline?: string | null
          hip_issues?: boolean | null
          id?: string
          knees_cave_in?: boolean | null
          last_name?: string | null
          lateral_asymmetry?: boolean | null
          low_back_arch?: boolean | null
          medical_clearance?: boolean | null
          medications?: string | null
          movement_assessment_id?: string | null
          nutrition_notes?: string | null
          occupation_type?: string | null
          ohsa_notes?: string | null
          pain_location?: string | null
          pain_onset?: string | null
          phone?: string | null
          preferred_time?: string | null
          primary_goal?: string | null
          prior_surgeries?: string | null
          secondary_goal?: string | null
          session_length_minutes?: number | null
          sleep_hours?: number | null
          solo_day_focus?: string | null
          solo_days_of_week?: string[] | null
          solo_days_per_week?: number | null
          source?: string | null
          status?: string | null
          stress_level?: number | null
          target_weight?: number | null
          trained_days_of_week?: string[] | null
          trained_days_per_week?: number | null
          trainer_notes?: string | null
          training_location?: string | null
          updated_at?: string | null
          years_training?: number | null
        }
        Update: {
          activity_level?: string | null
          ai_assessment_summary?: string | null
          ai_program_recommendation?: string | null
          arms_fall_forward?: boolean | null
          assessed_at?: string | null
          balance_deficits?: boolean | null
          block_length_weeks?: number | null
          block_start_date?: string | null
          cardio_days_of_week?: string[] | null
          cardio_days_per_week?: number | null
          cardio_intensity?: string | null
          cardio_modality?: string | null
          chronic_conditions?: string | null
          client_id?: string | null
          compensation_confidence?: Json | null
          compensation_severity?: Json | null
          contraindicated_movements?: string | null
          created_at?: string | null
          created_by_trainer_id?: string | null
          current_injuries?: string | null
          date_of_birth?: string | null
          days_per_week?: number | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          equipment_access?: string | null
          excessive_forward_lean?: boolean | null
          experience_level?: string | null
          feet_turn_out?: boolean | null
          first_name?: string | null
          forward_head?: boolean | null
          goal_notes?: string | null
          goal_timeline?: string | null
          hip_issues?: boolean | null
          id?: string
          knees_cave_in?: boolean | null
          last_name?: string | null
          lateral_asymmetry?: boolean | null
          low_back_arch?: boolean | null
          medical_clearance?: boolean | null
          medications?: string | null
          movement_assessment_id?: string | null
          nutrition_notes?: string | null
          occupation_type?: string | null
          ohsa_notes?: string | null
          pain_location?: string | null
          pain_onset?: string | null
          phone?: string | null
          preferred_time?: string | null
          primary_goal?: string | null
          prior_surgeries?: string | null
          secondary_goal?: string | null
          session_length_minutes?: number | null
          sleep_hours?: number | null
          solo_day_focus?: string | null
          solo_days_of_week?: string[] | null
          solo_days_per_week?: number | null
          source?: string | null
          status?: string | null
          stress_level?: number | null
          target_weight?: number | null
          trained_days_of_week?: string[] | null
          trained_days_per_week?: number | null
          trainer_notes?: string | null
          training_location?: string | null
          updated_at?: string | null
          years_training?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "client_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_assessments_created_by_trainer_id_fkey"
            columns: ["created_by_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_error_log: {
        Row: {
          client_id: string | null
          created_at: string
          detail: Json | null
          id: string
          message: string | null
          path: string | null
          scope: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          message?: string | null
          path?: string | null
          scope: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          message?: string | null
          path?: string | null
          scope?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_error_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_error_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "client_error_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_error_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_error_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_error_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_error_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      client_goals: {
        Row: {
          accepted_at: string | null
          achieved_at: string | null
          client_id: string
          created_at: string
          id: string
          metric: string
          note: string | null
          rolled_from_id: string | null
          rolled_to_id: string | null
          set_by: string
          start_date: string | null
          start_value: number | null
          status: string
          target_date: string
          target_value: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          achieved_at?: string | null
          client_id: string
          created_at?: string
          id?: string
          metric: string
          note?: string | null
          rolled_from_id?: string | null
          rolled_to_id?: string | null
          set_by: string
          start_date?: string | null
          start_value?: number | null
          status?: string
          target_date: string
          target_value: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          achieved_at?: string | null
          client_id?: string
          created_at?: string
          id?: string
          metric?: string
          note?: string | null
          rolled_from_id?: string | null
          rolled_to_id?: string | null
          set_by?: string
          start_date?: string | null
          start_value?: number | null
          status?: string
          target_date?: string
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "client_goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_goals_rolled_from_id_fkey"
            columns: ["rolled_from_id"]
            isOneToOne: false
            referencedRelation: "client_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_goals_rolled_to_id_fkey"
            columns: ["rolled_to_id"]
            isOneToOne: false
            referencedRelation: "client_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notifications: {
        Row: {
          amount_due: number | null
          body: string | null
          client_id: string
          created_at: string
          dismissed_at: string | null
          due_date: string | null
          id: string
          is_read: boolean
          payment_reminder_id: string | null
          title: string
          type: string
        }
        Insert: {
          amount_due?: number | null
          body?: string | null
          client_id: string
          created_at?: string
          dismissed_at?: string | null
          due_date?: string | null
          id?: string
          is_read?: boolean
          payment_reminder_id?: string | null
          title: string
          type?: string
        }
        Update: {
          amount_due?: number | null
          body?: string | null
          client_id?: string
          created_at?: string
          dismissed_at?: string | null
          due_date?: string | null
          id?: string
          is_read?: boolean
          payment_reminder_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "client_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_notifications_payment_reminder_id_fkey"
            columns: ["payment_reminder_id"]
            isOneToOne: false
            referencedRelation: "payment_reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      client_private_profiles: {
        Row: {
          client_id: string | null
          coach_notes: string | null
          content: string | null
          id: string
          is_self: boolean | null
          notion_synced_at: string | null
          profile: Json
          source_title: string | null
          source_url: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          coach_notes?: string | null
          content?: string | null
          id?: string
          is_self?: boolean | null
          notion_synced_at?: string | null
          profile?: Json
          source_title?: string | null
          source_url?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          coach_notes?: string | null
          content?: string | null
          id?: string
          is_self?: boolean | null
          notion_synced_at?: string | null
          profile?: Json
          source_title?: string | null
          source_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_private_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_private_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "client_private_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_private_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_private_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_private_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_private_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      client_program_feedback: {
        Row: {
          answer: string | null
          answered_at: string | null
          asked_at: string
          client_id: string
          delivered_at: string | null
          id: string
          question: string
          week_start: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          asked_at?: string
          client_id: string
          delivered_at?: string | null
          id?: string
          question: string
          week_start: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          asked_at?: string
          client_id?: string
          delivered_at?: string | null
          id?: string
          question?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_program_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_program_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "client_program_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_program_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_program_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_program_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_program_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      client_training_patterns: {
        Row: {
          client_id: string
          created_at: string
          day_id: string
          effective_from: string
          effective_to: string | null
          gcal_recurring_id: string | null
          id: string
          is_active: boolean
          note: string | null
          position: number
          supervised: boolean
          weekday: number
        }
        Insert: {
          client_id: string
          created_at?: string
          day_id: string
          effective_from: string
          effective_to?: string | null
          gcal_recurring_id?: string | null
          id?: string
          is_active?: boolean
          note?: string | null
          position?: number
          supervised?: boolean
          weekday: number
        }
        Update: {
          client_id?: string
          created_at?: string
          day_id?: string
          effective_from?: string
          effective_to?: string | null
          gcal_recurring_id?: string | null
          id?: string
          is_active?: boolean
          note?: string | null
          position?: number
          supervised?: boolean
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_training_patterns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_training_patterns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "client_training_patterns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_training_patterns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_training_patterns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_training_patterns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_training_patterns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_training_patterns_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "days"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          ai_focus: string | null
          ai_focus_date: string | null
          ai_focus_question: string | null
          ai_focus_question_date: string | null
          ai_food_focus: string | null
          ai_food_focus_week: string | null
          archive_effective_on: string | null
          archived_at: string | null
          assessment_id: string | null
          auth_user_id: string | null
          avatar_url: string | null
          billing_anchor_day: number | null
          billing_anchor_day_2: number | null
          billing_anchor_weekday: number | null
          billing_cadence: string | null
          billing_type: string | null
          created_at: string | null
          current_body_fat_pct: number | null
          current_fees: number | null
          current_weight: number | null
          date_of_birth: string | null
          days_per_week: number | null
          digest_snoozed_until: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          exclude_from_rankings: boolean
          expected_sessions_per_cycle: number | null
          experience_level: string | null
          flat_billing: boolean
          id: string
          injuries: string | null
          injuries_limitations: string | null
          is_self_coached: boolean | null
          is_test_account: boolean
          medical_notes: string | null
          movement_screen_enabled: boolean
          name: string
          notes: string | null
          nutrition_only: boolean
          onboarding_complete: boolean | null
          online_only: boolean
          paid_by_client_id: string | null
          payment_reminders_enabled: boolean | null
          phone: string | null
          plan_locked: boolean
          primary_goal: string | null
          secondary_goals: string | null
          session_rate: number | null
          slug: string | null
          start_date: string | null
          trainer_id: string
          training_days: string | null
          training_frequency: number | null
          updated_at: string | null
          week_brief_seen_week: string | null
          weekly_focus: string | null
          weekly_focus_source: string | null
          weekly_focus_week: string | null
        }
        Insert: {
          ai_focus?: string | null
          ai_focus_date?: string | null
          ai_focus_question?: string | null
          ai_focus_question_date?: string | null
          ai_food_focus?: string | null
          ai_food_focus_week?: string | null
          archive_effective_on?: string | null
          archived_at?: string | null
          assessment_id?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          billing_anchor_day?: number | null
          billing_anchor_day_2?: number | null
          billing_anchor_weekday?: number | null
          billing_cadence?: string | null
          billing_type?: string | null
          created_at?: string | null
          current_body_fat_pct?: number | null
          current_fees?: number | null
          current_weight?: number | null
          date_of_birth?: string | null
          days_per_week?: number | null
          digest_snoozed_until?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          exclude_from_rankings?: boolean
          expected_sessions_per_cycle?: number | null
          experience_level?: string | null
          flat_billing?: boolean
          id?: string
          injuries?: string | null
          injuries_limitations?: string | null
          is_self_coached?: boolean | null
          is_test_account?: boolean
          medical_notes?: string | null
          movement_screen_enabled?: boolean
          name: string
          notes?: string | null
          nutrition_only?: boolean
          onboarding_complete?: boolean | null
          online_only?: boolean
          paid_by_client_id?: string | null
          payment_reminders_enabled?: boolean | null
          phone?: string | null
          plan_locked?: boolean
          primary_goal?: string | null
          secondary_goals?: string | null
          session_rate?: number | null
          slug?: string | null
          start_date?: string | null
          trainer_id: string
          training_days?: string | null
          training_frequency?: number | null
          updated_at?: string | null
          week_brief_seen_week?: string | null
          weekly_focus?: string | null
          weekly_focus_source?: string | null
          weekly_focus_week?: string | null
        }
        Update: {
          ai_focus?: string | null
          ai_focus_date?: string | null
          ai_focus_question?: string | null
          ai_focus_question_date?: string | null
          ai_food_focus?: string | null
          ai_food_focus_week?: string | null
          archive_effective_on?: string | null
          archived_at?: string | null
          assessment_id?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          billing_anchor_day?: number | null
          billing_anchor_day_2?: number | null
          billing_anchor_weekday?: number | null
          billing_cadence?: string | null
          billing_type?: string | null
          created_at?: string | null
          current_body_fat_pct?: number | null
          current_fees?: number | null
          current_weight?: number | null
          date_of_birth?: string | null
          days_per_week?: number | null
          digest_snoozed_until?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          exclude_from_rankings?: boolean
          expected_sessions_per_cycle?: number | null
          experience_level?: string | null
          flat_billing?: boolean
          id?: string
          injuries?: string | null
          injuries_limitations?: string | null
          is_self_coached?: boolean | null
          is_test_account?: boolean
          medical_notes?: string | null
          movement_screen_enabled?: boolean
          name?: string
          notes?: string | null
          nutrition_only?: boolean
          onboarding_complete?: boolean | null
          online_only?: boolean
          paid_by_client_id?: string | null
          payment_reminders_enabled?: boolean | null
          phone?: string | null
          plan_locked?: boolean
          primary_goal?: string | null
          secondary_goals?: string | null
          session_rate?: number | null
          slug?: string | null
          start_date?: string | null
          trainer_id?: string
          training_days?: string | null
          training_frequency?: number | null
          updated_at?: string | null
          week_brief_seen_week?: string | null
          weekly_focus?: string | null
          weekly_focus_source?: string | null
          weekly_focus_week?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "client_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["assessment_id"]
          },
          {
            foreignKeyName: "clients_paid_by_client_id_fkey"
            columns: ["paid_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_paid_by_client_id_fkey"
            columns: ["paid_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "clients_paid_by_client_id_fkey"
            columns: ["paid_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "clients_paid_by_client_id_fkey"
            columns: ["paid_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "clients_paid_by_client_id_fkey"
            columns: ["paid_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_paid_by_client_id_fkey"
            columns: ["paid_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "clients_paid_by_client_id_fkey"
            columns: ["paid_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "clients_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          log_date: string
          source: string | null
          summary: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          log_date: string
          source?: string | null
          summary?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          log_date?: string
          source?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "daily_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "daily_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "daily_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "daily_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      days: {
        Row: {
          client_owner_id: string | null
          created_at: string | null
          created_by: string | null
          day_of_week: number | null
          id: string
          label: string | null
          origin: string | null
          phase_id: string
          position: number
          swappable: boolean | null
          swapped_from_day_id: string | null
          region: string | null
          focus_tags: string[] | null
          modality_tags: string[] | null
          equipment_tags: string[] | null
          intent_tags: string[] | null
          exercise_count: number | null
        }
        Insert: {
          client_owner_id?: string | null
          created_at?: string | null
          created_by?: string | null
          day_of_week?: number | null
          id?: string
          label?: string | null
          origin?: string | null
          phase_id: string
          position: number
          swappable?: boolean | null
          swapped_from_day_id?: string | null
          region?: string | null
          focus_tags?: string[] | null
          modality_tags?: string[] | null
          equipment_tags?: string[] | null
          intent_tags?: string[] | null
          exercise_count?: number | null
        }
        Update: {
          client_owner_id?: string | null
          created_at?: string | null
          created_by?: string | null
          day_of_week?: number | null
          id?: string
          label?: string | null
          origin?: string | null
          phase_id?: string
          position?: number
          swappable?: boolean | null
          swapped_from_day_id?: string | null
          region?: string | null
          focus_tags?: string[] | null
          modality_tags?: string[] | null
          equipment_tags?: string[] | null
          intent_tags?: string[] | null
          exercise_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "days_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "days_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "days_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "days_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "days_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "days_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "days_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "days_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "days_swapped_from_day_id_fkey"
            columns: ["swapped_from_day_id"]
            isOneToOne: false
            referencedRelation: "days"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string | null
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string | null
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string | null
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      equipment: {
        Row: {
          available: boolean | null
          created_at: string | null
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          available?: boolean | null
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          available?: boolean | null
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      everfit_activities: {
        Row: {
          client_id: string
          end_time: string | null
          id: string
          imported_at: string
          logged_at: string | null
          name: string | null
          source: string
          start_time: string | null
        }
        Insert: {
          client_id: string
          end_time?: string | null
          id?: string
          imported_at?: string
          logged_at?: string | null
          name?: string | null
          source?: string
          start_time?: string | null
        }
        Update: {
          client_id?: string
          end_time?: string | null
          id?: string
          imported_at?: string
          logged_at?: string | null
          name?: string | null
          source?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "everfit_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "everfit_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "everfit_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "everfit_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      everfit_daily_steps: {
        Row: {
          client_id: string
          id: string
          imported_at: string
          log_date: string
          source: string
          steps: number | null
        }
        Insert: {
          client_id: string
          id?: string
          imported_at?: string
          log_date: string
          source?: string
          steps?: number | null
        }
        Update: {
          client_id?: string
          id?: string
          imported_at?: string
          log_date?: string
          source?: string
          steps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "everfit_daily_steps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "everfit_daily_steps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "everfit_daily_steps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_daily_steps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_daily_steps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "everfit_daily_steps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_daily_steps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      everfit_food_log: {
        Row: {
          calories: number | null
          carbs: number | null
          client_id: string
          ext_source: string | null
          fats: number | null
          id: string
          imported_at: string
          log_date: string | null
          meal_type: string | null
          protein: number | null
          source: string
          title: string | null
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          client_id: string
          ext_source?: string | null
          fats?: number | null
          id?: string
          imported_at?: string
          log_date?: string | null
          meal_type?: string | null
          protein?: number | null
          source?: string
          title?: string | null
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          client_id?: string
          ext_source?: string | null
          fats?: number | null
          id?: string
          imported_at?: string
          log_date?: string | null
          meal_type?: string | null
          protein?: number | null
          source?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "everfit_food_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "everfit_food_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "everfit_food_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_food_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_food_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "everfit_food_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_food_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      everfit_progress_photos: {
        Row: {
          client_id: string
          created_at_ext: string | null
          id: string
          imported_at: string
          photo_date: string | null
          source: string
          url: string | null
        }
        Insert: {
          client_id: string
          created_at_ext?: string | null
          id?: string
          imported_at?: string
          photo_date?: string | null
          source?: string
          url?: string | null
        }
        Update: {
          client_id?: string
          created_at_ext?: string | null
          id?: string
          imported_at?: string
          photo_date?: string | null
          source?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "everfit_progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "everfit_progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "everfit_progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "everfit_progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      everfit_workout_history: {
        Row: {
          client_id: string
          detail: string | null
          duration_sec: number | null
          exercise_names: string | null
          id: string
          imported_at: string
          logged_at: string | null
          sets: Json | null
          source: string
          title: string | null
          workout_date: string | null
        }
        Insert: {
          client_id: string
          detail?: string | null
          duration_sec?: number | null
          exercise_names?: string | null
          id?: string
          imported_at?: string
          logged_at?: string | null
          sets?: Json | null
          source?: string
          title?: string | null
          workout_date?: string | null
        }
        Update: {
          client_id?: string
          detail?: string | null
          duration_sec?: number | null
          exercise_names?: string | null
          id?: string
          imported_at?: string
          logged_at?: string | null
          sets?: Json | null
          source?: string
          title?: string | null
          workout_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "everfit_workout_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "everfit_workout_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "everfit_workout_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_workout_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_workout_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "everfit_workout_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "everfit_workout_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      exercise_hidden: {
        Row: {
          exercise_id: string
          hidden_at: string
          trainer_id: string
        }
        Insert: {
          exercise_id: string
          hidden_at?: string
          trainer_id: string
        }
        Update: {
          exercise_id?: string
          hidden_at?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_hidden_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_hidden_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "v_my_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_hidden_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_notes: {
        Row: {
          author: string
          client_id: string
          created_at: string
          day_id: string | null
          exercise_id: string | null
          id: string
          log_date: string
          note: string
          prescribed_exercise_id: string | null
          resolved: boolean
          workout_log_id: string | null
        }
        Insert: {
          author?: string
          client_id: string
          created_at?: string
          day_id?: string | null
          exercise_id?: string | null
          id?: string
          log_date?: string
          note: string
          prescribed_exercise_id?: string | null
          resolved?: boolean
          workout_log_id?: string | null
        }
        Update: {
          author?: string
          client_id?: string
          created_at?: string
          day_id?: string | null
          exercise_id?: string | null
          id?: string
          log_date?: string
          note?: string
          prescribed_exercise_id?: string | null
          resolved?: boolean
          workout_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "exercise_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "exercise_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "exercise_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "exercise_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "exercise_notes_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_notes_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "v_my_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_notes_prescribed_exercise_id_fkey"
            columns: ["prescribed_exercise_id"]
            isOneToOne: false
            referencedRelation: "prescribed_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_notes_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_video_candidates: {
        Row: {
          applied_at: string | null
          channel: string | null
          confidence: string | null
          created_at: string
          duration_sec: number | null
          exercise_id: string
          exercise_name: string
          found_by: string | null
          id: string
          note: string | null
          previous_video_url: string | null
          reviewed_at: string | null
          status: string
          title: string | null
          url: string
        }
        Insert: {
          applied_at?: string | null
          channel?: string | null
          confidence?: string | null
          created_at?: string
          duration_sec?: number | null
          exercise_id: string
          exercise_name: string
          found_by?: string | null
          id?: string
          note?: string | null
          previous_video_url?: string | null
          reviewed_at?: string | null
          status?: string
          title?: string | null
          url: string
        }
        Update: {
          applied_at?: string | null
          channel?: string | null
          confidence?: string | null
          created_at?: string
          duration_sec?: number | null
          exercise_id?: string
          exercise_name?: string
          found_by?: string | null
          id?: string
          note?: string | null
          previous_video_url?: string | null
          reviewed_at?: string | null
          status?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_video_candidates_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_video_candidates_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "v_my_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          aliases: string[] | null
          availability_status: string | null
          client_owner_id: string | null
          corrective_phase_tags: string[] | null
          created_at: string | null
          created_by: string | null
          default_tracked_fields: string[] | null
          equipment_required: string[] | null
          everfit_name: string | null
          forked_from_id: string | null
          id: string
          load_is_assistance: boolean
          modality: string | null
          muscle_group: string | null
          name: string
          owner_trainer_id: string | null
          video_checked_at: string | null
          video_status: string | null
          video_url: string | null
        }
        Insert: {
          aliases?: string[] | null
          availability_status?: string | null
          client_owner_id?: string | null
          corrective_phase_tags?: string[] | null
          created_at?: string | null
          created_by?: string | null
          default_tracked_fields?: string[] | null
          equipment_required?: string[] | null
          everfit_name?: string | null
          forked_from_id?: string | null
          id?: string
          load_is_assistance?: boolean
          modality?: string | null
          muscle_group?: string | null
          name: string
          owner_trainer_id?: string | null
          video_checked_at?: string | null
          video_status?: string | null
          video_url?: string | null
        }
        Update: {
          aliases?: string[] | null
          availability_status?: string | null
          client_owner_id?: string | null
          corrective_phase_tags?: string[] | null
          created_at?: string | null
          created_by?: string | null
          default_tracked_fields?: string[] | null
          equipment_required?: string[] | null
          everfit_name?: string | null
          forked_from_id?: string | null
          id?: string
          load_is_assistance?: boolean
          modality?: string | null
          muscle_group?: string | null
          name?: string
          owner_trainer_id?: string | null
          video_checked_at?: string | null
          video_status?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "exercises_forked_from_id_fkey"
            columns: ["forked_from_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_forked_from_id_fkey"
            columns: ["forked_from_id"]
            isOneToOne: false
            referencedRelation: "v_my_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_owner_trainer_id_fkey"
            columns: ["owner_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      food_catalog: {
        Row: {
          ai_verified_at: string | null
          barcode: string | null
          brand: string | null
          carbs: number | null
          created_at: string | null
          created_by_client_id: string | null
          fats: number | null
          fiber: number | null
          id: string
          kcal: number | null
          micros: Json | null
          micros_source: string | null
          name: string
          protein: number | null
          sat_fat: number | null
          serving_desc: string | null
          serving_grams: number | null
          serving_options: Json | null
          sodium: number | null
          source: string | null
          sugar: number | null
          verified: boolean | null
        }
        Insert: {
          ai_verified_at?: string | null
          barcode?: string | null
          brand?: string | null
          carbs?: number | null
          created_at?: string | null
          created_by_client_id?: string | null
          fats?: number | null
          fiber?: number | null
          id?: string
          kcal?: number | null
          micros?: Json | null
          micros_source?: string | null
          name: string
          protein?: number | null
          sat_fat?: number | null
          serving_desc?: string | null
          serving_grams?: number | null
          serving_options?: Json | null
          sodium?: number | null
          source?: string | null
          sugar?: number | null
          verified?: boolean | null
        }
        Update: {
          ai_verified_at?: string | null
          barcode?: string | null
          brand?: string | null
          carbs?: number | null
          created_at?: string | null
          created_by_client_id?: string | null
          fats?: number | null
          fiber?: number | null
          id?: string
          kcal?: number | null
          micros?: Json | null
          micros_source?: string | null
          name?: string
          protein?: number | null
          sat_fat?: number | null
          serving_desc?: string | null
          serving_grams?: number | null
          serving_options?: Json | null
          sodium?: number | null
          source?: string | null
          sugar?: number | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "food_catalog_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_catalog_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "food_catalog_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "food_catalog_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "food_catalog_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_catalog_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "food_catalog_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      food_import_state: {
        Row: {
          cursor: number
          fail_count: number
          imported_count: number
          last_error: string | null
          source: string
          status: string
          total_available: number | null
          updated_at: string
        }
        Insert: {
          cursor?: number
          fail_count?: number
          imported_count?: number
          last_error?: string | null
          source: string
          status?: string
          total_available?: number | null
          updated_at?: string
        }
        Update: {
          cursor?: number
          fail_count?: number
          imported_count?: number
          last_error?: string | null
          source?: string
          status?: string
          total_available?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      foods: {
        Row: {
          carbs: number
          created_at: string
          created_by_client_id: string | null
          fats: number
          id: string
          kcal: number | null
          micros: Json | null
          name: string
          protein: number
          serving: string
          source: string
          verified: boolean
        }
        Insert: {
          carbs?: number
          created_at?: string
          created_by_client_id?: string | null
          fats?: number
          id?: string
          kcal?: number | null
          micros?: Json | null
          name: string
          protein?: number
          serving?: string
          source?: string
          verified?: boolean
        }
        Update: {
          carbs?: number
          created_at?: string
          created_by_client_id?: string | null
          fats?: number
          id?: string
          kcal?: number | null
          micros?: Json | null
          name?: string
          protein?: number
          serving?: string
          source?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "foods_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foods_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "foods_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "foods_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "foods_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foods_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "foods_created_by_client_id_fkey"
            columns: ["created_by_client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      gcal_sync_runs: {
        Row: {
          error: string | null
          harvested_at: string | null
          id: number
          ok: boolean | null
          queued_at: string
          request_id: number | null
          response: Json | null
          source: string
          status_code: number | null
        }
        Insert: {
          error?: string | null
          harvested_at?: string | null
          id?: never
          ok?: boolean | null
          queued_at?: string
          request_id?: number | null
          response?: Json | null
          source?: string
          status_code?: number | null
        }
        Update: {
          error?: string | null
          harvested_at?: string | null
          id?: never
          ok?: boolean | null
          queued_at?: string
          request_id?: number | null
          response?: Json | null
          source?: string
          status_code?: number | null
        }
        Relationships: []
      }
      group_challenges: {
        Row: {
          announced_at: string | null
          auto_generated: boolean | null
          counts_external: boolean
          created_at: string
          created_by: string | null
          emoji: string | null
          ended_at: string | null
          ends_on: string
          id: string
          metric: string
          next_pick_client_id: string | null
          rules: string | null
          scored_at: string | null
          scoring_note: string | null
          scoring_stat: string | null
          starts_on: string
          status: string | null
          tagline: string | null
          title: string
          trainer_id: string | null
          winner_client_id: string | null
          winner_score: number | null
        }
        Insert: {
          announced_at?: string | null
          auto_generated?: boolean | null
          counts_external?: boolean
          created_at?: string
          created_by?: string | null
          emoji?: string | null
          ended_at?: string | null
          ends_on: string
          id?: string
          metric?: string
          next_pick_client_id?: string | null
          rules?: string | null
          scored_at?: string | null
          scoring_note?: string | null
          scoring_stat?: string | null
          starts_on: string
          status?: string | null
          tagline?: string | null
          title: string
          trainer_id?: string | null
          winner_client_id?: string | null
          winner_score?: number | null
        }
        Update: {
          announced_at?: string | null
          auto_generated?: boolean | null
          counts_external?: boolean
          created_at?: string
          created_by?: string | null
          emoji?: string | null
          ended_at?: string | null
          ends_on?: string
          id?: string
          metric?: string
          next_pick_client_id?: string | null
          rules?: string | null
          scored_at?: string | null
          scoring_note?: string | null
          scoring_stat?: string | null
          starts_on?: string
          status?: string | null
          tagline?: string | null
          title?: string
          trainer_id?: string | null
          winner_client_id?: string | null
          winner_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      group_reads: {
        Row: {
          last_read_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      health_connections: {
        Row: {
          access_token: string | null
          client_id: string
          created_at: string
          expires_at: string | null
          external_id: string | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          provider: string
          refresh_token: string | null
          scopes: string[]
          status: string
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          client_id: string
          created_at?: string
          expires_at?: string | null
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider: string
          refresh_token?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          client_id?: string
          created_at?: string
          expires_at?: string | null
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider?: string
          refresh_token?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "health_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "health_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "health_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "health_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      health_daily: {
        Row: {
          active_kcal: number | null
          avg_hr: number | null
          client_id: string
          day: string
          distance_m: number | null
          exercise_min: number | null
          hrv_ms: number | null
          id: string
          provider: string
          raw: Json | null
          resting_hr: number | null
          resting_kcal: number | null
          sleep_min: number | null
          sleep_score: number | null
          steps: number | null
          synced_at: string
        }
        Insert: {
          active_kcal?: number | null
          avg_hr?: number | null
          client_id: string
          day: string
          distance_m?: number | null
          exercise_min?: number | null
          hrv_ms?: number | null
          id?: string
          provider: string
          raw?: Json | null
          resting_hr?: number | null
          resting_kcal?: number | null
          sleep_min?: number | null
          sleep_score?: number | null
          steps?: number | null
          synced_at?: string
        }
        Update: {
          active_kcal?: number | null
          avg_hr?: number | null
          client_id?: string
          day?: string
          distance_m?: number | null
          exercise_min?: number | null
          hrv_ms?: number | null
          id?: string
          provider?: string
          raw?: Json | null
          resting_hr?: number | null
          resting_kcal?: number | null
          sleep_min?: number | null
          sleep_score?: number | null
          steps?: number | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "health_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "health_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "health_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "health_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      health_workouts: {
        Row: {
          avg_hr: number | null
          calories: number | null
          client_id: string
          created_log_id: string | null
          distance_m: number | null
          duration_min: number | null
          ended_at: string | null
          external_id: string
          id: string
          ignored: boolean
          linked_log_id: string | null
          max_hr: number | null
          provider: string
          raw: Json | null
          started_at: string
          synced_at: string
          type: string | null
        }
        Insert: {
          avg_hr?: number | null
          calories?: number | null
          client_id: string
          created_log_id?: string | null
          distance_m?: number | null
          duration_min?: number | null
          ended_at?: string | null
          external_id: string
          id?: string
          ignored?: boolean
          linked_log_id?: string | null
          max_hr?: number | null
          provider: string
          raw?: Json | null
          started_at: string
          synced_at?: string
          type?: string | null
        }
        Update: {
          avg_hr?: number | null
          calories?: number | null
          client_id?: string
          created_log_id?: string | null
          distance_m?: number | null
          duration_min?: number | null
          ended_at?: string | null
          external_id?: string
          id?: string
          ignored?: boolean
          linked_log_id?: string | null
          max_hr?: number | null
          provider?: string
          raw?: Json | null
          started_at?: string
          synced_at?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "health_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "health_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "health_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "health_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "health_workouts_created_log_id_fkey"
            columns: ["created_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_workouts_linked_log_id_fkey"
            columns: ["linked_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      integrity_checks: {
        Row: {
          check_name: string
          count: number
          detail: Json | null
          id: number
          ran_at: string
          severity: string
        }
        Insert: {
          check_name: string
          count: number
          detail?: Json | null
          id?: number
          ran_at?: string
          severity: string
        }
        Update: {
          check_name?: string
          count?: number
          detail?: Json | null
          id?: number
          ran_at?: string
          severity?: string
        }
        Relationships: []
      }
      macro_target_dupe_backup_20260828: {
        Row: {
          calories: number | null
          carbs: number | null
          client_id: string | null
          created_at: string | null
          effective_date: string | null
          fats: number | null
          id: string | null
          protein: number | null
          rationale: string | null
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          client_id?: string | null
          created_at?: string | null
          effective_date?: string | null
          fats?: number | null
          id?: string | null
          protein?: number | null
          rationale?: string | null
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          client_id?: string | null
          created_at?: string | null
          effective_date?: string | null
          fats?: number | null
          id?: string | null
          protein?: number | null
          rationale?: string | null
        }
        Relationships: []
      }
      macro_target_sep7_backup_20260902: {
        Row: {
          calories: number | null
          carbs: number | null
          client_id: string | null
          created_at: string | null
          effective_date: string | null
          fats: number | null
          id: string | null
          protein: number | null
          rationale: string | null
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          client_id?: string | null
          created_at?: string | null
          effective_date?: string | null
          fats?: number | null
          id?: string | null
          protein?: number | null
          rationale?: string | null
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          client_id?: string | null
          created_at?: string | null
          effective_date?: string | null
          fats?: number | null
          id?: string | null
          protein?: number | null
          rationale?: string | null
        }
        Relationships: []
      }
      macro_targets: {
        Row: {
          calories: number | null
          carbs: number | null
          client_id: string
          created_at: string | null
          effective_date: string
          fats: number | null
          id: string
          protein: number | null
          rationale: string | null
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          client_id: string
          created_at?: string | null
          effective_date: string
          fats?: number | null
          id?: string
          protein?: number | null
          rationale?: string | null
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          client_id?: string
          created_at?: string | null
          effective_date?: string
          fats?: number | null
          id?: string
          protein?: number | null
          rationale?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "macro_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "macro_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "macro_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "macro_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "macro_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "macro_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "macro_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      meal_adherence_logs: {
        Row: {
          adherence: string | null
          analysis_status: string | null
          client_id: string
          created_at: string | null
          est_carbs: number | null
          est_fats: number | null
          est_fiber: number | null
          est_kcal: number | null
          est_micros: Json | null
          est_protein: number | null
          est_sat_fat: number | null
          est_sodium: number | null
          est_sugar: number | null
          food_id: string | null
          id: string
          item_overrides: Json | null
          log_date: string
          macros_pending: boolean
          meal_id: string | null
          meal_position: number
          notes: string | null
          off_plan_details: string | null
          off_plan_macros: Json | null
          off_plan_notes: string | null
          photo_url: string | null
          servings: number | null
          source: string | null
          trainer_macro_override: Json | null
        }
        Insert: {
          adherence?: string | null
          analysis_status?: string | null
          client_id: string
          created_at?: string | null
          est_carbs?: number | null
          est_fats?: number | null
          est_fiber?: number | null
          est_kcal?: number | null
          est_micros?: Json | null
          est_protein?: number | null
          est_sat_fat?: number | null
          est_sodium?: number | null
          est_sugar?: number | null
          food_id?: string | null
          id?: string
          item_overrides?: Json | null
          log_date: string
          macros_pending?: boolean
          meal_id?: string | null
          meal_position: number
          notes?: string | null
          off_plan_details?: string | null
          off_plan_macros?: Json | null
          off_plan_notes?: string | null
          photo_url?: string | null
          servings?: number | null
          source?: string | null
          trainer_macro_override?: Json | null
        }
        Update: {
          adherence?: string | null
          analysis_status?: string | null
          client_id?: string
          created_at?: string | null
          est_carbs?: number | null
          est_fats?: number | null
          est_fiber?: number | null
          est_kcal?: number | null
          est_micros?: Json | null
          est_protein?: number | null
          est_sat_fat?: number | null
          est_sodium?: number | null
          est_sugar?: number | null
          food_id?: string | null
          id?: string
          item_overrides?: Json | null
          log_date?: string
          macros_pending?: boolean
          meal_id?: string | null
          meal_position?: number
          notes?: string | null
          off_plan_details?: string | null
          off_plan_macros?: Json | null
          off_plan_notes?: string | null
          photo_url?: string | null
          servings?: number | null
          source?: string | null
          trainer_macro_override?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_adherence_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_adherence_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "meal_adherence_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meal_adherence_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meal_adherence_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_adherence_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meal_adherence_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meal_adherence_logs_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_adherence_logs_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_items: {
        Row: {
          amount: number | null
          basis: string | null
          carbs: number | null
          created_at: string | null
          fats: number | null
          food: string
          id: string
          is_unlimited: boolean | null
          kcal: number | null
          meal_id: string
          micros: Json | null
          position: number | null
          protein: number | null
          unit: string | null
        }
        Insert: {
          amount?: number | null
          basis?: string | null
          carbs?: number | null
          created_at?: string | null
          fats?: number | null
          food: string
          id?: string
          is_unlimited?: boolean | null
          kcal?: number | null
          meal_id: string
          micros?: Json | null
          position?: number | null
          protein?: number | null
          unit?: string | null
        }
        Update: {
          amount?: number | null
          basis?: string | null
          carbs?: number | null
          created_at?: string | null
          fats?: number | null
          food?: string
          id?: string
          is_unlimited?: boolean | null
          kcal?: number | null
          meal_id?: string
          micros?: Json | null
          position?: number | null
          protein?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          change_reason: string | null
          client_id: string
          created_at: string | null
          created_by_client: boolean
          day_group: number[] | null
          effective_date: string | null
          id: string
          status: string | null
          title: string | null
          version_number: number
        }
        Insert: {
          change_reason?: string | null
          client_id: string
          created_at?: string | null
          created_by_client?: boolean
          day_group?: number[] | null
          effective_date?: string | null
          id?: string
          status?: string | null
          title?: string | null
          version_number?: number
        }
        Update: {
          change_reason?: string | null
          client_id?: string
          created_at?: string | null
          created_by_client?: boolean
          day_group?: number[] | null
          effective_date?: string | null
          id?: string
          status?: string | null
          title?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "meal_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meal_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meal_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meal_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      meals: {
        Row: {
          created_at: string | null
          id: string
          meal_plan_id: string
          name: string | null
          position: number
          rotation: Json | null
          swaps: string | null
          timing: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          meal_plan_id: string
          name?: string | null
          position: number
          rotation?: Json | null
          swaps?: string | null
          timing?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          meal_plan_id?: string
          name?: string | null
          position?: number
          rotation?: Json | null
          swaps?: string | null
          timing?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meals_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meals_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["meal_plan_id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          client_id: string | null
          created_at: string | null
          deleted_at: string | null
          from_id: string
          group_trainer_id: string | null
          id: string
          image_url: string | null
          is_broadcast: boolean
          is_group: boolean
          read_at: string | null
          sender_kind: string | null
          to_id: string
        }
        Insert: {
          body: string
          client_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          from_id: string
          group_trainer_id?: string | null
          id?: string
          image_url?: string | null
          is_broadcast?: boolean
          is_group?: boolean
          read_at?: string | null
          sender_kind?: string | null
          to_id: string
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          from_id?: string
          group_trainer_id?: string | null
          id?: string
          image_url?: string | null
          is_broadcast?: boolean
          is_group?: boolean
          read_at?: string | null
          sender_kind?: string | null
          to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "messages_group_trainer_id_fkey"
            columns: ["group_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics: {
        Row: {
          body_fat_pct: number | null
          client_id: string
          created_at: string | null
          fat_mass: number | null
          id: string
          lean_mass: number | null
          metric_date: string
          source: string | null
          weight: number | null
        }
        Insert: {
          body_fat_pct?: number | null
          client_id: string
          created_at?: string | null
          fat_mass?: number | null
          id?: string
          lean_mass?: number | null
          metric_date: string
          source?: string | null
          weight?: number | null
        }
        Update: {
          body_fat_pct?: number | null
          client_id?: string
          created_at?: string | null
          fat_mass?: number | null
          id?: string
          lean_mass?: number | null
          metric_date?: string
          source?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      movement_assessment_frames: {
        Row: {
          assessment_id: string
          created_at: string
          features: Json | null
          id: string
          keypoints: Json
          rep_index: number | null
          t_ms: number | null
          view: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          features?: Json | null
          id?: string
          keypoints: Json
          rep_index?: number | null
          t_ms?: number | null
          view: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          features?: Json | null
          id?: string
          keypoints?: Json
          rep_index?: number | null
          t_ms?: number | null
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: "movement_assessment_frames_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "movement_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_assessments: {
        Row: {
          acute_flag: boolean
          ai_diagnosis: Json | null
          approved_at: string | null
          assessment_type: string
          calibration: Json | null
          captured_at: string
          captured_by: string
          center_of_mass: Json | null
          chain: Json
          client_id: string
          created_at: string
          created_by: string | null
          ensemble: Json | null
          findings: Json
          id: string
          intake_words: string | null
          keyframe_urls: Json
          keyframes: Json
          overall_confidence: number | null
          pain_map: Json
          proposed_program: Json | null
          quality: Json | null
          reassess_of: string | null
          red_flags: Json
          red_flags_acknowledged_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          routed_program: string | null
          scheduled_program_id: string | null
          status: string
          suspected_root: string | null
          trainer_edits: Json | null
          updated_at: string
          views: Json
          wedge: Json | null
        }
        Insert: {
          acute_flag?: boolean
          ai_diagnosis?: Json | null
          approved_at?: string | null
          assessment_type?: string
          calibration?: Json | null
          captured_at?: string
          captured_by?: string
          center_of_mass?: Json | null
          chain?: Json
          client_id: string
          created_at?: string
          created_by?: string | null
          ensemble?: Json | null
          findings?: Json
          id?: string
          intake_words?: string | null
          keyframe_urls?: Json
          keyframes?: Json
          overall_confidence?: number | null
          pain_map?: Json
          proposed_program?: Json | null
          quality?: Json | null
          reassess_of?: string | null
          red_flags?: Json
          red_flags_acknowledged_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          routed_program?: string | null
          scheduled_program_id?: string | null
          status?: string
          suspected_root?: string | null
          trainer_edits?: Json | null
          updated_at?: string
          views?: Json
          wedge?: Json | null
        }
        Update: {
          acute_flag?: boolean
          ai_diagnosis?: Json | null
          approved_at?: string | null
          assessment_type?: string
          calibration?: Json | null
          captured_at?: string
          captured_by?: string
          center_of_mass?: Json | null
          chain?: Json
          client_id?: string
          created_at?: string
          created_by?: string | null
          ensemble?: Json | null
          findings?: Json
          id?: string
          intake_words?: string | null
          keyframe_urls?: Json
          keyframes?: Json
          overall_confidence?: number | null
          pain_map?: Json
          proposed_program?: Json | null
          quality?: Json | null
          reassess_of?: string | null
          red_flags?: Json
          red_flags_acknowledged_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          routed_program?: string | null
          scheduled_program_id?: string | null
          status?: string
          suspected_root?: string | null
          trainer_edits?: Json | null
          updated_at?: string
          views?: Json
          wedge?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "movement_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "movement_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "movement_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "movement_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "movement_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "movement_assessments_reassess_of_fkey"
            columns: ["reassess_of"]
            isOneToOne: false
            referencedRelation: "movement_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_swap_proposals: {
        Row: {
          client_id: string
          confirmed_at: string | null
          created_at: string
          from_exercise_id: string
          id: string
          needs_fork: boolean
          note_id: string | null
          reason: string
          rejected_at: string | null
          shared_with: string | null
          to_exercise_id: string
        }
        Insert: {
          client_id: string
          confirmed_at?: string | null
          created_at?: string
          from_exercise_id: string
          id?: string
          needs_fork?: boolean
          note_id?: string | null
          reason: string
          rejected_at?: string | null
          shared_with?: string | null
          to_exercise_id: string
        }
        Update: {
          client_id?: string
          confirmed_at?: string | null
          created_at?: string
          from_exercise_id?: string
          id?: string
          needs_fork?: boolean
          note_id?: string | null
          reason?: string
          rejected_at?: string | null
          shared_with?: string | null
          to_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movement_swap_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_swap_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "movement_swap_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "movement_swap_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "movement_swap_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_swap_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "movement_swap_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "movement_swap_proposals_from_exercise_id_fkey"
            columns: ["from_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_swap_proposals_from_exercise_id_fkey"
            columns: ["from_exercise_id"]
            isOneToOne: false
            referencedRelation: "v_my_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_swap_proposals_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "exercise_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_swap_proposals_to_exercise_id_fkey"
            columns: ["to_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_swap_proposals_to_exercise_id_fkey"
            columns: ["to_exercise_id"]
            isOneToOne: false
            referencedRelation: "v_my_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      my_meals: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          items: Json | null
          name: string | null
          totals: Json | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          items?: Json | null
          name?: string | null
          totals?: Json | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          items?: Json | null
          name?: string | null
          totals?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "my_meals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "my_meals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "my_meals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "my_meals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "my_meals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "my_meals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "my_meals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          enabled: boolean
          event_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          event_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          event_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      offplan_workout_logs: {
        Row: {
          client_id: string
          created_at: string | null
          description: string
          details: string | null
          id: string
          log_date: string
          rolled_day_id: string | null
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          description: string
          details?: string | null
          id?: string
          log_date: string
          rolled_day_id?: string | null
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          description?: string
          details?: string | null
          id?: string
          log_date?: string
          rolled_day_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "offplan_workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offplan_workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "offplan_workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "offplan_workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "offplan_workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offplan_workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "offplan_workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      payment_reminders: {
        Row: {
          amount_due: number
          approved_at: string | null
          billing_credits: number | null
          client_ack_at: string | null
          client_id: string | null
          created_at: string | null
          credit_details: Json | null
          due_date: string
          email_sent_at: string | null
          google_event_id: string | null
          half_price_sessions: number
          id: string
          notes: string | null
          notification_status: string
          paid_confirmed_at: string | null
          reminder_sent_at: string | null
          sms_message: string | null
          sms_sent_at: string | null
        }
        Insert: {
          amount_due: number
          approved_at?: string | null
          billing_credits?: number | null
          client_ack_at?: string | null
          client_id?: string | null
          created_at?: string | null
          credit_details?: Json | null
          due_date: string
          email_sent_at?: string | null
          google_event_id?: string | null
          half_price_sessions?: number
          id?: string
          notes?: string | null
          notification_status?: string
          paid_confirmed_at?: string | null
          reminder_sent_at?: string | null
          sms_message?: string | null
          sms_sent_at?: string | null
        }
        Update: {
          amount_due?: number
          approved_at?: string | null
          billing_credits?: number | null
          client_ack_at?: string | null
          client_id?: string | null
          created_at?: string | null
          credit_details?: Json | null
          due_date?: string
          email_sent_at?: string | null
          google_event_id?: string | null
          half_price_sessions?: number
          id?: string
          notes?: string | null
          notification_status?: string
          paid_confirmed_at?: string | null
          reminder_sent_at?: string | null
          sms_message?: string | null
          sms_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "payment_reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "payment_reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "payment_reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "payment_reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      phases: {
        Row: {
          approx_duration: string | null
          created_at: string | null
          id: string
          intent: string | null
          label: string | null
          position: number
          program_id: string
        }
        Insert: {
          approx_duration?: string | null
          created_at?: string | null
          id?: string
          intent?: string | null
          label?: string | null
          position: number
          program_id: string
        }
        Update: {
          approx_duration?: string | null
          created_at?: string | null
          id?: string
          intent?: string | null
          label?: string | null
          position?: number
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phases_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_flip_log: {
        Row: {
          action: string | null
          client_id: string | null
          details: Json | null
          effective_date: string | null
          id: string
          plan_id: string | null
          ran_at: string | null
        }
        Insert: {
          action?: string | null
          client_id?: string | null
          details?: Json | null
          effective_date?: string | null
          id?: string
          plan_id?: string | null
          ran_at?: string | null
        }
        Update: {
          action?: string | null
          client_id?: string | null
          details?: Json | null
          effective_date?: string | null
          id?: string
          plan_id?: string | null
          ran_at?: string | null
        }
        Relationships: []
      }
      plan_rotations: {
        Row: {
          active: boolean
          anchor_monday: string
          client_id: string | null
          created_at: string | null
          id: string
          note: string | null
          template_plan_ids: string[]
          weeks: number
        }
        Insert: {
          active?: boolean
          anchor_monday: string
          client_id?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          template_plan_ids: string[]
          weeks: number
        }
        Update: {
          active?: boolean
          anchor_monday?: string
          client_id?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          template_plan_ids?: string[]
          weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_rotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_rotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "plan_rotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "plan_rotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "plan_rotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_rotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "plan_rotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      prescribed_exercises: {
        Row: {
          alternate_of: string | null
          created_at: string | null
          cue: string | null
          exercise_id: string
          id: string
          intensity_type: string | null
          load_descriptor: string | null
          position: number
          rest: string | null
          section_id: string
          sets: number | null
          superset_group: string | null
          tempo: string | null
          tracked_fields: string[] | null
          unilateral: boolean | null
          use_drop_sets: boolean | null
          use_partials: boolean | null
          use_rest_pause: boolean | null
          volume_type: string | null
          volume_value: string | null
        }
        Insert: {
          alternate_of?: string | null
          created_at?: string | null
          cue?: string | null
          exercise_id: string
          id?: string
          intensity_type?: string | null
          load_descriptor?: string | null
          position: number
          rest?: string | null
          section_id: string
          sets?: number | null
          superset_group?: string | null
          tempo?: string | null
          tracked_fields?: string[] | null
          unilateral?: boolean | null
          use_drop_sets?: boolean | null
          use_partials?: boolean | null
          use_rest_pause?: boolean | null
          volume_type?: string | null
          volume_value?: string | null
        }
        Update: {
          alternate_of?: string | null
          created_at?: string | null
          cue?: string | null
          exercise_id?: string
          id?: string
          intensity_type?: string | null
          load_descriptor?: string | null
          position?: number
          rest?: string | null
          section_id?: string
          sets?: number | null
          superset_group?: string | null
          tempo?: string | null
          tracked_fields?: string[] | null
          unilateral?: boolean | null
          use_drop_sets?: boolean | null
          use_partials?: boolean | null
          use_rest_pause?: boolean | null
          volume_type?: string | null
          volume_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescribed_exercises_alternate_of_fkey"
            columns: ["alternate_of"]
            isOneToOne: false
            referencedRelation: "prescribed_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescribed_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescribed_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "v_my_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescribed_exercises_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      program_assignments: {
        Row: {
          active: boolean | null
          assigned_at: string | null
          client_id: string
          combination_group: string | null
          current_day_in_rotation: number | null
          current_phase_id: string | null
          id: string
          program_id: string
        }
        Insert: {
          active?: boolean | null
          assigned_at?: string | null
          client_id: string
          combination_group?: string | null
          current_day_in_rotation?: number | null
          current_phase_id?: string | null
          id?: string
          program_id: string
        }
        Update: {
          active?: boolean | null
          assigned_at?: string | null
          client_id?: string
          combination_group?: string | null
          current_day_in_rotation?: number | null
          current_phase_id?: string | null
          id?: string
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "program_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "program_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "program_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "program_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "program_assignments_current_phase_id_fkey"
            columns: ["current_phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_versions: {
        Row: {
          change_reason: string | null
          created_at: string | null
          created_by: string | null
          id: string
          program_id: string
          snapshot: Json | null
          version_number: number
        }
        Insert: {
          change_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          program_id: string
          snapshot?: Json | null
          version_number: number
        }
        Update: {
          change_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          program_id?: string
          snapshot?: Json | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_versions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programme_audit: {
        Row: {
          app_name: string | null
          at: string
          auth_uid: string | null
          client_id: string | null
          db_user: string
          id: number
          new_row: Json | null
          old_row: Json | null
          op: string
          program_id: string | null
          row_id: string | null
          summary: string | null
          table_name: string
        }
        Insert: {
          app_name?: string | null
          at?: string
          auth_uid?: string | null
          client_id?: string | null
          db_user?: string
          id?: number
          new_row?: Json | null
          old_row?: Json | null
          op: string
          program_id?: string | null
          row_id?: string | null
          summary?: string | null
          table_name: string
        }
        Update: {
          app_name?: string | null
          at?: string
          auth_uid?: string | null
          client_id?: string | null
          db_user?: string
          id?: number
          new_row?: Json | null
          old_row?: Json | null
          op?: string
          program_id?: string | null
          row_id?: string | null
          summary?: string | null
          table_name?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          owner_trainer_id: string | null
          personal_for_client_id: string | null
          status: string
          structure_type: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          owner_trainer_id?: string | null
          personal_for_client_id?: string | null
          status?: string
          structure_type?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_trainer_id?: string | null
          personal_for_client_id?: string | null
          status?: string
          structure_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_owner_trainer_id_fkey"
            columns: ["owner_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_personal_for_client_id_fkey"
            columns: ["personal_for_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_personal_for_client_id_fkey"
            columns: ["personal_for_client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "programs_personal_for_client_id_fkey"
            columns: ["personal_for_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "programs_personal_for_client_id_fkey"
            columns: ["personal_for_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "programs_personal_for_client_id_fkey"
            columns: ["personal_for_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_personal_for_client_id_fkey"
            columns: ["personal_for_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "programs_personal_for_client_id_fkey"
            columns: ["personal_for_client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      progress_photos: {
        Row: {
          client_id: string
          created_at: string
          id: string
          notes: string | null
          photo_url: string
          pose: string | null
          taken_date: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          photo_url: string
          pose?: string | null
          taken_date: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          photo_url?: string
          pose?: string | null
          taken_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      progression_events: {
        Row: {
          assignment_id: string
          created_at: string | null
          event_date: string
          event_type: string | null
          id: string
          notes: string | null
          trigger: string | null
        }
        Insert: {
          assignment_id: string
          created_at?: string | null
          event_date: string
          event_type?: string | null
          id?: string
          notes?: string | null
          trigger?: string | null
        }
        Update: {
          assignment_id?: string
          created_at?: string | null
          event_date?: string
          event_type?: string | null
          id?: string
          notes?: string | null
          trigger?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "progression_events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "program_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      published_workout_access: {
        Row: {
          client_id: string
          published_workout_id: string
        }
        Insert: {
          client_id: string
          published_workout_id: string
        }
        Update: {
          client_id?: string
          published_workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "published_workout_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_workout_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "published_workout_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "published_workout_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "published_workout_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_workout_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "published_workout_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "published_workout_access_published_workout_id_fkey"
            columns: ["published_workout_id"]
            isOneToOne: false
            referencedRelation: "published_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      published_workouts: {
        Row: {
          created_at: string | null
          created_by: string | null
          day_id: string | null
          description: string | null
          id: string
          name: string
          status: string | null
          updated_at: string | null
          visibility: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          day_id?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string | null
          updated_at?: string | null
          visibility?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          day_id?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string | null
          updated_at?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "published_workouts_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "days"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failed_at: string | null
          id: string
          last_error: string | null
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failed_at?: string | null
          id?: string
          last_error?: string | null
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failed_at?: string | null
          id?: string
          last_error?: string | null
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          amount: number | null
          base_amount: number | null
          carbs: number
          created_at: string
          fats: number
          food: string
          food_id: string | null
          id: string
          micros: Json | null
          note: string | null
          position: number
          protein: number
          recipe_id: string
          source: string
          unit: string | null
        }
        Insert: {
          amount?: number | null
          base_amount?: number | null
          carbs?: number
          created_at?: string
          fats?: number
          food: string
          food_id?: string | null
          id?: string
          micros?: Json | null
          note?: string | null
          position?: number
          protein?: number
          recipe_id: string
          source?: string
          unit?: string | null
        }
        Update: {
          amount?: number | null
          base_amount?: number | null
          carbs?: number
          created_at?: string
          fats?: number
          food?: string
          food_id?: string | null
          id?: string
          micros?: Json | null
          note?: string | null
          position?: number
          protein?: number
          recipe_id?: string
          source?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          client_id: string | null
          cook_minutes: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          instructions: string[]
          prep_minutes: number | null
          review_note: string | null
          reviewed_at: string | null
          servings: number
          submitted_at: string | null
          tags: string[]
          title: string
          total_carbs: number
          total_fats: number
          total_kcal: number
          total_micros: Json | null
          total_protein: number
          updated_at: string
          visibility: string
        }
        Insert: {
          client_id?: string | null
          cook_minutes?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          instructions?: string[]
          prep_minutes?: number | null
          review_note?: string | null
          reviewed_at?: string | null
          servings?: number
          submitted_at?: string | null
          tags?: string[]
          title: string
          total_carbs?: number
          total_fats?: number
          total_kcal?: number
          total_micros?: Json | null
          total_protein?: number
          updated_at?: string
          visibility?: string
        }
        Update: {
          client_id?: string | null
          cook_minutes?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          instructions?: string[]
          prep_minutes?: number | null
          review_note?: string | null
          reviewed_at?: string | null
          servings?: number
          submitted_at?: string | null
          tags?: string[]
          title?: string
          total_carbs?: number
          total_fats?: number
          total_kcal?: number
          total_micros?: Json | null
          total_protein?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "recipes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "recipes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "recipes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "recipes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      reminders: {
        Row: {
          active: boolean | null
          client_id: string
          created_at: string | null
          day_of_month: number | null
          day_of_week: number | null
          id: string
          time_of_day: string | null
          type: string | null
        }
        Insert: {
          active?: boolean | null
          client_id: string
          created_at?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          id?: string
          time_of_day?: string | null
          type?: string | null
        }
        Update: {
          active?: boolean | null
          client_id?: string
          created_at?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          id?: string
          time_of_day?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      schedule_change_proposals: {
        Row: {
          appointment_id: string | null
          client_id: string
          confidence: string
          created_at: string
          day_id: string | null
          detail: Json | null
          from_date: string | null
          gcal_recurring_id: string | null
          id: string
          reason: string
          resolved_at: string | null
          scheduled_workout_id: string | null
          status: string
          to_date: string | null
        }
        Insert: {
          appointment_id?: string | null
          client_id: string
          confidence: string
          created_at?: string
          day_id?: string | null
          detail?: Json | null
          from_date?: string | null
          gcal_recurring_id?: string | null
          id?: string
          reason: string
          resolved_at?: string | null
          scheduled_workout_id?: string | null
          status?: string
          to_date?: string | null
        }
        Update: {
          appointment_id?: string | null
          client_id?: string
          confidence?: string
          created_at?: string
          day_id?: string | null
          detail?: Json | null
          from_date?: string | null
          gcal_recurring_id?: string | null
          id?: string
          reason?: string
          resolved_at?: string | null
          scheduled_workout_id?: string | null
          status?: string
          to_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_change_proposals_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_change_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_change_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "schedule_change_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "schedule_change_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "schedule_change_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_change_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "schedule_change_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "schedule_change_proposals_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_change_proposals_scheduled_workout_id_fkey"
            columns: ["scheduled_workout_id"]
            isOneToOne: false
            referencedRelation: "scheduled_workouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_change_proposals_scheduled_workout_id_fkey"
            columns: ["scheduled_workout_id"]
            isOneToOne: false
            referencedRelation: "v_client_calendar"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_generation_log: {
        Row: {
          action: string
          client_id: string
          created_at: string
          day_id: string | null
          detail: string | null
          generated_batch_id: string
          id: string
          pattern_id: string | null
          scheduled_date: string
        }
        Insert: {
          action: string
          client_id: string
          created_at?: string
          day_id?: string | null
          detail?: string | null
          generated_batch_id: string
          id?: string
          pattern_id?: string | null
          scheduled_date: string
        }
        Update: {
          action?: string
          client_id?: string
          created_at?: string
          day_id?: string | null
          detail?: string | null
          generated_batch_id?: string
          id?: string
          pattern_id?: string | null
          scheduled_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_generation_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_generation_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "schedule_generation_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "schedule_generation_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "schedule_generation_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_generation_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "schedule_generation_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      scheduled_workouts: {
        Row: {
          appointment_id: string | null
          assignment_id: string | null
          client_id: string
          created_at: string | null
          day_id: string | null
          deleted_at: string | null
          id: string
          moved_by: string | null
          moved_from_date: string | null
          position: number | null
          published_workout_id: string | null
          scheduled_date: string
          source: string | null
          status: string | null
          supervised: boolean
          updated_at: string | null
          workout_log_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id: string
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date: string
          source?: string | null
          status?: string | null
          supervised?: boolean
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          assignment_id?: string | null
          client_id?: string
          created_at?: string | null
          day_id?: string | null
          deleted_at?: string | null
          id?: string
          moved_by?: string | null
          moved_from_date?: string | null
          position?: number | null
          published_workout_id?: string | null
          scheduled_date?: string
          source?: string | null
          status?: string | null
          supervised?: boolean
          updated_at?: string | null
          workout_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_workouts_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_workouts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "program_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "scheduled_workouts_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_workouts_published_workout_id_fkey"
            columns: ["published_workout_id"]
            isOneToOne: false
            referencedRelation: "published_workouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_workouts_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          client_facing_name: string | null
          created_at: string | null
          day_id: string
          id: string
          internal_name: string | null
          position: number
        }
        Insert: {
          client_facing_name?: string | null
          created_at?: string | null
          day_id: string
          id?: string
          internal_name?: string | null
          position: number
        }
        Update: {
          client_facing_name?: string | null
          created_at?: string | null
          day_id?: string
          id?: string
          internal_name?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "sections_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "days"
            referencedColumns: ["id"]
          },
        ]
      }
      session_notes: {
        Row: {
          appointment_id: string | null
          client_id: string
          created_at: string | null
          id: string
          note_date: string
          note_text: string
          note_type: string | null
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          client_id: string
          created_at?: string | null
          id?: string
          note_date?: string
          note_text: string
          note_type?: string | null
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          client_id?: string
          created_at?: string | null
          id?: string
          note_date?: string
          note_text?: string
          note_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "session_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "session_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "session_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "session_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      set_logs: {
        Row: {
          client_id: string | null
          completed: boolean | null
          created_at: string | null
          distance_meters: number | null
          duration_seconds: number | null
          exercise_id: string | null
          heart_rate: number | null
          id: string
          logged_at: string | null
          notes: string | null
          prescribed_exercise_id: string | null
          reps: number | null
          rpe: number | null
          set_number: number | null
          speed: number | null
          weight: number | null
          weight_lbs: number | null
          workout_log_id: string
        }
        Insert: {
          client_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          exercise_id?: string | null
          heart_rate?: number | null
          id?: string
          logged_at?: string | null
          notes?: string | null
          prescribed_exercise_id?: string | null
          reps?: number | null
          rpe?: number | null
          set_number?: number | null
          speed?: number | null
          weight?: number | null
          weight_lbs?: number | null
          workout_log_id: string
        }
        Update: {
          client_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          exercise_id?: string | null
          heart_rate?: number | null
          id?: string
          logged_at?: string | null
          notes?: string | null
          prescribed_exercise_id?: string | null
          reps?: number | null
          rpe?: number | null
          set_number?: number | null
          speed?: number | null
          weight?: number | null
          weight_lbs?: number | null
          workout_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "set_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "v_my_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_prescribed_exercise_id_fkey"
            columns: ["prescribed_exercise_id"]
            isOneToOne: false
            referencedRelation: "prescribed_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      skinfold_logs: {
        Row: {
          age: number | null
          body_density: number | null
          body_fat_pct: number | null
          client_id: string
          created_at: string | null
          id: string
          log_date: string
          method: string
          sex: string | null
          sites: Json
          sum_mm: number | null
        }
        Insert: {
          age?: number | null
          body_density?: number | null
          body_fat_pct?: number | null
          client_id: string
          created_at?: string | null
          id?: string
          log_date?: string
          method: string
          sex?: string | null
          sites: Json
          sum_mm?: number | null
        }
        Update: {
          age?: number | null
          body_density?: number | null
          body_fat_pct?: number | null
          client_id?: string
          created_at?: string | null
          id?: string
          log_date?: string
          method?: string
          sex?: string | null
          sites?: Json
          sum_mm?: number | null
        }
        Relationships: []
      }
      trainer_face_variants: {
        Row: {
          created_at: string
          id: string
          ord: number
          slug: string
          storage_path: string
          trainer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ord?: number
          slug: string
          storage_path: string
          trainer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ord?: number
          slug?: string
          storage_path?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_face_variants_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_features: {
        Row: {
          birthdays_enabled: boolean
          coachbot_enabled: boolean
          trainer_id: string
          updated_at: string
          weekly_focus_enabled: boolean
        }
        Insert: {
          birthdays_enabled?: boolean
          coachbot_enabled?: boolean
          trainer_id: string
          updated_at?: string
          weekly_focus_enabled?: boolean
        }
        Update: {
          birthdays_enabled?: boolean
          coachbot_enabled?: boolean
          trainer_id?: string
          updated_at?: string
          weekly_focus_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "trainer_features_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: true
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_notes: {
        Row: {
          author: string | null
          client_id: string
          created_at: string | null
          day_id: string | null
          exercise_id: string | null
          id: string
          note: string
          prescribed_exercise_id: string | null
        }
        Insert: {
          author?: string | null
          client_id: string
          created_at?: string | null
          day_id?: string | null
          exercise_id?: string | null
          id?: string
          note: string
          prescribed_exercise_id?: string | null
        }
        Update: {
          author?: string | null
          client_id?: string
          created_at?: string | null
          day_id?: string | null
          exercise_id?: string | null
          id?: string
          note?: string
          prescribed_exercise_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainer_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "trainer_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "trainer_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "trainer_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "trainer_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "trainer_notes_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_notes_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_notes_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "v_my_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_notes_prescribed_exercise_id_fkey"
            columns: ["prescribed_exercise_id"]
            isOneToOne: false
            referencedRelation: "prescribed_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_settings: {
        Row: {
          gcal_sync_enabled: boolean
          google_access_token: string | null
          google_channel_expiry: string | null
          google_channel_id: string | null
          google_channel_resource_id: string | null
          google_refresh_token: string | null
          google_sync_token: string | null
          google_token_expiry: string | null
          id: string
          theme: string | null
          trainer_email: string | null
          tutorial_dismissed_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          gcal_sync_enabled?: boolean
          google_access_token?: string | null
          google_channel_expiry?: string | null
          google_channel_id?: string | null
          google_channel_resource_id?: string | null
          google_refresh_token?: string | null
          google_sync_token?: string | null
          google_token_expiry?: string | null
          id?: string
          theme?: string | null
          trainer_email?: string | null
          tutorial_dismissed_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          gcal_sync_enabled?: boolean
          google_access_token?: string | null
          google_channel_expiry?: string | null
          google_channel_id?: string | null
          google_channel_resource_id?: string | null
          google_refresh_token?: string | null
          google_sync_token?: string | null
          google_token_expiry?: string | null
          id?: string
          theme?: string | null
          trainer_email?: string | null
          tutorial_dismissed_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      trainers: {
        Row: {
          active: boolean
          auth_user_id: string | null
          avatar_url: string | null
          bot_set: string | null
          cashapp_handle: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          name: string | null
          pay_display_name: string | null
          pay_phone: string | null
          role: string
          session_feed_enabled: boolean
          session_feed_name_style: string
          session_feed_token: string | null
          session_mirror_calendar_id: string | null
          session_mirror_cursor: string | null
          session_mirror_enabled: boolean
          session_mirror_error: string | null
          session_mirror_synced_at: string | null
          venmo_username: string | null
          zelle_email: string | null
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          avatar_url?: string | null
          bot_set?: string | null
          cashapp_handle?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          name?: string | null
          pay_display_name?: string | null
          pay_phone?: string | null
          role?: string
          session_feed_enabled?: boolean
          session_feed_name_style?: string
          session_feed_token?: string | null
          session_mirror_calendar_id?: string | null
          session_mirror_cursor?: string | null
          session_mirror_enabled?: boolean
          session_mirror_error?: string | null
          session_mirror_synced_at?: string | null
          venmo_username?: string | null
          zelle_email?: string | null
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          avatar_url?: string | null
          bot_set?: string | null
          cashapp_handle?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          name?: string | null
          pay_display_name?: string | null
          pay_phone?: string | null
          role?: string
          session_feed_enabled?: boolean
          session_feed_name_style?: string
          session_feed_token?: string | null
          session_mirror_calendar_id?: string | null
          session_mirror_cursor?: string | null
          session_mirror_enabled?: boolean
          session_mirror_error?: string | null
          session_mirror_synced_at?: string | null
          venmo_username?: string | null
          zelle_email?: string | null
        }
        Relationships: []
      }
      usda_nutrient_map: {
        Row: {
          max_plausible: number
          nutrient_key: string
          target_unit: string
          usda_id: number
          usda_number: string | null
        }
        Insert: {
          max_plausible: number
          nutrient_key: string
          target_unit: string
          usda_id: number
          usda_number?: string | null
        }
        Update: {
          max_plausible?: number
          nutrient_key?: string
          target_unit?: string
          usda_id?: number
          usda_number?: string | null
        }
        Relationships: []
      }
      weekly_focus_drafts: {
        Row: {
          approved_at: string | null
          client_id: string
          created_at: string
          edited_at: string | null
          focus: string
          focus_ai: string | null
          id: string
          published_at: string | null
          week_start: string
        }
        Insert: {
          approved_at?: string | null
          client_id: string
          created_at?: string
          edited_at?: string | null
          focus: string
          focus_ai?: string | null
          id?: string
          published_at?: string | null
          week_start: string
        }
        Update: {
          approved_at?: string | null
          client_id?: string
          created_at?: string
          edited_at?: string | null
          focus?: string
          focus_ai?: string | null
          id?: string
          published_at?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_focus_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_focus_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "weekly_focus_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "weekly_focus_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "weekly_focus_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_focus_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "weekly_focus_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          client_id: string
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          day_id: string | null
          duration_minutes: number | null
          id: string
          log_date: string
          note: string | null
          source: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          client_id: string
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          day_id?: string | null
          duration_minutes?: number | null
          id?: string
          log_date: string
          note?: string | null
          source?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          client_id?: string
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          day_id?: string | null
          duration_minutes?: number | null
          id?: string
          log_date?: string
          note?: string | null
          source?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_logs_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "days"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ai_usage_daily: {
        Row: {
          calls: number | null
          client_id: string | null
          cost_usd: number | null
          feature: string | null
          tokens_in: number | null
          tokens_out: number | null
          used_on: string | null
        }
        Relationships: []
      }
      ai_usage_monthly: {
        Row: {
          calls: number | null
          cost_usd: number | null
          month: string | null
          tokens_in: number | null
          tokens_out: number | null
        }
        Relationships: []
      }
      v_active_challenge: {
        Row: {
          announced_at: string | null
          auto_generated: boolean | null
          counts_external: boolean | null
          created_at: string | null
          created_by: string | null
          days_left: number | null
          emoji: string | null
          ended_at: string | null
          ends_on: string | null
          id: string | null
          metric: string | null
          next_pick_client_id: string | null
          participant_count: number | null
          rules: string | null
          scored_at: string | null
          scoring_note: string | null
          scoring_stat: string | null
          starts_on: string | null
          status: string | null
          tagline: string | null
          title: string | null
          trainer_id: string | null
          winner_client_id: string | null
          winner_score: number | null
        }
        Insert: {
          announced_at?: string | null
          auto_generated?: boolean | null
          counts_external?: boolean | null
          created_at?: string | null
          created_by?: string | null
          days_left?: never
          emoji?: string | null
          ended_at?: string | null
          ends_on?: string | null
          id?: string | null
          metric?: string | null
          next_pick_client_id?: string | null
          participant_count?: never
          rules?: string | null
          scored_at?: string | null
          scoring_note?: string | null
          scoring_stat?: string | null
          starts_on?: string | null
          status?: string | null
          tagline?: string | null
          title?: string | null
          trainer_id?: string | null
          winner_client_id?: string | null
          winner_score?: number | null
        }
        Update: {
          announced_at?: string | null
          auto_generated?: boolean | null
          counts_external?: boolean | null
          created_at?: string | null
          created_by?: string | null
          days_left?: never
          emoji?: string | null
          ended_at?: string | null
          ends_on?: string | null
          id?: string | null
          metric?: string | null
          next_pick_client_id?: string | null
          participant_count?: never
          rules?: string | null
          scored_at?: string | null
          scoring_note?: string | null
          scoring_stat?: string | null
          starts_on?: string | null
          status?: string | null
          tagline?: string | null
          title?: string | null
          trainer_id?: string | null
          winner_client_id?: string | null
          winner_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_next_pick_client_id_fkey"
            columns: ["next_pick_client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "group_challenges_winner_client_id_fkey"
            columns: ["winner_client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_challenge_roster: {
        Row: {
          cid: string | null
          cname: string | null
          ranked: boolean | null
          tid: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_trainer_id_fkey"
            columns: ["tid"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_client_assessment: {
        Row: {
          activity_level: string | null
          arms_fall_forward: boolean | null
          assessed_at: string | null
          assessment_id: string | null
          assessment_status: string | null
          assessment_updated_at: string | null
          balance_deficits: boolean | null
          block_length_weeks: number | null
          block_start_date: string | null
          cardio_days_of_week: string[] | null
          cardio_days_per_week: number | null
          cardio_intensity: string | null
          cardio_modality: string | null
          chronic_conditions: string | null
          client: string | null
          client_id: string | null
          contraindicated_movements: string | null
          current_injuries: string | null
          equipment_access: string | null
          excessive_forward_lean: boolean | null
          experience_level: string | null
          feet_turn_out: boolean | null
          forward_head: boolean | null
          goal_notes: string | null
          goal_timeline: string | null
          has_clinical_findings: boolean | null
          has_no_assessment: boolean | null
          hip_issues: boolean | null
          injuries_limitations: string | null
          knees_cave_in: boolean | null
          lateral_asymmetry: boolean | null
          low_back_arch: boolean | null
          medical_clearance: boolean | null
          medical_notes: string | null
          medications: string | null
          ohsa_notes: string | null
          pain_location: string | null
          pain_onset: string | null
          primary_goal: string | null
          prior_surgeries: string | null
          secondary_goal: string | null
          session_length_minutes: number | null
          solo_day_focus: string | null
          solo_days_of_week: string[] | null
          solo_days_per_week: number | null
          trained_days_of_week: string[] | null
          trained_days_per_week: number | null
          trainer_notes: string | null
          training_location: string | null
          years_training: number | null
        }
        Relationships: []
      }
      v_client_calendar: {
        Row: {
          client_id: string | null
          day_label: string | null
          id: string | null
          phase_label: string | null
          position: number | null
          program_name: string | null
          published_name: string | null
          scheduled_date: string | null
          source: string | null
          status: string | null
          workout_log_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "scheduled_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "scheduled_workouts_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      v_client_calendar_pattern: {
        Row: {
          client_id: string | null
          client_name: string | null
          future_cancelled: number | null
          future_n: number | null
          is_recurring: boolean | null
          is_retired: boolean | null
          past_n: number | null
          pattern_dow: number | null
          pattern_time: string | null
          series: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_client_now: {
        Row: {
          active_programs: string[] | null
          appts_next_28d: number | null
          billing_cadence: string | null
          billing_type: string | null
          calories: number | null
          carbs: number | null
          client: string | null
          client_id: string | null
          completion_28d_pct: number | null
          completion_7d_pct: number | null
          coverage_days_left: number | null
          coverage_through: string | null
          current_fees: number | null
          days_since_weigh_in: number | null
          done_28d: number | null
          done_7d: number | null
          fats: number | null
          food_logs_28d: number | null
          food_logs_7d: number | null
          has_live_meal_plan: boolean | null
          is_archived: boolean | null
          is_test: boolean | null
          latest_body_fat_pct: number | null
          latest_metric_date: string | null
          latest_metric_source: string | null
          latest_weight: number | null
          macros_are_placeholder: boolean | null
          macros_set_on: string | null
          n_active_programs: number | null
          next_supervised: boolean | null
          next_workout: string | null
          next_workout_date: string | null
          nutrition_state: string | null
          open_schedule_proposals: number | null
          protein: number | null
          sched_28d: number | null
          sched_7d: number | null
          session_rate: number | null
          slug: string | null
        }
        Relationships: []
      }
      v_client_profile: {
        Row: {
          age: number | null
          created_at: string | null
          current_body_fat_pct: number | null
          current_fees: number | null
          current_weight: number | null
          date_of_birth: string | null
          email: string | null
          experience_level: string | null
          fat_mass: number | null
          id: string | null
          injuries_limitations: string | null
          is_self_coached: boolean | null
          lean_mass: number | null
          name: string | null
          notes: string | null
          primary_goal: string | null
          secondary_goals: string | null
          slug: string | null
          start_date: string | null
          training_frequency: number | null
          updated_at: string | null
        }
        Insert: {
          age?: never
          created_at?: string | null
          current_body_fat_pct?: number | null
          current_fees?: number | null
          current_weight?: number | null
          date_of_birth?: string | null
          email?: string | null
          experience_level?: string | null
          fat_mass?: never
          id?: string | null
          injuries_limitations?: string | null
          is_self_coached?: boolean | null
          lean_mass?: never
          name?: string | null
          notes?: string | null
          primary_goal?: string | null
          secondary_goals?: string | null
          slug?: string | null
          start_date?: string | null
          training_frequency?: number | null
          updated_at?: string | null
        }
        Update: {
          age?: never
          created_at?: string | null
          current_body_fat_pct?: number | null
          current_fees?: number | null
          current_weight?: number | null
          date_of_birth?: string | null
          email?: string | null
          experience_level?: string | null
          fat_mass?: never
          id?: string | null
          injuries_limitations?: string | null
          is_self_coached?: boolean | null
          lean_mass?: never
          name?: string | null
          notes?: string | null
          primary_goal?: string | null
          secondary_goals?: string | null
          slug?: string | null
          start_date?: string | null
          training_frequency?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      v_client_training_history: {
        Row: {
          block_age_days: number | null
          block_age_weeks: number | null
          block_overdue: boolean | null
          block_started: string | null
          client: string | null
          client_id: string | null
          current_program: string | null
          days_since_last_session: number | null
          distinct_days_in_use: number | null
          distinct_exercises_28d: number | null
          distinct_exercises_56d: number | null
          last_session: string | null
          low_variety: boolean | null
          multiple_stalled: boolean | null
          muscle_groups_28d: number | null
          n_holding: number | null
          n_no_comparison: number | null
          n_progressing: number | null
          n_regressing: number | null
          n_stalled: number | null
          needs_progression_review: boolean | null
          pct_volume_top5: number | null
          review_reason: string | null
          sessions_28d: number | null
          stalled_exercises: string[] | null
        }
        Relationships: []
      }
      v_exercise_history: {
        Row: {
          client_id: string | null
          exercise_id: string | null
          log_date: string | null
          notes: string | null
          reps: number | null
          set_number: number | null
          weight: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_exercise_progression: {
        Row: {
          avg_rpe: number | null
          avg_weight: number | null
          client: string | null
          client_id: string | null
          days_since_prev: number | null
          delta_est_1rm: number | null
          delta_n_sets: number | null
          delta_top_weight: number | null
          delta_total_reps: number | null
          delta_total_volume: number | null
          delta_total_volume_pct: number | null
          est_1rm: number | null
          exercise: string | null
          exercise_id: string | null
          log_date: string | null
          modality: string | null
          muscle_group: string | null
          n_sets: number | null
          prescribed_cue: string | null
          prescribed_load_descriptor: string | null
          prescribed_sets: number | null
          prescribed_volume_type: string | null
          prescribed_volume_value: string | null
          prev_date: string | null
          prev_est_1rm: number | null
          prev_top_weight: number | null
          prev_total_volume: number | null
          top_weight: number | null
          total_distance_meters: number | null
          total_duration_seconds: number | null
          total_reps: number | null
          total_volume: number | null
          trend: string | null
        }
        Relationships: [
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "set_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "set_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "v_my_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      v_integrity_flags: {
        Row: {
          check_name: string | null
          count: number | null
          detail: Json | null
          ran_at: string | null
          severity: string | null
        }
        Relationships: []
      }
      v_metrics_trend: {
        Row: {
          body_fat_pct: number | null
          client_id: string | null
          fat_mass: number | null
          lean_mass: number | null
          metric_date: string | null
          source: string | null
          weight: number | null
        }
        Insert: {
          body_fat_pct?: number | null
          client_id?: string | null
          fat_mass?: number | null
          lean_mass?: number | null
          metric_date?: string | null
          source?: string | null
          weight?: number | null
        }
        Update: {
          body_fat_pct?: number | null
          client_id?: string | null
          fat_mass?: number | null
          lean_mass?: number | null
          metric_date?: string | null
          source?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_my_exercises: {
        Row: {
          aliases: string[] | null
          availability_status: string | null
          client_owner_id: string | null
          corrective_phase_tags: string[] | null
          created_at: string | null
          created_by: string | null
          default_tracked_fields: string[] | null
          equipment_required: string[] | null
          everfit_name: string | null
          forked_from_id: string | null
          id: string | null
          is_mine: boolean | null
          is_my_edit_of_a_house_movement: boolean | null
          load_is_assistance: boolean | null
          modality: string | null
          muscle_group: string | null
          name: string | null
          owner_trainer_id: string | null
          video_checked_at: string | null
          video_status: string | null
          video_url: string | null
        }
        Insert: {
          aliases?: string[] | null
          availability_status?: string | null
          client_owner_id?: string | null
          corrective_phase_tags?: string[] | null
          created_at?: string | null
          created_by?: string | null
          default_tracked_fields?: string[] | null
          equipment_required?: string[] | null
          everfit_name?: string | null
          forked_from_id?: string | null
          id?: string | null
          is_mine?: never
          is_my_edit_of_a_house_movement?: never
          load_is_assistance?: boolean | null
          modality?: string | null
          muscle_group?: string | null
          name?: string | null
          owner_trainer_id?: string | null
          video_checked_at?: string | null
          video_status?: string | null
          video_url?: string | null
        }
        Update: {
          aliases?: string[] | null
          availability_status?: string | null
          client_owner_id?: string | null
          corrective_phase_tags?: string[] | null
          created_at?: string | null
          created_by?: string | null
          default_tracked_fields?: string[] | null
          equipment_required?: string[] | null
          everfit_name?: string | null
          forked_from_id?: string | null
          id?: string | null
          is_mine?: never
          is_my_edit_of_a_house_movement?: never
          load_is_assistance?: boolean | null
          modality?: string | null
          muscle_group?: string | null
          name?: string | null
          owner_trainer_id?: string | null
          video_checked_at?: string | null
          video_status?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_challenge_roster"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_client_assessment"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_client_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_client_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_client_training_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "exercises_client_owner_id_fkey"
            columns: ["client_owner_id"]
            isOneToOne: false
            referencedRelation: "v_nutrition_now"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "exercises_forked_from_id_fkey"
            columns: ["forked_from_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_forked_from_id_fkey"
            columns: ["forked_from_id"]
            isOneToOne: false
            referencedRelation: "v_my_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_owner_trainer_id_fkey"
            columns: ["owner_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_nutrition_now: {
        Row: {
          avg_carbs_28d: number | null
          avg_carbs_7d: number | null
          avg_fats_28d: number | null
          avg_fats_7d: number | null
          avg_kcal_28d: number | null
          avg_kcal_7d: number | null
          avg_protein_28d: number | null
          avg_protein_7d: number | null
          client: string | null
          client_id: string | null
          days_since_last_log: number | null
          has_no_plan: boolean | null
          has_plan: boolean | null
          kcal_vs_target_pct_28d: number | null
          last_log_date: string | null
          macros_are_placeholder: boolean | null
          macros_set_on: string | null
          meal_plan_id: string | null
          n_days_logged_28d: number | null
          n_days_logged_7d: number | null
          n_kcal_unknown_28d: number | null
          n_logs_28d: number | null
          n_logs_7d: number | null
          n_plan_items: number | null
          n_plan_meals: number | null
          n_skipped_28d: number | null
          nutrition_state: string | null
          off_plan_pct_28d: number | null
          on_plan_pct_28d: number | null
          plan_effective_date: string | null
          plan_title: string | null
          target_calories: number | null
          target_carbs: number | null
          target_fats: number | null
          target_protein: number | null
        }
        Relationships: []
      }
      v_plan_vs_actual: {
        Row: {
          appointment_at: string | null
          appointment_status: string | null
          appointment_time_ct: string | null
          client: string | null
          client_id: string | null
          day_label: string | null
          day_labels: string[] | null
          duration_minutes: number | null
          gap_reason: string | null
          is_past: boolean | null
          is_supervised: boolean | null
          log_status: string | null
          moved_from_date: string | null
          n_appointments: number | null
          n_appointments_live: number | null
          n_exercises: number | null
          n_logs: number | null
          n_scheduled: number | null
          n_sets: number | null
          n_supervised: number | null
          program_name: string | null
          program_names: string[] | null
          scheduled_date: string | null
          scheduled_status: string | null
          scheduled_workout_id: string | null
          total_volume: number | null
          workout_log_id: string | null
        }
        Relationships: []
      }
      v_schedule_proposals: {
        Row: {
          client: string | null
          confidence: string | null
          created_at: string | null
          detail: Json | null
          from_date: string | null
          id: string | null
          reason: string | null
          to_date: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      ack_payment_reminder: {
        Args: { reminder_id: string }
        Returns: undefined
      }
      activate_due_meal_plans: { Args: never; Returns: undefined }
      ai_feature_health: {
        Args: { p_since: string; p_trainer?: string }
        Returns: {
          calls: number
          failures: number
          feature: string
          last_error_at: string
          last_error_text: string
          last_ok: string
          median_ms: number
          model: string
          month_usd: number
          recent_failed: number
          usd: number
        }[]
      }
      announce_challenge_winner: {
        Args: { p_challenge_id: string }
        Returns: boolean
      }
      apply_movement_swap: { Args: { p_proposal_id: string }; Returns: number }
      apply_scheduled_archives: {
        Args: never
        Returns: {
          client_id: string
          client_name: string
          effective_on: string
        }[]
      }
      backfill_off_micros: {
        Args: { p_length?: number; p_pages?: number }
        Returns: Json
      }
      challenge_cycle_tick: { Args: never; Returns: string }
      challenge_group_total: {
        Args: { p_challenge_id: string }
        Returns: {
          contributors: number
          group_total: number
          joined: boolean
          my_score: number
        }[]
      }
      challenge_leaderboard: {
        Args: { p_challenge_id: string }
        Returns: {
          client_id: string
          client_name: string
          is_me: boolean
          joined: boolean
          rnk: number
          score: number
        }[]
      }
      claim_off_import: {
        Args: { max_stale_minutes?: number }
        Returns: {
          cursor: number
          fail_count: number
          imported_count: number
          last_error: string | null
          source: string
          status: string
          total_available: number | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "food_import_state"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clients_logging_food: {
        Args: { p_since: string }
        Returns: {
          client_id: string
        }[]
      }
      clone_meal_plan: {
        Args: {
          p_effective: string
          p_source: string
          p_status?: string
          p_title?: string
        }
        Returns: string
      }
      close_due_challenge: { Args: never; Returns: string }
      day_is_exclusive_to: {
        Args: { p_client_id: string; p_day_id: string }
        Returns: boolean
      }
      detect_schedule_changes: { Args: never; Returns: number }
      dismiss_admin_row: {
        Args: { p_row_key: string; p_subject_id?: string; p_until: string }
        Returns: undefined
      }
      duplicate_program_for_me: {
        Args: { p_new_name?: string; p_program: string }
        Returns: string
      }
      ensure_personal_phase: { Args: { p_client_id: string }; Returns: string }
      ensure_trainer_self_client: {
        Args: { p_trainer: string }
        Returns: string
      }
      finish_off_import: {
        Args: { p_cursor: number; p_inserted: number; p_status: string }
        Returns: undefined
      }
      flip_due_meal_plans: {
        Args: { p_today?: string }
        Returns: {
          client_id: string
          plan_went_live: string
          plans_archived: string[]
        }[]
      }
      fork_day_for_client: {
        Args: { p_client_id: string; p_day_id: string }
        Returns: string
      }
      fork_exercise_for_me: { Args: { p_exercise: string }; Returns: string }
      gcal_clear_appointments: { Args: never; Returns: undefined }
      gcal_generate_payment_notifications: { Args: never; Returns: number }
      gcal_get_clients: {
        Args: { p_trainer_id?: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      gcal_get_tokens: {
        Args: { p_user_id?: string }
        Returns: {
          gcal_sync_enabled: boolean
          google_access_token: string
          google_refresh_token: string
          google_token_expiry: string
          user_id: string
        }[]
      }
      gcal_list_connected_trainers: {
        Args: never
        Returns: {
          is_owner: boolean
          trainer_id: string
          trainer_name: string
          user_id: string
        }[]
      }
      gcal_reconcile_appointments: {
        Args: {
          p_seen_ids: string[]
          p_time_max: string
          p_time_min: string
          p_trainer_id?: string
        }
        Returns: Json
      }
      gcal_reconcile_payments: {
        Args: {
          p_seen_ids: string[]
          p_time_max: string
          p_time_min: string
          p_trainer_id?: string
        }
        Returns: Json
      }
      gcal_sync_appointments: { Args: { p_appointments: Json }; Returns: Json }
      gcal_sync_payments: { Args: { p_payments: Json }; Returns: Json }
      gcal_update_access_token: {
        Args: {
          p_access_token: string
          p_token_expiry: string
          p_user_id: string
        }
        Returns: undefined
      }
      generate_due_payment_reminders: { Args: never; Returns: number }
      generate_next_challenge:
        | { Args: never; Returns: string }
        | { Args: { p_trainer?: string }; Returns: string }
      generate_rotation_plans: {
        Args: { p_horizon_weeks?: number }
        Returns: {
          client_id: string
          cycle_index: number
          effective_date: string
          items_cloned: number
          meals_cloned: number
          new_plan_id: string
        }[]
      }
      generate_scheduled_workouts: {
        Args: { p_client?: string; p_dry_run?: boolean; p_weeks?: number }
        Returns: {
          action: string
          batch_id: string
          client_name: string
          day_label: string
          detail: string
          scheduled_date: string
          supervised: boolean
          weekday: number
        }[]
      }
      get_api_key: { Args: { p_name: string }; Returns: string }
      harvest_gcal_sync_runs: { Args: never; Returns: number }
      hide_exercise_for_me: {
        Args: { p_exercise: string; p_hidden?: boolean }
        Returns: undefined
      }
      import_off_bulk: {
        Args: { p_length?: number; p_pages?: number }
        Returns: Json
      }
      import_off_food_batch: { Args: { rows: Json }; Returns: number }
      import_usda_generic: {
        Args: { p_pages?: number; p_size?: number }
        Returns: Json
      }
      is_owner: { Args: never; Returns: boolean }
      is_trainer: { Args: never; Returns: boolean }
      library_day_exercise_counts: {
        Args: never
        Returns: {
          day_id: string
          exercise_count: number
        }[]
      }
      mark_group_read: { Args: never; Returns: string }
      match_food_for_ai: {
        Args: { p_client_id?: string; p_limit?: number; p_term: string }
        Returns: {
          ai_verified_at: string | null
          barcode: string | null
          brand: string | null
          carbs: number | null
          created_at: string | null
          created_by_client_id: string | null
          fats: number | null
          fiber: number | null
          id: string
          kcal: number | null
          micros: Json | null
          micros_source: string | null
          name: string
          protein: number | null
          sat_fat: number | null
          serving_desc: string | null
          serving_grams: number | null
          serving_options: Json | null
          sodium: number | null
          source: string | null
          sugar: number | null
          verified: boolean | null
        }[]
        SetofOptions: {
          from: "*"
          to: "food_catalog"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      measure_video_durations: { Args: { p_batches?: number }; Returns: Json }
      my_client_id: { Args: never; Returns: string }
      my_gcal_sync_health: {
        Args: never
        Returns: {
          error: string
          ok: boolean
          queued_at: string
          response: Json
          scope: string
          status_code: number
        }[]
      }
      my_group_trainer_id: { Args: never; Returns: string }
      my_group_trainer_id_for: { Args: { p_user: string }; Returns: string }
      my_trainer_email: { Args: never; Returns: string }
      my_trainer_id: { Args: never; Returns: string }
      my_trainer_user_id: { Args: never; Returns: string }
      off_micros: { Args: { nm: Json }; Returns: Json }
      off_nut: {
        Args: { key: string; max_plausible: number; nm: Json; scale: number }
        Returns: number
      }
      owner_trainer_user_id: { Args: never; Returns: string }
      plan_extra: {
        Args: { p_billing_type: string; p_plan: number; p_trained: number }
        Returns: number
      }
      programming_coverage: {
        Args: never
        Returns: {
          client_id: string
          client_name: string
          days_left: number
          last_date: string
        }[]
      }
      publish_focus_drafts: {
        Args: { p_only_approved?: boolean; p_week: string }
        Returns: number
      }
      recalc_pending_payment_reminders: {
        Args: never
        Returns: {
          billing_type: string
          blocked_reason: string
          changed: boolean
          client_name: string
          new_amount: number
          old_amount: number
          reminder_id: string
          sessions_cancelled: number
          sessions_trained: number
        }[]
      }
      resolve_schedule_proposal: {
        Args: { p_decision: string; p_id: string; p_note?: string }
        Returns: {
          client: string
          detail: string
          outcome: string
          proposal_id: string
          reason: string
          rows_changed: number
        }[]
      }
      run_day_isolation_checks: { Args: never; Returns: number }
      run_integrity_checks: { Args: never; Returns: number }
      run_nutrition_integrity_checks: { Args: never; Returns: number }
      run_programme_ownership_checks: { Args: never; Returns: number }
      run_scheduling_integrity_checks: { Args: never; Returns: number }
      run_scheduling_invariant_checks: { Args: never; Returns: number }
      run_workout_name_checks: { Args: never; Returns: number }
      run_workout_ownership_checks: { Args: never; Returns: number }
      save_google_tokens: {
        Args: {
          p_access_token: string
          p_gcal_enabled?: boolean
          p_refresh_token: string
          p_token_expiry: string
          p_user_id: string
        }
        Returns: undefined
      }
      sched_day_ids: { Args: never; Returns: string[] }
      sched_phase_ids: { Args: never; Returns: string[] }
      sched_program_ids: { Args: never; Returns: string[] }
      sched_section_ids: { Args: never; Returns: string[] }
      search_food_catalog: {
        Args: {
          p_client_id?: string
          p_limit?: number
          p_mine_only?: boolean
          p_term: string
        }
        Returns: {
          ai_verified_at: string | null
          barcode: string | null
          brand: string | null
          carbs: number | null
          created_at: string | null
          created_by_client_id: string | null
          fats: number | null
          fiber: number | null
          id: string
          kcal: number | null
          micros: Json | null
          micros_source: string | null
          name: string
          protein: number | null
          sat_fat: number | null
          serving_desc: string | null
          serving_grams: number | null
          serving_options: Json | null
          sodium: number | null
          source: string | null
          sugar: number | null
          verified: boolean | null
        }[]
        SetofOptions: {
          from: "*"
          to: "food_catalog"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      session_feed_rows: {
        Args: { p_days_ahead?: number; p_days_back?: number; p_token: string }
        Returns: {
          appointment_id: string
          cancelled: boolean
          display_name: string
          ends_at: string
          starts_at: string
          trainer_name: string
          updated_at: string
        }[]
      }
      set_my_bot_set: { Args: { p_bot_set: string }; Returns: undefined }
      swap_prescribed_exercise: {
        Args: {
          p_new_exercise_id: string
          p_pe_id: string
          p_scheduled_workout_id: string
        }
        Returns: Json
      }
      sync_supervised_workouts_to_appointments: {
        Args: { p_dry_run?: boolean }
        Returns: {
          client: string
          day_label: string
          from_date: string
          outcome: string
          to_date: string
          workout_id: string
        }[]
      }
      trainer_can_edit_program: {
        Args: { p_program: string }
        Returns: boolean
      }
      trainer_can_see_auth_user: { Args: { p_uid: string }; Returns: boolean }
      trainer_can_see_client: { Args: { p_client: string }; Returns: boolean }
      trainer_can_use_program: { Args: { p_program: string }; Returns: boolean }
      trainer_feature_on: {
        Args: { p_feature: string; p_trainer: string }
        Returns: boolean
      }
      trainer_pay_details: {
        Args: { p_trainer: string }
        Returns: {
          cashapp_handle: string
          pay_phone: string
          recipient_name: string
          venmo_username: string
          zelle_email: string
        }[]
      }
      trainer_session_rows: {
        Args: {
          p_days_ahead?: number
          p_days_back?: number
          p_trainer_id: string
        }
        Returns: {
          appointment_id: string
          cancelled: boolean
          display_name: string
          ends_at: string
          starts_at: string
          trainer_name: string
          updated_at: string
        }[]
      }
      trainer_user_id: { Args: never; Returns: string }
      trigger_coachbot: { Args: never; Returns: number }
      trigger_gcal_sync: { Args: never; Returns: number }
      trigger_gcal_sync_narrow: { Args: never; Returns: number }
      trim_off_catalog: { Args: { batch?: number }; Returns: number }
      update_my_trainer_profile: {
        Args: {
          p_avatar_url?: string
          p_cashapp_handle?: string
          p_first_name?: string
          p_name?: string
          p_pay_display_name?: string
          p_pay_phone?: string
          p_venmo_username?: string
          p_zelle_email?: string
        }
        Returns: {
          active: boolean
          auth_user_id: string | null
          avatar_url: string | null
          bot_set: string | null
          cashapp_handle: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          name: string | null
          pay_display_name: string | null
          pay_phone: string | null
          role: string
          session_feed_enabled: boolean
          session_feed_name_style: string
          session_feed_token: string | null
          session_mirror_calendar_id: string | null
          session_mirror_cursor: string | null
          session_mirror_enabled: boolean
          session_mirror_error: string | null
          session_mirror_synced_at: string | null
          venmo_username: string | null
          zelle_email: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trainers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      usda_amount: {
        Args: { food_nutrients: Json; p_id: number; p_number: string }
        Returns: number
      }
      usda_micros: { Args: { food_nutrients: Json }; Returns: Json }
      usda_unit_convert: {
        Args: { amount: number; from_unit: string; to_unit: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
