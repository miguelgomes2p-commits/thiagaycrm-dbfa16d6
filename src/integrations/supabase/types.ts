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
          avatar_url: string | null
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
          avatar_url?: string | null
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
          avatar_url?: string | null
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
      conversation_assignments: {
        Row: {
          assigned_by: string | null
          conversation_id: string
          created_at: string
          from_user_id: string | null
          id: string
          reason: string | null
          to_user_id: string | null
          workspace_id: string
        }
        Insert: {
          assigned_by?: string | null
          conversation_id: string
          created_at?: string
          from_user_id?: string | null
          id?: string
          reason?: string | null
          to_user_id?: string | null
          workspace_id: string
        }
        Update: {
          assigned_by?: string | null
          conversation_id?: string
          created_at?: string
          from_user_id?: string | null
          id?: string
          reason?: string | null
          to_user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_assignments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_labels: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          conversation_id: string
          label_id: string
          workspace_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          conversation_id: string
          label_id: string
          workspace_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          conversation_id?: string
          label_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_labels_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_labels_workspace_id_fkey"
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
          assignment_status: string
          auto_reply_enabled: boolean
          channel: Database["public"]["Enums"]["channel_type"]
          contact_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          lead_id: string | null
          qualification_status: string
          status: Database["public"]["Enums"]["conversation_status"]
          subject: string | null
          triage_idempotency_key: string | null
          unread_count: number
          updated_at: string
          wa_contact_wa_id: string | null
          whatsapp_number_id: string | null
          workspace_id: string
        }
        Insert: {
          ai_summary?: string | null
          assigned_to?: string | null
          assignment_status?: string
          auto_reply_enabled?: boolean
          channel?: Database["public"]["Enums"]["channel_type"]
          contact_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          qualification_status?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          triage_idempotency_key?: string | null
          unread_count?: number
          updated_at?: string
          wa_contact_wa_id?: string | null
          whatsapp_number_id?: string | null
          workspace_id: string
        }
        Update: {
          ai_summary?: string | null
          assigned_to?: string | null
          assignment_status?: string
          auto_reply_enabled?: boolean
          channel?: Database["public"]["Enums"]["channel_type"]
          contact_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          qualification_status?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          triage_idempotency_key?: string | null
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
      evolution_error_logs: {
        Row: {
          base_url: string | null
          created_at: string
          error_message: string | null
          id: string
          instance_name: string | null
          method: string | null
          operation: string
          request_body: Json | null
          response_body: string | null
          status: number | null
          url: string | null
          whatsapp_number_id: string | null
          workspace_id: string | null
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          instance_name?: string | null
          method?: string | null
          operation: string
          request_body?: Json | null
          response_body?: string | null
          status?: number | null
          url?: string | null
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          base_url?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          instance_name?: string | null
          method?: string | null
          operation?: string
          request_body?: Json | null
          response_body?: string | null
          status?: number | null
          url?: string | null
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evolution_error_logs_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evolution_error_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["label_kind"]
          name: string
          scope: Database["public"]["Enums"]["label_scope"]
          sort_order: number
          system_ref: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["label_kind"]
          name: string
          scope?: Database["public"]["Enums"]["label_scope"]
          sort_order?: number
          system_ref?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["label_kind"]
          name?: string
          scope?: Database["public"]["Enums"]["label_scope"]
          sort_order?: number
          system_ref?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_workspace_id_fkey"
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
          custom_fields: Json
          deleted_at: string | null
          id: string
          last_interaction_at: string | null
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
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
          custom_fields?: Json
          deleted_at?: string | null
          id?: string
          last_interaction_at?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
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
          custom_fields?: Json
          deleted_at?: string | null
          id?: string
          last_interaction_at?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
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
      n8n_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          duration_ms: number | null
          event_name: string | null
          http_status: number | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          locked_at: string | null
          next_retry_at: string
          payload: Json | null
          phone: string | null
          request_id: string | null
          response_body: string | null
          status: string
          trace_id: string | null
          updated_at: string
          wa_message_id: string
          webhook_event_id: number | null
          whatsapp_number_id: string | null
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          duration_ms?: number | null
          event_name?: string | null
          http_status?: number | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          locked_at?: string | null
          next_retry_at?: string
          payload?: Json | null
          phone?: string | null
          request_id?: string | null
          response_body?: string | null
          status?: string
          trace_id?: string | null
          updated_at?: string
          wa_message_id: string
          webhook_event_id?: number | null
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          duration_ms?: number | null
          event_name?: string | null
          http_status?: number | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          locked_at?: string | null
          next_retry_at?: string
          payload?: Json | null
          phone?: string | null
          request_id?: string | null
          response_body?: string | null
          status?: string
          trace_id?: string | null
          updated_at?: string
          wa_message_id?: string
          webhook_event_id?: number | null
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "n8n_deliveries_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "n8n_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      nfe_config: {
        Row: {
          cfop_entrada_padrao: string
          cfop_saida_padrao: string
          cnpj_emitente: string | null
          created_at: string
          emit_bairro: string | null
          emit_cep: string | null
          emit_ibge: string | null
          emit_logradouro: string | null
          emit_municipio: string | null
          emit_nome_fantasia: string | null
          emit_numero: string | null
          emit_razao_social: string | null
          emit_telefone: string | null
          emit_uf: string | null
          environment: string
          id: string
          ie_emitente: string | null
          is_active: boolean
          natureza_operacao_entrada: string
          natureza_operacao_saida: string
          provider: string
          regime_tributario: number | null
          serie_padrao: number
          token_homolog_enc: string | null
          token_prod_enc: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cfop_entrada_padrao?: string
          cfop_saida_padrao?: string
          cnpj_emitente?: string | null
          created_at?: string
          emit_bairro?: string | null
          emit_cep?: string | null
          emit_ibge?: string | null
          emit_logradouro?: string | null
          emit_municipio?: string | null
          emit_nome_fantasia?: string | null
          emit_numero?: string | null
          emit_razao_social?: string | null
          emit_telefone?: string | null
          emit_uf?: string | null
          environment?: string
          id?: string
          ie_emitente?: string | null
          is_active?: boolean
          natureza_operacao_entrada?: string
          natureza_operacao_saida?: string
          provider?: string
          regime_tributario?: number | null
          serie_padrao?: number
          token_homolog_enc?: string | null
          token_prod_enc?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cfop_entrada_padrao?: string
          cfop_saida_padrao?: string
          cnpj_emitente?: string | null
          created_at?: string
          emit_bairro?: string | null
          emit_cep?: string | null
          emit_ibge?: string | null
          emit_logradouro?: string | null
          emit_municipio?: string | null
          emit_nome_fantasia?: string | null
          emit_numero?: string | null
          emit_razao_social?: string | null
          emit_telefone?: string | null
          emit_uf?: string | null
          environment?: string
          id?: string
          ie_emitente?: string | null
          is_active?: boolean
          natureza_operacao_entrada?: string
          natureza_operacao_saida?: string
          provider?: string
          regime_tributario?: number | null
          serie_padrao?: number
          token_homolog_enc?: string | null
          token_prod_enc?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nfe_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      nfe_documents: {
        Row: {
          chave: string | null
          created_at: string
          created_by: string | null
          danfe_url: string | null
          direction: string
          environment: string
          error_message: string | null
          focus_status: string
          id: string
          numero: string | null
          payload_request: Json | null
          payload_response: Json | null
          pdf_url: string | null
          ref: string
          serie: string | null
          updated_at: string
          vehicle_id: string | null
          workspace_id: string
          xml_url: string | null
        }
        Insert: {
          chave?: string | null
          created_at?: string
          created_by?: string | null
          danfe_url?: string | null
          direction: string
          environment: string
          error_message?: string | null
          focus_status?: string
          id?: string
          numero?: string | null
          payload_request?: Json | null
          payload_response?: Json | null
          pdf_url?: string | null
          ref: string
          serie?: string | null
          updated_at?: string
          vehicle_id?: string | null
          workspace_id: string
          xml_url?: string | null
        }
        Update: {
          chave?: string | null
          created_at?: string
          created_by?: string | null
          danfe_url?: string | null
          direction?: string
          environment?: string
          error_message?: string | null
          focus_status?: string
          id?: string
          numero?: string | null
          payload_request?: Json | null
          payload_response?: Json | null
          pdf_url?: string | null
          ref?: string
          serie?: string | null
          updated_at?: string
          vehicle_id?: string | null
          workspace_id?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfe_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "renave_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfe_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          allowed_roles: Database["public"]["Enums"]["app_role"][]
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
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
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
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
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
      renave_config: {
        Row: {
          base_url: string
          cert_password_enc: string | null
          cert_storage_path: string | null
          certificate_password_ref: string | null
          certificate_ref: string | null
          cnpj: string | null
          consumer_key: string | null
          consumer_secret_ref: string | null
          created_at: string
          environment: string
          estabelecimento_id_padrao: string | null
          extra: Json
          id: string
          is_active: boolean
          oauth_client_id: string | null
          oauth_client_secret_enc: string | null
          oauth_token_cache: Json
          oauth_token_url: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          base_url?: string
          cert_password_enc?: string | null
          cert_storage_path?: string | null
          certificate_password_ref?: string | null
          certificate_ref?: string | null
          cnpj?: string | null
          consumer_key?: string | null
          consumer_secret_ref?: string | null
          created_at?: string
          environment?: string
          estabelecimento_id_padrao?: string | null
          extra?: Json
          id?: string
          is_active?: boolean
          oauth_client_id?: string | null
          oauth_client_secret_enc?: string | null
          oauth_token_cache?: Json
          oauth_token_url?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          base_url?: string
          cert_password_enc?: string | null
          cert_storage_path?: string | null
          certificate_password_ref?: string | null
          certificate_ref?: string | null
          cnpj?: string | null
          consumer_key?: string | null
          consumer_secret_ref?: string | null
          created_at?: string
          environment?: string
          estabelecimento_id_padrao?: string | null
          extra?: Json
          id?: string
          is_active?: boolean
          oauth_client_id?: string | null
          oauth_client_secret_enc?: string | null
          oauth_token_cache?: Json
          oauth_token_url?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renave_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      renave_endpoints: {
        Row: {
          body_template: Json | null
          category: string
          code: string
          created_at: string
          description: string | null
          headers: Json
          id: string
          is_enabled: boolean
          is_system: boolean
          method: string
          name: string
          path_template: string
          query_template: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body_template?: Json | null
          category: string
          code: string
          created_at?: string
          description?: string | null
          headers?: Json
          id?: string
          is_enabled?: boolean
          is_system?: boolean
          method?: string
          name: string
          path_template: string
          query_template?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body_template?: Json | null
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          headers?: Json
          id?: string
          is_enabled?: boolean
          is_system?: boolean
          method?: string
          name?: string
          path_template?: string
          query_template?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renave_endpoints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      renave_http_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          endpoint_code: string | null
          id: string
          method: string | null
          operation_id: string | null
          request_body: Json | null
          request_headers: Json | null
          response_body: Json | null
          response_headers: Json | null
          response_status: number | null
          url: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          endpoint_code?: string | null
          id?: string
          method?: string | null
          operation_id?: string | null
          request_body?: Json | null
          request_headers?: Json | null
          response_body?: Json | null
          response_headers?: Json | null
          response_status?: number | null
          url?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          endpoint_code?: string | null
          id?: string
          method?: string | null
          operation_id?: string | null
          request_body?: Json | null
          request_headers?: Json | null
          response_body?: Json | null
          response_headers?: Json | null
          response_status?: number | null
          url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renave_http_logs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "renave_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renave_http_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      renave_operations: {
        Row: {
          created_at: string
          created_by: string | null
          endpoint_code: string | null
          error_message: string | null
          id: string
          numero_documento: string | null
          operation_type: string
          request_payload: Json | null
          response_payload: Json | null
          status: string
          updated_at: string
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          endpoint_code?: string | null
          error_message?: string | null
          id?: string
          numero_documento?: string | null
          operation_type: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          endpoint_code?: string | null
          error_message?: string | null
          id?: string
          numero_documento?: string | null
          operation_type?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renave_operations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "renave_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renave_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      renave_queue: {
        Row: {
          attempts: number
          created_at: string
          endpoint_code: string
          id: string
          last_error: string | null
          max_attempts: number
          next_run_at: string
          operation_id: string | null
          payload: Json
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          endpoint_code: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_run_at?: string
          operation_id?: string | null
          payload?: Json
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          endpoint_code?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_run_at?: string
          operation_id?: string | null
          payload?: Json
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renave_queue_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "renave_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renave_queue_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      renave_vehicles: {
        Row: {
          ano_fabricacao: number | null
          ano_modelo: number | null
          chassi: string | null
          combustivel: string | null
          comprador_documento: string | null
          comprador_nome: string | null
          cor: string | null
          created_at: string
          created_by: string | null
          data_entrada: string | null
          data_saida: string | null
          fornecedor: string | null
          id: string
          km: number | null
          marca: string | null
          metadata: Json
          modelo: string | null
          nfe_entrada_chave: string | null
          nfe_saida_chave: string | null
          observacoes: string | null
          placa: string | null
          renavam: string | null
          status: string
          updated_at: string
          valor_compra: number | null
          valor_venda: number | null
          workspace_id: string
        }
        Insert: {
          ano_fabricacao?: number | null
          ano_modelo?: number | null
          chassi?: string | null
          combustivel?: string | null
          comprador_documento?: string | null
          comprador_nome?: string | null
          cor?: string | null
          created_at?: string
          created_by?: string | null
          data_entrada?: string | null
          data_saida?: string | null
          fornecedor?: string | null
          id?: string
          km?: number | null
          marca?: string | null
          metadata?: Json
          modelo?: string | null
          nfe_entrada_chave?: string | null
          nfe_saida_chave?: string | null
          observacoes?: string | null
          placa?: string | null
          renavam?: string | null
          status?: string
          updated_at?: string
          valor_compra?: number | null
          valor_venda?: number | null
          workspace_id: string
        }
        Update: {
          ano_fabricacao?: number | null
          ano_modelo?: number | null
          chassi?: string | null
          combustivel?: string | null
          comprador_documento?: string | null
          comprador_nome?: string | null
          cor?: string | null
          created_at?: string
          created_by?: string | null
          data_entrada?: string | null
          data_saida?: string | null
          fornecedor?: string | null
          id?: string
          km?: number | null
          marca?: string | null
          metadata?: Json
          modelo?: string | null
          nfe_entrada_chave?: string | null
          nfe_saida_chave?: string | null
          observacoes?: string | null
          placa?: string | null
          renavam?: string | null
          status?: string
          updated_at?: string
          valor_compra?: number | null
          valor_venda?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renave_vehicles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_automation_runs: {
        Row: {
          automation_id: string
          created_at: string
          id: string
          last_error: string | null
          last_run_at: string | null
          lead_id: string
          next_run_at: string
          runs_count: number
          stage_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          lead_id: string
          next_run_at: string
          runs_count?: number
          stage_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          lead_id?: string
          next_run_at?: string
          runs_count?: number
          stage_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "stage_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_automation_runs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_automations: {
        Row: {
          action_type: string
          active: boolean
          created_at: string
          created_by: string | null
          delay_seconds: number
          id: string
          interval_seconds: number | null
          max_runs: number | null
          message: string | null
          name: string
          stage_id: string
          trigger_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action_type?: string
          active?: boolean
          created_at?: string
          created_by?: string | null
          delay_seconds?: number
          id?: string
          interval_seconds?: number | null
          max_runs?: number | null
          message?: string | null
          name?: string
          stage_id: string
          trigger_type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action_type?: string
          active?: boolean
          created_at?: string
          created_by?: string | null
          delay_seconds?: number
          id?: string
          interval_seconds?: number | null
          max_runs?: number | null
          message?: string | null
          name?: string
          stage_id?: string
          trigger_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_automations_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_automations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
      webhook_events: {
        Row: {
          attempts: number
          created_at: string
          event_kind: string
          id: number
          last_error: string | null
          locked_at: string | null
          n8n_http_status: number | null
          n8n_requested_at: string | null
          n8n_status: string | null
          payload: Json
          processed_at: string | null
          raw_body: string | null
          source: string
          status: string
          trace_id: string | null
          wa_message_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_kind?: string
          id?: number
          last_error?: string | null
          locked_at?: string | null
          n8n_http_status?: number | null
          n8n_requested_at?: string | null
          n8n_status?: string | null
          payload: Json
          processed_at?: string | null
          raw_body?: string | null
          source?: string
          status?: string
          trace_id?: string | null
          wa_message_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          event_kind?: string
          id?: number
          last_error?: string | null
          locked_at?: string | null
          n8n_http_status?: number | null
          n8n_requested_at?: string | null
          n8n_status?: string | null
          payload?: Json
          processed_at?: string | null
          raw_body?: string | null
          source?: string
          status?: string
          trace_id?: string | null
          wa_message_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: []
      }
      whatsapp_numbers: {
        Row: {
          access_token: string | null
          app_id: string | null
          auto_reply_enabled: boolean
          auto_reply_prompt: string | null
          connection_scope: string
          connection_status: Database["public"]["Enums"]["wa_connection_status"]
          created_at: string
          default_owner_id: string | null
          display_number: string
          id: string
          instance_name: string | null
          is_active: boolean
          label: string
          last_qr: string | null
          last_qr_at: string | null
          last_webhook_at: string | null
          n8n_webhook_auth_header: string | null
          n8n_webhook_url: string | null
          phone_number_id: string | null
          provider: Database["public"]["Enums"]["wa_provider"]
          provider_api_key: string | null
          provider_base_url: string | null
          updated_at: string
          wa_owner_jid: string | null
          wa_profile_name: string | null
          waba_id: string | null
          webhook_verify_token: string
          workspace_id: string
        }
        Insert: {
          access_token?: string | null
          app_id?: string | null
          auto_reply_enabled?: boolean
          auto_reply_prompt?: string | null
          connection_scope?: string
          connection_status?: Database["public"]["Enums"]["wa_connection_status"]
          created_at?: string
          default_owner_id?: string | null
          display_number: string
          id?: string
          instance_name?: string | null
          is_active?: boolean
          label: string
          last_qr?: string | null
          last_qr_at?: string | null
          last_webhook_at?: string | null
          n8n_webhook_auth_header?: string | null
          n8n_webhook_url?: string | null
          phone_number_id?: string | null
          provider?: Database["public"]["Enums"]["wa_provider"]
          provider_api_key?: string | null
          provider_base_url?: string | null
          updated_at?: string
          wa_owner_jid?: string | null
          wa_profile_name?: string | null
          waba_id?: string | null
          webhook_verify_token?: string
          workspace_id: string
        }
        Update: {
          access_token?: string | null
          app_id?: string | null
          auto_reply_enabled?: boolean
          auto_reply_prompt?: string | null
          connection_scope?: string
          connection_status?: Database["public"]["Enums"]["wa_connection_status"]
          created_at?: string
          default_owner_id?: string | null
          display_number?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean
          label?: string
          last_qr?: string | null
          last_qr_at?: string | null
          last_webhook_at?: string | null
          n8n_webhook_auth_header?: string | null
          n8n_webhook_url?: string | null
          phone_number_id?: string | null
          provider?: Database["public"]["Enums"]["wa_provider"]
          provider_api_key?: string | null
          provider_base_url?: string | null
          updated_at?: string
          wa_owner_jid?: string | null
          wa_profile_name?: string | null
          waba_id?: string | null
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
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          token_hash: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token_hash: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token_hash?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          accepts_new_leads: boolean
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          accepts_new_leads?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          accepts_new_leads?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
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
          feature_ai: boolean
          feature_renave: boolean
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
          workspace_mode: Database["public"]["Enums"]["workspace_mode"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          feature_ai?: boolean
          feature_renave?: boolean
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
          workspace_mode?: Database["public"]["Enums"]["workspace_mode"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          feature_ai?: boolean
          feature_renave?: boolean
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
          workspace_mode?: Database["public"]["Enums"]["workspace_mode"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_next_agent: { Args: { _workspace_id: string }; Returns: string }
      can_access_conversation: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      complete_triage_and_assign: {
        Args: {
          _ai_summary?: string
          _conversation_id: string
          _idempotency_key?: string
        }
        Returns: Json
      }
      create_workspace_with_defaults: {
        Args: { _name: string; _slug: string; _user_id: string }
        Returns: string
      }
      create_workspace_with_mode: {
        Args: { _mode?: string; _name: string; _slug: string; _user_id: string }
        Returns: string
      }
      ensure_whatsapp_number_label: {
        Args: { _wa_number_id: string; _workspace_id: string }
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
      is_workspace_admin: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      purge_old_messages: { Args: never; Returns: undefined }
      renave_seed_endpoints: {
        Args: { _workspace_id: string }
        Returns: number
      }
      set_workspace_mode: {
        Args: { _mode: string; _workspace_id: string }
        Returns: string
      }
      transfer_conversation: {
        Args: { _conversation_id: string; _reason?: string; _to_user: string }
        Returns: string
      }
      workspace_mode_of: {
        Args: { _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_mode"]
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
      contact_type: "person" | "company" | "group"
      conversation_status: "open" | "pending" | "resolved" | "closed"
      label_kind: "system" | "custom"
      label_scope: "conversation" | "contact" | "lead"
      lead_priority: "low" | "medium" | "high" | "urgent"
      message_direction: "inbound" | "outbound" | "internal"
      queue_strategy: "round_robin" | "manual" | "hybrid"
      sender_type: "contact" | "user" | "ai" | "system"
      stage_type: "open" | "won" | "lost"
      wa_connection_status:
        | "disconnected"
        | "qr"
        | "connecting"
        | "connected"
        | "error"
      wa_delivery_status: "pending" | "sent" | "delivered" | "read" | "failed"
      wa_provider: "cloud_api" | "evolution" | "zapi"
      wa_template_status: "pending" | "approved" | "rejected" | "paused"
      workspace_mode: "individual" | "shared"
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
      contact_type: ["person", "company", "group"],
      conversation_status: ["open", "pending", "resolved", "closed"],
      label_kind: ["system", "custom"],
      label_scope: ["conversation", "contact", "lead"],
      lead_priority: ["low", "medium", "high", "urgent"],
      message_direction: ["inbound", "outbound", "internal"],
      queue_strategy: ["round_robin", "manual", "hybrid"],
      sender_type: ["contact", "user", "ai", "system"],
      stage_type: ["open", "won", "lost"],
      wa_connection_status: [
        "disconnected",
        "qr",
        "connecting",
        "connected",
        "error",
      ],
      wa_delivery_status: ["pending", "sent", "delivered", "read", "failed"],
      wa_provider: ["cloud_api", "evolution", "zapi"],
      wa_template_status: ["pending", "approved", "rejected", "paused"],
      workspace_mode: ["individual", "shared"],
    },
  },
} as const
