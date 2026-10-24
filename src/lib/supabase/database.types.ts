
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
                },"cotizacion_envios": {
                  Row: {
                    "cotizacion_id": string,"created_by": string | null,"enviada_at": string,"id": string,"pdf_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cotizacion_id": string,"created_by"?: string | null,"enviada_at"?: string,"id"?: string,"pdf_path": string
                  }
                  Update: {
                    "cotizacion_id"?: string,"created_by"?: string | null,"enviada_at"?: string,"id"?: string,"pdf_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cotizacion_envios_cotizacion_id_fkey"
      columns: ["cotizacion_id"]
isOneToOne: false
      referencedRelation: "cotizaciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizacion_envios_cotizacion_id_fkey"
      columns: ["cotizacion_id"]
isOneToOne: false
      referencedRelation: "v_cotizaciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizacion_envios_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"cotizacion_items": {
                  Row: {
                    "cantidad": number,"cotizacion_id": string,"descripcion": string,"id": string,"orden": number,"precio_unitario": number | null,"seccion": string,"total": number | null,"unidad": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad"?: number,"cotizacion_id": string,"descripcion": string,"id"?: string,"orden": number,"precio_unitario"?: number | null,"seccion"?: string,"total"?: never,"unidad": string
                  }
                  Update: {
                    "cantidad"?: number,"cotizacion_id"?: string,"descripcion"?: string,"id"?: string,"orden"?: number,"precio_unitario"?: number | null,"seccion"?: string,"total"?: never,"unidad"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cotizacion_items_cotizacion_id_fkey"
      columns: ["cotizacion_id"]
isOneToOne: false
      referencedRelation: "cotizaciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizacion_items_cotizacion_id_fkey"
      columns: ["cotizacion_id"]
isOneToOne: false
      referencedRelation: "v_cotizaciones"
      referencedColumns: ["id"]
    }
                  ]
                },"cotizaciones": {
                  Row: {
                    "archivo_original_path": string | null,"asunto": string,"bloques": NonNullable<Json>,"cliente_id": string,"contacto_id": string | null,"created_at": string,"created_by": string | null,"datos": NonNullable<Json>,"equipo_id": string | null,"estado": string,"fecha": string,"fecha_aprobacion": string | null,"fecha_proxima_actualizacion": string | null,"firmante_id": string | null,"formato": string,"id": string,"intro": string,"mostrar_total": boolean,"notas": string,"numero": number,"origen": string,"pdf_aprobado_path": string | null,"plantilla_id": string | null,"presupuesto_estado": string | null,"presupuesto_motivo": string,"reemplaza_a": string | null,"updated_at": string,"validez_dias": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archivo_original_path"?: string | null,"asunto"?: string,"bloques"?: NonNullable<Json>,"cliente_id": string,"contacto_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"datos"?: NonNullable<Json>,"equipo_id"?: string | null,"estado"?: string,"fecha"?: string,"fecha_aprobacion"?: string | null,"fecha_proxima_actualizacion"?: string | null,"firmante_id"?: string | null,"formato": string,"id"?: string,"intro"?: string,"mostrar_total"?: boolean,"notas"?: string,"numero"?: number,"origen"?: string,"pdf_aprobado_path"?: string | null,"plantilla_id"?: string | null,"presupuesto_estado"?: string | null,"presupuesto_motivo"?: string,"reemplaza_a"?: string | null,"updated_at"?: string,"validez_dias"?: number
                  }
                  Update: {
                    "archivo_original_path"?: string | null,"asunto"?: string,"bloques"?: NonNullable<Json>,"cliente_id"?: string,"contacto_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"datos"?: NonNullable<Json>,"equipo_id"?: string | null,"estado"?: string,"fecha"?: string,"fecha_aprobacion"?: string | null,"fecha_proxima_actualizacion"?: string | null,"firmante_id"?: string | null,"formato"?: string,"id"?: string,"intro"?: string,"mostrar_total"?: boolean,"notas"?: string,"numero"?: number,"origen"?: string,"pdf_aprobado_path"?: string | null,"plantilla_id"?: string | null,"presupuesto_estado"?: string | null,"presupuesto_motivo"?: string,"reemplaza_a"?: string | null,"updated_at"?: string,"validez_dias"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cotizaciones_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_contacto_id_fkey"
      columns: ["contacto_id"]
isOneToOne: false
      referencedRelation: "contactos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_equipo_id_fkey"
      columns: ["equipo_id"]
isOneToOne: false
      referencedRelation: "equipos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_firmante_id_fkey"
      columns: ["firmante_id"]
isOneToOne: false
      referencedRelation: "firmantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_plantilla_id_fkey"
      columns: ["plantilla_id"]
isOneToOne: false
      referencedRelation: "plantillas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_reemplaza_a_fkey"
      columns: ["reemplaza_a"]
isOneToOne: false
      referencedRelation: "cotizaciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_reemplaza_a_fkey"
      columns: ["reemplaza_a"]
isOneToOne: false
      referencedRelation: "v_cotizaciones"
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
            "v_cotizaciones": {
                  Row: {
                    "archivo_original_path": string | null,"asunto": string,"bloques": NonNullable<Json>,"cliente_id": string,"cliente_razon_social": string,"contacto_id": string | null,"created_at": string,"created_by": string | null,"datos": NonNullable<Json>,"equipo_id": string | null,"estado": string,"fecha": string,"fecha_aprobacion": string | null,"fecha_proxima_actualizacion": string | null,"firmante_id": string | null,"formato": string,"id": string,"intro": string,"mostrar_total": boolean,"notas": string,"numero": number,"origen": string,"pdf_aprobado_path": string | null,"plantilla_id": string | null,"presupuesto_estado": string | null,"presupuesto_motivo": string,"reemplaza_a": string | null,"updated_at": string,"validez_dias": number,"vence_el": string | null,"vencida": boolean | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "cotizaciones_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_contacto_id_fkey"
      columns: ["contacto_id"]
isOneToOne: false
      referencedRelation: "contactos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_equipo_id_fkey"
      columns: ["equipo_id"]
isOneToOne: false
      referencedRelation: "equipos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_firmante_id_fkey"
      columns: ["firmante_id"]
isOneToOne: false
      referencedRelation: "firmantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_plantilla_id_fkey"
      columns: ["plantilla_id"]
isOneToOne: false
      referencedRelation: "plantillas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_reemplaza_a_fkey"
      columns: ["reemplaza_a"]
isOneToOne: false
      referencedRelation: "cotizaciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cotizaciones_reemplaza_a_fkey"
      columns: ["reemplaza_a"]
isOneToOne: false
      referencedRelation: "v_cotizaciones"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "borrar_cotizacion":
{ Args: { "p_id": string }; Returns: undefined
                           },
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
      } },
"duplicar_cotizacion":
{ Args: { "p_cliente_id"?: string,"p_id": string }; Returns: string
                           },
"guardar_cotizacion":
{ Args: { "p_datos": Json,"p_id"?: string,"p_items": Json }; Returns: string
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
