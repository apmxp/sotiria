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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          age_max: number
          age_min: number
          category: string
          created_at: string
          description: string
          difficulty: string
          duration_minutes: number
          id: string
          instructions: string[]
          is_published: boolean
          key: string
          materials: string
          supervision_required: boolean
          title: string
        }
        Insert: {
          age_max?: number
          age_min?: number
          category: string
          created_at?: string
          description: string
          difficulty: string
          duration_minutes: number
          id?: string
          instructions?: string[]
          is_published?: boolean
          key: string
          materials?: string
          supervision_required?: boolean
          title: string
        }
        Update: {
          age_max?: number
          age_min?: number
          category?: string
          created_at?: string
          description?: string
          difficulty?: string
          duration_minutes?: number
          id?: string
          instructions?: string[]
          is_published?: boolean
          key?: string
          materials?: string
          supervision_required?: boolean
          title?: string
        }
        Relationships: []
      }
      activity_completions: {
        Row: {
          activity_id: string
          child_id: string
          completed_at: string
          completed_on: string
          created_at: string
          id: string
          optional_reflection: string | null
        }
        Insert: {
          activity_id: string
          child_id: string
          completed_at?: string
          completed_on: string
          created_at?: string
          id?: string
          optional_reflection?: string | null
        }
        Update: {
          activity_id?: string
          child_id?: string
          completed_at?: string
          completed_on?: string
          created_at?: string
          id?: string
          optional_reflection?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_completions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_completions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      break_logs: {
        Row: {
          child_id: string
          completed_at: string
          completed_on: string
          created_at: string
          duration_minutes: number | null
          id: string
        }
        Insert: {
          child_id: string
          completed_at?: string
          completed_on: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
        }
        Update: {
          child_id?: string
          completed_at?: string
          completed_on?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_logs_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      child_profiles: {
        Row: {
          avatar: string
          created_at: string
          display_name: string
          family_id: string
          id: string
          is_active: boolean
          pin_hash: string
          pin_locked_until: string | null
          preferences: Json
          updated_at: string
        }
        Insert: {
          avatar?: string
          created_at?: string
          display_name: string
          family_id: string
          id?: string
          is_active?: boolean
          pin_hash: string
          pin_locked_until?: string | null
          preferences?: Json
          updated_at?: string
        }
        Update: {
          avatar?: string
          created_at?: string
          display_name?: string
          family_id?: string
          id?: string
          is_active?: boolean
          pin_hash?: string
          pin_locked_until?: string | null
          preferences?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_profiles_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      child_sessions: {
        Row: {
          child_id: string
          created_at: string
          expires_at: string
          id: string
          last_activity_at: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          child_id: string
          created_at?: string
          expires_at: string
          id?: string
          last_activity_at?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          child_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_activity_at?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_sessions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          created_at: string
          family_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_picker_sessions: {
        Row: {
          created_at: string
          expires_at: string
          family_id: string
          id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          family_id: string
          id?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          family_id?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_picker_sessions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_routines: {
        Row: {
          created_at: string
          created_by: string | null
          days_of_week: number[]
          description: string | null
          family_id: string
          id: string
          is_active: boolean
          name: string
          recurrence: string
          scheduled_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          days_of_week?: number[]
          description?: string | null
          family_id: string
          id?: string
          is_active?: boolean
          name: string
          recurrence: string
          scheduled_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          days_of_week?: number[]
          description?: string | null
          family_id?: string
          id?: string
          is_active?: boolean
          name?: string
          recurrence?: string
          scheduled_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_routines_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          child_id: string
          completed_at: string | null
          created_at: string
          id: string
          lesson_id: string
          quiz_passed: boolean
          quiz_score: number | null
          updated_at: string
        }
        Insert: {
          child_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id: string
          quiz_passed?: boolean
          quiz_score?: number | null
          updated_at?: string
        }
        Update: {
          child_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id?: string
          quiz_passed?: boolean
          quiz_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          category: string
          content: string
          created_at: string
          description: string
          difficulty: string
          estimated_minutes: number
          id: string
          is_published: boolean
          key: string
          title: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          description: string
          difficulty?: string
          estimated_minutes: number
          id?: string
          is_published?: boolean
          key: string
          title: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          description?: string
          difficulty?: string
          estimated_minutes?: number
          id?: string
          is_published?: boolean
          key?: string
          title?: string
        }
        Relationships: []
      }
      mood_entries: {
        Row: {
          child_id: string
          created_at: string
          entry_date: string
          id: string
          mood: string
          reflection: string
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          entry_date: string
          id?: string
          mood: string
          reflection?: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          entry_date?: string
          id?: string
          mood?: string
          reflection?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mood_entries_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_attempts: {
        Row: {
          attempted_at: string
          child_id: string
          id: string
          request_context: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          child_id: string
          id?: string
          request_context?: string
          success: boolean
        }
        Update: {
          attempted_at?: string
          child_id?: string
          id?: string
          request_context?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pin_attempts_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          preferences: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          preferences?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          preferences?: Json
          updated_at?: string
        }
        Relationships: []
      }
      routine_completions: {
        Row: {
          child_id: string | null
          completed_at: string
          completion_date: string
          created_at: string
          id: string
          routine_id: string
        }
        Insert: {
          child_id?: string | null
          completed_at?: string
          completion_date: string
          created_at?: string
          id?: string
          routine_id: string
        }
        Update: {
          child_id?: string | null
          completed_at?: string
          completion_date?: string
          created_at?: string
          id?: string
          routine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_completions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_completions_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "family_routines"
            referencedColumns: ["id"]
          },
        ]
      }
      screen_time_goals: {
        Row: {
          child_id: string
          created_at: string
          created_by: string | null
          daily_limit_minutes: number
          effective_from: string
          id: string
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          created_by?: string | null
          daily_limit_minutes: number
          effective_from?: string
          id?: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          created_by?: string | null
          daily_limit_minutes?: number
          effective_from?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "screen_time_goals_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      child_device_usage_days: {
        Row: {
          accepted_at: string | null
          child_id: string
          device_id: string
          issue_request_hash: string
          payload_hash: string | null
          prepare_expires_at: string
          reporting_timezone: string
          revision: number
          state: string
          ticket_expires_at: string | null
          ticket_hash: string | null
          ticket_key_id: string
          usage_date: string
        }
        Insert: {
          accepted_at?: string | null
          child_id: string
          device_id: string
          issue_request_hash: string
          payload_hash?: string | null
          prepare_expires_at: string
          reporting_timezone: string
          revision: number
          state: string
          ticket_expires_at?: string | null
          ticket_hash?: string | null
          ticket_key_id: string
          usage_date: string
        }
        Update: {
          accepted_at?: string | null
          child_id?: string
          device_id?: string
          issue_request_hash?: string
          payload_hash?: string | null
          prepare_expires_at?: string
          reporting_timezone?: string
          revision?: number
          state?: string
          ticket_expires_at?: string | null
          ticket_hash?: string | null
          ticket_key_id?: string
          usage_date?: string
        }
        Relationships: []
      }
      screen_time_logs: {
        Row: {
          app_name: string | null
          category: string
          child_id: string
          created_at: string
          device_id: string | null
          duration_minutes: number
          id: string
          notes: string | null
          package_name: string | null
          source: string
          updated_at: string
          usage_date: string
        }
        Insert: {
          app_name?: string | null
          category: string
          child_id: string
          created_at?: string
          device_id?: string | null
          duration_minutes: number
          id?: string
          notes?: string | null
          package_name?: string | null
          source?: string
          updated_at?: string
          usage_date: string
        }
        Update: {
          app_name?: string | null
          category?: string
          child_id?: string
          created_at?: string
          device_id?: string | null
          duration_minutes?: number
          id?: string
          notes?: string | null
          package_name?: string | null
          source?: string
          updated_at?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "screen_time_logs_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_child_device_pairing: {
        Args: { p_device_token_hash: string; p_pending_token_hash: string }
        Returns: Json
      }
      create_child_device_pairing: {
        Args: {
          p_child_id: string
          p_idempotency_key_hash: string
          p_pairing_hash: string
          p_pairing_key_id: string
          p_request_fingerprint: string
          p_timezone: string
        }
        Returns: Json
      }
      get_child_device_pairing_status: {
        Args: { p_child_id: string; p_pairing_id: string }
        Returns: Json
      }
      get_family_children: {
        Args: { p_family_id: string }
        Returns: {
          avatar: string
          display_name: string
          family_id: string
          id: string
          is_active: boolean
        }[]
      }
      get_accepted_child_usage_dates: {
        Args: { p_child_id: string; p_since: string }
        Returns: { usage_date: string }[]
      }
      redeem_child_device_pairing: {
        Args: {
          p_credential_key_id: string
          p_device_name: string
          p_pairing_hash: string
          p_pending_token_hash: string
        }
        Returns: Json
      }
      record_daily_screen_total: {
        Args: {
          p_child_id: string
          p_id: string
          p_minutes: number
          p_usage_date: string
        }
        Returns: boolean
      }
      is_child_parent: { Args: { p_child: string }; Returns: boolean }
      is_family_parent: { Args: { p_family: string }; Returns: boolean }
      is_routine_parent: { Args: { p_routine: string }; Returns: boolean }
      manage_child_authorized: {
        Args: {
          p_active: boolean
          p_avatar: string
          p_child: string
          p_family: string
          p_name: string
          p_pin: string
        }
        Returns: string
      }
      manage_child: {
        Args: {
          p_active: boolean
          p_avatar: string
          p_child: string
          p_family: string
          p_name: string
          p_pin: string
          p_user: string
        }
        Returns: string
      }
      setup_family: { Args: { p_name: string }; Returns: string }
      validate_child_session: { Args: { p_token_hash: string }; Returns: Json }
      verify_child_pin: {
        Args: {
          p_child: string
          p_picker_hash: string
          p_pin: string
          p_token_hash: string
        }
        Returns: Json
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
