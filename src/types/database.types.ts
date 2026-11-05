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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      cities: {
        Row: {
          id: string
          name: string
          state: string
          country: string
          is_custom: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          state: string
          country?: string
          is_custom?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          state?: string
          country?: string
          is_custom?: boolean
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json | null
          new_data: Json | null
          old_data: Json | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      families: {
        Row: {
          avatar_url?: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          family_name: string
          gotra: string | null
          id: string
          kul: string | null
          manager_user_id?: string | null
          members_privacy: Database["public"]["Enums"]["privacy_level"]
          nukh: string | null
          profile_privacy: Database["public"]["Enums"]["privacy_level"]
          state: string | null
          status: Database["public"]["Enums"]["family_status"]
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          family_name: string
          gotra?: string | null
          id?: string
          kul?: string | null
          manager_user_id?: string | null
          members_privacy?: Database["public"]["Enums"]["privacy_level"]
          nukh?: string | null
          profile_privacy?: Database["public"]["Enums"]["privacy_level"]
          state?: string | null
          status?: Database["public"]["Enums"]["family_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          family_name?: string
          gotra?: string | null
          id?: string
          kul?: string | null
          manager_user_id?: string | null
          members_privacy?: Database["public"]["Enums"]["privacy_level"]
          nukh?: string | null
          profile_privacy?: Database["public"]["Enums"]["privacy_level"]
          state?: string | null
          status?: Database["public"]["Enums"]["family_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
      }
      family_albums: {
        Row: {
          cover_media_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          family_id: string
          id: string
          privacy_level: Database["public"]["Enums"]["privacy_level"]
          title: string
          updated_at: string
        }
        Insert: {
          cover_media_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          family_id: string
          id?: string
          privacy_level?: Database["public"]["Enums"]["privacy_level"]
          title: string
          updated_at?: string
        }
        Update: {
          cover_media_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          family_id?: string
          id?: string
          privacy_level?: Database["public"]["Enums"]["privacy_level"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      family_media: {
        Row: {
          album_id: string | null
          caption: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          display_order: number
          family_id: string
          file_size: number
          id: string
          media_type: Database["public"]["Enums"]["family_media_type"]
          mime_type: string
          original_filename: string
          storage_object_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          album_id?: string | null
          caption?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          family_id: string
          file_size: number
          id?: string
          media_type?: Database["public"]["Enums"]["family_media_type"]
          mime_type: string
          original_filename: string
          storage_object_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          album_id?: string | null
          caption?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          family_id?: string
          file_size?: number
          id?: string
          media_type?: Database["public"]["Enums"]["family_media_type"]
          mime_type?: string
          original_filename?: string
          storage_object_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      family_stories: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          deleted_at: string | null
          family_id: string
          featured_media_id: string | null
          id: string
          privacy_level: Database["public"]["Enums"]["privacy_level"]
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          deleted_at?: string | null
          family_id: string
          featured_media_id?: string | null
          id?: string
          privacy_level?: Database["public"]["Enums"]["privacy_level"]
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          family_id?: string
          featured_media_id?: string | null
          id?: string
          privacy_level?: Database["public"]["Enums"]["privacy_level"]
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          added_by: string | null
          created_at: string
          family_id: string
          id: string
          is_head: boolean
          joined_at: string
          left_at: string | null
          person_id: string
          role: Database["public"]["Enums"]["family_role"]
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          family_id: string
          id?: string
          is_head?: boolean
          joined_at?: string
          left_at?: string | null
          person_id: string
          role?: Database["public"]["Enums"]["family_role"]
        }
        Update: {
          added_by?: string | null
          created_at?: string
          family_id?: string
          id?: string
          is_head?: boolean
          joined_at?: string
          left_at?: string | null
          person_id?: string
          role?: Database["public"]["Enums"]["family_role"]
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
            foreignKeyName: "family_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          avatar_url?: string | null
          birth_place: string | null
          contact_privacy: Database["public"]["Enums"]["privacy_level"]
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          dob_year?: number | null
          age?: number | null
          date_of_death: string | null
          deleted_at: string | null
          dob_privacy: Database["public"]["Enums"]["privacy_level"]
          email_contact: string | null
          first_name: string
          gender: Database["public"]["Enums"]["gender"] | null
          gotra: string | null
          id: string
          kul: string | null
          last_name: string
          maiden_name: string | null
          middle_name: string | null
          nukh: string | null
          phone: string | null
          phone_secondary: string | null
          profile_privacy: Database["public"]["Enums"]["privacy_level"]
          status: Database["public"]["Enums"]["person_status"]
          updated_at: string
          user_id: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          avatar_url?: string | null
          birth_place?: string | null
          contact_privacy?: Database["public"]["Enums"]["privacy_level"]
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          date_of_death?: string | null
          deleted_at?: string | null
          dob_privacy?: Database["public"]["Enums"]["privacy_level"]
          email_contact?: string | null
          first_name: string
          gender?: Database["public"]["Enums"]["gender"] | null
          gotra?: string | null
          id?: string
          kul?: string | null
          last_name: string
          maiden_name?: string | null
          middle_name?: string | null
          nukh?: string | null
          phone?: string | null
          phone_secondary?: string | null
          profile_privacy?: Database["public"]["Enums"]["privacy_level"]
          status?: Database["public"]["Enums"]["person_status"]
          updated_at?: string
          user_id?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          avatar_url?: string | null
          birth_place?: string | null
          contact_privacy?: Database["public"]["Enums"]["privacy_level"]
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          date_of_death?: string | null
          deleted_at?: string | null
          dob_privacy?: Database["public"]["Enums"]["privacy_level"]
          email_contact?: string | null
          first_name?: string
          gender?: Database["public"]["Enums"]["gender"] | null
          gotra?: string | null
          id?: string
          kul?: string | null
          last_name?: string
          maiden_name?: string | null
          middle_name?: string | null
          nukh?: string | null
          phone?: string | null
          phone_secondary?: string | null
          profile_privacy?: Database["public"]["Enums"]["privacy_level"]
          status?: Database["public"]["Enums"]["person_status"]
          updated_at?: string
          user_id?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          email_verified: boolean
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          email_verified?: boolean
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          email_verified?: boolean
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      relationships: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          person_a_id: string
          person_b_id: string
          relationship_type: Database["public"]["Enums"]["relationship_type"]
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          person_a_id: string
          person_b_id: string
          relationship_type: Database["public"]["Enums"]["relationship_type"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          person_a_id?: string
          person_b_id?: string
          relationship_type?: Database["public"]["Enums"]["relationship_type"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "relationships_person_a_id_fkey"
            columns: ["person_a_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_person_b_id_fkey"
            columns: ["person_b_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      community_persons: {
        Row: {
          id: string
          first_name: string
          middle_name: string | null
          last_name: string
          maiden_name: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          dob_year: number | null
          age: number | null
          city: string | null
          state: string | null
          date_of_death: string | null
          avatar_url: string | null
          gotra: string | null
          nukh: string | null
          kul: string | null
          status: Database["public"]["Enums"]["person_status"]
          verification_status: Database["public"]["Enums"]["verification_status"]
          created_at: string
          updated_at: string
          deleted_at: string | null
          date_of_birth?: string | null
          birth_place?: string | null
          email_contact?: string | null
          phone?: string | null
          phone_secondary?: string | null
          user_id?: string | null
          created_by?: string | null
          profile_privacy?: Database["public"]["Enums"]["privacy_level"] | null
          contact_privacy?: Database["public"]["Enums"]["privacy_level"] | null
          dob_privacy?: Database["public"]["Enums"]["privacy_level"] | null
          is_same_family?: boolean | null
          can_edit?: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_my_linked_person: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Views"]["community_persons"]["Row"][]
      }
      get_person_protected_details: {
        Args: { p_person_id: string }
        Returns: Json
      }
      update_person_protected_details: {
        Args: {
          p_person_id: string
          p_date_of_birth?: string | null
          p_phone?: string | null
          p_phone_secondary?: string | null
          p_email_contact?: string | null
        }
        Returns: Json
      }
      calculate_person_age: {
        Args: { p_dob: string }
        Returns: number | null
      }
      get_my_role: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_community_moderator: { Args: never; Returns: boolean }
      can_manage_person_avatar: { Args: { p_person_id: string }; Returns: boolean }
      can_manage_family_avatar: { Args: { p_family_id: string }; Returns: boolean }
      can_read_avatar_object: { Args: { p_object_name: string }; Returns: boolean }
      set_person_avatar: { Args: { p_person_id: string; p_avatar_url: string | null }; Returns: Json }
      delete_person_avatar: { Args: { p_person_id: string }; Returns: Json }
      set_family_avatar: { Args: { p_family_id: string; p_avatar_url: string | null }; Returns: Json }
      delete_family_avatar: { Args: { p_family_id: string }; Returns: Json }
      set_profile_avatar: { Args: { p_avatar_url: string | null }; Returns: Json }
      can_manage_family_media: { Args: { p_family_id: string }; Returns: boolean }
      can_read_family_item: { Args: { p_family_id: string; p_item_privacy: Database["public"]["Enums"]["privacy_level"] }; Returns: boolean }
      can_read_family_media_object: { Args: { p_object_name: string }; Returns: boolean }
      create_family_album: { Args: { p_family_id: string; p_title: string; p_description?: string | null; p_privacy_level?: Database["public"]["Enums"]["privacy_level"] }; Returns: Json }
      register_family_media: { Args: { p_family_id: string; p_album_id?: string | null; p_media_id: string; p_storage_path: string; p_media_type: Database["public"]["Enums"]["family_media_type"]; p_original_filename: string; p_mime_type: string; p_file_size: number; p_caption?: string | null; p_description?: string | null }; Returns: Json }
      soft_delete_family_media: { Args: { p_media_id: string }; Returns: Json }
      create_family_story: { Args: { p_family_id: string; p_title: string; p_content: string; p_summary?: string | null; p_privacy_level?: Database["public"]["Enums"]["privacy_level"]; p_featured_media_id?: string | null }; Returns: Json }
      log_audit_event: {
        Args: {
          p_action: Database["public"]["Enums"]["audit_action"]
          p_metadata?: Json
          p_new_data?: Json
          p_old_data?: Json
          p_target_id?: string
          p_target_type?: string
        }
        Returns: string
      }
    }
    Enums: {
      audit_action:
        | "USER_REGISTERED"
        | "USER_ROLE_CHANGED"
        | "USER_DEACTIVATED"
        | "USER_REACTIVATED"
        | "PROFILE_UPDATED"
        | "PERSON_CREATED"
        | "PERSON_UPDATED"
        | "PERSON_DELETED"
        | "PERSON_CLAIMED"
        | "PERSON_CLAIM_APPROVED"
        | "PERSON_CLAIM_REJECTED"
        | "PERSON_VERIFIED"
        | "PERSON_VERIFICATION_REJECTED"
        | "FAMILY_CREATED"
        | "FAMILY_UPDATED"
        | "FAMILY_DELETED"
        | "FAMILY_MEMBER_ADDED"
        | "FAMILY_MEMBER_REMOVED"
        | "FAMILY_HEAD_CHANGED"
        | "PRIVACY_CHANGED"
        | "ADMIN_ACTION"
      family_role:
        | "HEAD"
        | "SPOUSE"
        | "CHILD"
        | "PARENT"
        | "SIBLING"
        | "GRANDPARENT"
        | "GRANDCHILD"
        | "EXTENDED"
      family_status: "DRAFT" | "ACTIVE" | "ARCHIVED"
      gender: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY"
      person_status: "DRAFT" | "ACTIVE" | "ARCHIVED" | "DECEASED"
      privacy_level:
        | "PRIVATE"
        | "FAMILY"
        | "CONNECTIONS"
        | "COMMUNITY"
        | "PUBLIC"
      relationship_type: "PARENT" | "SPOUSE" | "SIBLING"
      user_role:
        | "SUPER_ADMIN"
        | "ADMIN"
        | "COMMUNITY_MODERATOR"
        | "COMMUNITY_MUKHI"
        | "ASSISTANT_MUKHI"
        | "COMMITTEE_MEMBER"
        | "FAMILY_HEAD"
        | "FAMILY_MANAGER"
        | "FAMILY_MEMBER"
        | "COMMUNITY_MEMBER"
        | "MEMBER"
        | "GUEST"
      verification_status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED"
      family_media_type: "PHOTO" | "DOCUMENT" | "HISTORICAL_RECORD"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      audit_action: [
        "USER_REGISTERED",
        "USER_ROLE_CHANGED",
        "USER_DEACTIVATED",
        "USER_REACTIVATED",
        "PROFILE_UPDATED",
        "PERSON_CREATED",
        "PERSON_UPDATED",
        "PERSON_DELETED",
        "PERSON_CLAIMED",
        "PERSON_CLAIM_APPROVED",
        "PERSON_CLAIM_REJECTED",
        "PERSON_VERIFIED",
        "PERSON_VERIFICATION_REJECTED",
        "FAMILY_CREATED",
        "FAMILY_UPDATED",
        "FAMILY_DELETED",
        "FAMILY_MEMBER_ADDED",
        "FAMILY_MEMBER_REMOVED",
        "FAMILY_HEAD_CHANGED",
        "PRIVACY_CHANGED",
        "ADMIN_ACTION",
      ],
      family_media_type: ["PHOTO", "DOCUMENT", "HISTORICAL_RECORD"],
      family_role: [
        "HEAD",
        "SPOUSE",
        "CHILD",
        "PARENT",
        "SIBLING",
        "GRANDPARENT",
        "GRANDCHILD",
        "EXTENDED",
      ],
      family_status: ["DRAFT", "ACTIVE", "ARCHIVED"],
      gender: ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"],
      person_status: ["DRAFT", "ACTIVE", "ARCHIVED", "DECEASED"],
      privacy_level: [
        "PRIVATE",
        "FAMILY",
        "CONNECTIONS",
        "COMMUNITY",
        "PUBLIC",
      ],
      relationship_type: ["PARENT", "SPOUSE", "SIBLING"],
      user_role: [
        "SUPER_ADMIN",
        "ADMIN",
        "COMMUNITY_MODERATOR",
        "COMMUNITY_MUKHI",
        "ASSISTANT_MUKHI",
        "COMMITTEE_MEMBER",
        "FAMILY_HEAD",
        "FAMILY_MANAGER",
        "FAMILY_MEMBER",
        "COMMUNITY_MEMBER",
        "MEMBER",
        "GUEST",
      ],
      verification_status: ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"],
    },
  },
} as const
