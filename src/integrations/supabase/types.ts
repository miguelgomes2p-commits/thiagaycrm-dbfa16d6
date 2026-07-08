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
      activities: {
        Row: {
          contact_id: string | null
          content: string | null
          created_at: string
          id: string
          lead_id: string | null
          metadata: Json | null
          title: string | null
          type: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          contact_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          title?: string | null
          type: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          contact_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          title?: string | null
          type?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          birthdate: string | null
          city: string | null
          company_name: string | null
          created_at: string
          deleted_at: string | null
          document: string | null
          email: string | null
          employees: string | null
          id: string
          job_title: string | null
          name: string
          notes: string | null
          owner_id: string | null
          phone: string | null
          responsible: string | null
          revenue: string | null
          segment: string | null
          state: string | null
          tags: string[] | null
          type: Database["public"]["Enums"]["contact_type"]
          updated_at: string
          whatsapp: string | null
          workspace_id: string
          zipcode: string | null
        }
        Insert: {
          address?: string | null
          birthdate?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          deleted_at?: string | null
          document?: string | null
          email?: string | null
          employees?: string | null
          id?: string
          job_title?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          responsible?: string | null
          revenue?: string | null
          segment?: string | null
          state?: string | null
          tags?: string[] | null
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          whatsapp?: string | null
          workspace_id: string
          zipcode?: string | null
        }
        Update: {
          address?: string | null
          birthdate?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          deleted_at?: string | null
          document?: string | null
          email?: string | null
          employees?: string | null
          id?: string
          job_title?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          responsible?: string | null
          revenue?: string | null
          segment?: string | null
          state?: string | null
          tags?: string[] | null
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          whatsapp?: string | null
          workspace_id?: string
          zipcode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_summary: string | null
          assigned_to: string | null
          auto_reply_enabled: boolean
          channel: Database["public"]["Enums"]["channel_type"]
          contact_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          lead_id: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          subject: string | null
          unread_count: number
          updated_at: string
          wa_contact_wa_id: string | null
          whatsapp_number_id: string | null
          workspace_id: string
        }
        Insert: {
          ai_summary?: string | null
          assigned_to?: string | null
          auto_reply_enabled?: boolean
          channel?: Database["public"]["Enums"]["channel_type"]
          contact_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          unread_count?: number
          updated_at?: string
          wa_contact_wa_id?: string | null
          whatsapp_number_id?: string | null
          workspace_id: string
        }
        Update: {
          ai_summary?: string | null
          assigned_to?: string | null
          auto_reply_enabled?: boolean
          channel?: Database["public"]["Enums"]["channel_type"]
          contact_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          unread_count?: number
          updated_at?: string
          wa_contact_wa_id?: string | null
          whatsapp_number_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          contact_id: string | null
          created_at: string
          currency: string | null
          deleted_at: string | null
          id: string
          last_interaction_at: string | null
          lost_at: string | null
          lost_reason: string | null
          owner_id: string | null
          pipeline_id: string
          position: number
          priority: Database["public"]["Enums"]["lead_priority"]
          source: string | null
          stage_id: string
          tags: string[] | null
          title: string
          updated_at: string
          value: number | null
          won_at: string | null
          workspace_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          id?: string
          last_interaction_at?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          owner_id?: string | null
          pipeline_id: string
          position?: number
          priority?: Database["public"]["Enums"]["lead_priority"]
          source?: string | null
          stage_id: string
          tags?: string[] | null
          title: string
          updated_at?: string
          value?: number | null
          won_at?: string | null
          workspace_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          id?: string
          last_interaction_at?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          owner_id?: string | null
          pipeline_id?: string
          position?: number
          priority?: Database["public"]["Enums"]["lead_priority"]
          source?: string | null
          stage_id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          value?: number | null
          won_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          delivery_status: Database["public"]["Enums"]["wa_delivery_status"]
          direction: Database["public"]["Enums"]["message_direction"]
          error_message: string | null
          id: string
          media_mime_type: string | null
          media_type: string | null
          media_url: string | null
          metadata: Json | null
          sender_type: Database["public"]["Enums"]["sender_type"]
          sender_user_id: string | null
          template_name: string | null
          wa_message_id: string | null
          workspace_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["wa_delivery_status"]
          direction: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          id?: string
          media_mime_type?: string | null
          media_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          sender_type: Database["public"]["Enums"]["sender_type"]
          sender_user_id?: string | null
          template_name?: string | null
          wa_message_id?: string | null
          workspace_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["wa_delivery_status"]
          direction?: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          id?: string
          media_mime_type?: string | null
          media_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          sender_type?: Database["public"]["Enums"]["sender_type"]
          sender_user_id?: string | null
          template_name?: string | null
          wa_message_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          pipeline_id: string
          position: number
          type: Database["public"]["Enums"]["stage_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          pipeline_id: string
          position?: number
          type?: Database["public"]["Enums"]["stage_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          pipeline_id?: string
          position?: number
          type?: Database["public"]["Enums"]["stage_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_default: boolean
          name: string
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          name: string
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_workspace_id: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_workspace_id?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_workspace_id?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_workspace_id_fkey"
            columns: ["current_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_entries: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          conversation_id: string
          created_at: string
          entered_at: string
          id: string
          priority: number
          resolved_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          conversation_id: string
          created_at?: string
          entered_at?: string
          id?: string
          priority?: number
          resolved_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          conversation_id?: string
          created_at?: string
          entered_at?: string
          id?: string
          priority?: number
          resolved_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_entries_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_settings: {
        Row: {
          created_at: string
          last_assigned_user_id: string | null
          sla_minutes: number
          strategy: Database["public"]["Enums"]["queue_strategy"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          last_assigned_user_id?: string | null
          sla_minutes?: number
          strategy?: Database["public"]["Enums"]["queue_strategy"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          last_assigned_user_id?: string | null
          sla_minutes?: number
          strategy?: Database["public"]["Enums"]["queue_strategy"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          done: boolean
          due_at: string | null
          id: string
          lead_id: string | null
          priority: Database["public"]["Enums"]["lead_priority"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          done?: boolean
          due_at?: string | null
          id?: string
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          done?: boolean
          due_at?: string | null
          id?: string
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_numbers: {
        Row: {
          access_token: string
          app_id: string | null
          auto_reply_enabled: boolean
          auto_reply_prompt: string | null
          created_at: string
          default_owner_id: string | null
          display_number: string
          id: string
          is_active: boolean
          label: string
          last_webhook_at: string | null
          phone_number_id: string
          updated_at: string
          waba_id: string
          webhook_verify_token: string
          workspace_id: string
        }
        Insert: {
          access_token: string
          app_id?: string | null
          auto_reply_enabled?: boolean
          auto_reply_prompt?: string | null
          created_at?: string
          default_owner_id?: string | null
          display_number: string
          id?: string
          is_active?: boolean
          label: string
          last_webhook_at?: string | null
          phone_number_id: string
          updated_at?: string
          waba_id: string
          webhook_verify_token?: string
          workspace_id: string
        }
        Update: {
          access_token?: string
          app_id?: string | null
          auto_reply_enabled?: boolean
          auto_reply_prompt?: string | null
          created_at?: string
          default_owner_id?: string | null
          display_number?: string
          id?: string
          is_active?: boolean
          label?: string
          last_webhook_at?: string | null
          phone_number_id?: string
          updated_at?: string
          waba_id?: string
          webhook_verify_token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_numbers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          category: string | null
          components: Json
          created_at: string
          id: string
          language: string
          meta_id: string | null
          name: string
          status: Database["public"]["Enums"]["wa_template_status"]
          updated_at: string
          whatsapp_number_id: string
          workspace_id: string
        }
        Insert: {
          category?: string | null
          components?: Json
          created_at?: string
          id?: string
          language?: string
          meta_id?: string | null
          name: string
          status?: Database["public"]["Enums"]["wa_template_status"]
          updated_at?: string
          whatsapp_number_id: string
          workspace_id: string
        }
        Update: {
          category?: string | null
          components?: Json
          created_at?: string
          id?: string
          language?: string
          meta_id?: string | null
          name?: string
          status?: Database["public"]["Enums"]["wa_template_status"]
          updated_at?: string
          whatsapp_number_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_next_agent: { Args: { _workspace_id: string }; Returns: string }
      create_workspace_with_defaults: {
        Args: { _name: string; _slug: string }
        Returns: string
      }
      has_workspace_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "manager" | "agent"
      channel_type:
        | "whatsapp"
        | "instagram"
        | "facebook"
        | "telegram"
        | "email"
        | "webchat"
        | "sms"
      contact_type: "person" | "company"
      conversation_status: "open" | "pending" | "resolved" | "closed"
      lead_priority: "low" | "medium" | "high" | "urgent"
      message_direction: "inbound" | "outbound" | "internal"
      queue_strategy: "round_robin" | "manual" | "hybrid"
      sender_type: "contact" | "user" | "ai" | "system"
      stage_type: "open" | "won" | "lost"
      wa_delivery_status: "pending" | "sent" | "delivered" | "read" | "failed"
      wa_template_status: "pending" | "approved" | "rejected" | "paused"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "manager", "agent"],
      channel_type: [
        "whatsapp",
        "instagram",
        "facebook",
        "telegram",
        "email",
        "webchat",
        "sms",
      ],
      contact_type: ["person", "company"],
      conversation_status: ["open", "pending", "resolved", "closed"],
      lead_priority: ["low", "medium", "high", "urgent"],
      message_direction: ["inbound", "outbound", "internal"],
      queue_strategy: ["round_robin", "manual", "hybrid"],
      sender_type: ["contact", "user", "ai", "system"],
      stage_type: ["open", "won", "lost"],
      wa_delivery_status: ["pending", "sent", "delivered", "read", "failed"],
      wa_template_status: ["pending", "approved", "rejected", "paused"],
    },
  },
} as const
