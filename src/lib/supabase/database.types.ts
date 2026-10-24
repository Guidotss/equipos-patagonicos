
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "clientes": {
                  Row: {
                    "activo": boolean,"condicion_iva": string | null,"condicion_pago": string,"created_at": string,"created_by": string | null,"cuit": string | null,"direccion": string,"email": string,"id": string,"localidad": string,"notas": string,"provincia": string,"razon_social": string,"telefono": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"condicion_iva"?: string | null,"condicion_pago"?: string,"created_at"?: string,"created_by"?: string | null,"cuit"?: string | null,"direccion"?: string,"email"?: string,"id"?: string,"localidad"?: string,"notas"?: string,"provincia"?: string,"razon_social": string,"telefono"?: string,"updated_at"?: string
                  }
                  Update: {
                    "activo"?: boolean,"condicion_iva"?: string | null,"condicion_pago"?: string,"created_at"?: string,"created_by"?: string | null,"cuit"?: string | null,"direccion"?: string,"email"?: string,"id"?: string,"localidad"?: string,"notas"?: string,"provincia"?: string,"razon_social"?: string,"telefono"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clientes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"contactos": {
                  Row: {
                    "cargo": string,"cliente_id": string,"created_at": string,"email": string,"id": string,"nombre": string,"telefono": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cargo"?: string,"cliente_id": string,"created_at"?: string,"email"?: string,"id"?: string,"nombre": string,"telefono"?: string,"updated_at"?: string
                  }
                  Update: {
                    "cargo"?: string,"cliente_id"?: string,"created_at"?: string,"email"?: string,"id"?: string,"nombre"?: string,"telefono"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contactos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    }
                  ]
                },"empresa_config": {
                  Row: {
                    "ciudad": string,"cuit": string | null,"direccion": string,"email": string,"id": boolean,"indice_base": string,"provincia": string,"proxima_actualizacion": string,"razon_social": string,"telefono": string,"updated_at": string,"web": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ciudad"?: string,"cuit"?: string | null,"direccion"?: string,"email"?: string,"id"?: boolean,"indice_base"?: string,"provincia"?: string,"proxima_actualizacion"?: string,"razon_social": string,"telefono"?: string,"updated_at"?: string,"web"?: string
                  }
                  Update: {
                    "ciudad"?: string,"cuit"?: string | null,"direccion"?: string,"email"?: string,"id"?: boolean,"indice_base"?: string,"provincia"?: string,"proxima_actualizacion"?: string,"razon_social"?: string,"telefono"?: string,"updated_at"?: string,"web"?: string
                  }
                  Relationships: [
                    
                  ]
                },"equipos": {
                  Row: {
                    "activo": boolean,"capacidad_tn": number | null,"created_at": string,"descripcion": string,"id": string,"identificacion": string,"marca": string,"modelo": string,"nombre": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"capacidad_tn"?: number | null,"created_at"?: string,"descripcion"?: string,"id"?: string,"identificacion"?: string,"marca"?: string,"modelo"?: string,"nombre": string,"updated_at"?: string
                  }
                  Update: {
                    "activo"?: boolean,"capacidad_tn"?: number | null,"created_at"?: string,"descripcion"?: string,"id"?: string,"identificacion"?: string,"marca"?: string,"modelo"?: string,"nombre"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"firmantes": {
                  Row: {
                    "activo": boolean,"cargo": string,"created_at": string,"email": string,"id": string,"nombre": string,"telefono": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"cargo"?: string,"created_at"?: string,"email"?: string,"id"?: string,"nombre": string,"telefono"?: string,"updated_at"?: string
                  }
                  Update: {
                    "activo"?: boolean,"cargo"?: string,"created_at"?: string,"email"?: string,"id"?: string,"nombre"?: string,"telefono"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"plantillas": {
                  Row: {
                    "activa": boolean,"asunto": string,"bloques": NonNullable<Json>,"created_at": string,"formato": string,"id": string,"intro": string,"items": NonNullable<Json>,"nombre": string,"updated_at": string,"validez_dias": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activa"?: boolean,"asunto"?: string,"bloques"?: NonNullable<Json>,"created_at"?: string,"formato": string,"id"?: string,"intro"?: string,"items"?: NonNullable<Json>,"nombre": string,"updated_at"?: string,"validez_dias"?: number
                  }
                  Update: {
                    "activa"?: boolean,"asunto"?: string,"bloques"?: NonNullable<Json>,"created_at"?: string,"formato"?: string,"id"?: string,"intro"?: string,"items"?: NonNullable<Json>,"nombre"?: string,"updated_at"?: string,"validez_dias"?: number
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "activo": boolean,"created_at": string,"id": string,"nombre": string,"rol": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"created_at"?: string,"id": string,"nombre": string,"rol"?: string,"updated_at"?: string
                  }
                  Update: {
                    "activo"?: boolean,"created_at"?: string,"id"?: string,"nombre"?: string,"rol"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "buscar_clientes":
{ Args: { "limite"?: number,"texto"?: string }; Returns: {
              "activo": boolean,
"condicion_iva": string | null,
"condicion_pago": string,
"created_at": string,
"created_by": string | null,
"cuit": string | null,
"direccion": string,
"email": string,
"id": string,
"localidad": string,
"notas": string,
"provincia": string,
"razon_social": string,
"telefono": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "clientes"
        isOneToOne: false
        isSetofReturn: true
      } }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
