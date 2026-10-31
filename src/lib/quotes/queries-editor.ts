// src/lib/cotizaciones/lecturas-editor.ts
// Lo que leen las páginas del editor (/cotizaciones/nueva y /cotizaciones/[id]) además de la cotización.
// Recibe el cliente de Supabase por parámetro y no importa 'server-only': lo prueban los tests de integración.
import type { SupabaseClient } from '@supabase/supabase-js'
import { readBlocks, readItemsTemplate, type Format } from '@/lib/templates/content'
import type { Database } from '@/lib/supabase/database.types'
import type { CatalogsEditor } from './editor'
import type { ContactEditor } from './editor-screen'

type Client = SupabaseClient<Database>

/** Lo que la cotización ya tiene elegido: se ofrece en los combos aunque esté inactivo (decisión 20). */
export type ElegidosEditor = { templateId: string | null; equipoId: string | null; firmanteId: string | null }

const NADA_CHOSEN: ElegidosEditor = { templateId: null, equipoId: null, firmanteId: null }

/** Plantillas, equipos y firmantes (activos más lo ya elegido) y los datos de la empresa que usa el PDF. */
export async function readCatalogsEditor(
  supabase: Client,
  elegidos: ElegidosEditor = NADA_CHOSEN,
): Promise<CatalogsEditor> {
  const [plantillas, equipos, firmantes, company] = await Promise.all([
    supabase
      .from('plantillas')
      .select('id, nombre, formato, asunto, intro, validez_dias, bloques, items, activa')
      .order('nombre'),
    supabase.from('equipos').select('id, nombre, capacidad_tn, descripcion, activo').order('nombre'),
    supabase.from('firmantes').select('id, nombre, cargo, telefono, activo').order('nombre'),
    supabase
      .from('empresa_config')
      .select('razon_social, direccion, ciudad, telefono, email, web, indice_base, proxima_actualizacion')
      .single(),
  ])
  if (plantillas.error) throw plantillas.error
  if (equipos.error) throw equipos.error
  if (firmantes.error) throw firmantes.error
  if (company.error) throw company.error

  return {
    plantillas: plantillas.data
      .filter((template) => template.activa || template.id === elegidos.templateId)
      .map((template) => ({
        id: template.id,
        nombre: template.nombre,
        formato: template.formato as Format,
        asunto: template.asunto,
        intro: template.intro,
        validez_dias: template.validez_dias,
        bloques: readBlocks(template.bloques),
        items: readItemsTemplate(template.items),
      })),
    equipos: equipos.data.filter((equipo) => equipo.activo || equipo.id === elegidos.equipoId),
    firmantes: firmantes.data.filter((firmante) => firmante.activo || firmante.id === elegidos.firmanteId),
    empresa: company.data,
  }
}

/** Firmante de la última cotización creada en la app que tenga un firmante activo (decisión 9). */
export async function readLastSigner(
  supabase: Client,
  firmantes: CatalogsEditor['firmantes'],
): Promise<string | null> {
  const activos = firmantes.filter((firmante) => firmante.activo).map((firmante) => firmante.id)
  if (activos.length === 0) return null
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('firmante_id')
    .eq('origen', 'app')
    .in('firmante_id', activos)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.firmante_id ?? null
}

/** Contactos de un cliente para el "Atte.", por nombre. */
export async function readContacts(supabase: Client, clientId: string): Promise<ContactEditor[]> {
  const { data, error } = await supabase
    .from('contactos')
    .select('id, nombre, email')
    .eq('cliente_id', clientId)
    .order('nombre')
  if (error) throw error
  return data
}
