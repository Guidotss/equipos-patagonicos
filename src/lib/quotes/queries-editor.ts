// src/lib/cotizaciones/lecturas-editor.ts
// Lo que leen las páginas del editor (/cotizaciones/nueva y /cotizaciones/[id]) además de la cotización.
// Recibe el cliente de Supabase por parámetro y no importa 'server-only': lo prueban los tests de integración.
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerBloques, leerItemsPlantilla, type Formato } from '@/lib/plantillas/contenido'
import type { Database } from '@/lib/supabase/database.types'
import type { CatalogosEditor } from './editor'
import type { ContactoEditor } from './editor-pantalla'

type Cliente = SupabaseClient<Database>

/** Lo que la cotización ya tiene elegido: se ofrece en los combos aunque esté inactivo (decisión 20). */
export type ElegidosEditor = { plantillaId: string | null; equipoId: string | null; firmanteId: string | null }

const NADA_ELEGIDO: ElegidosEditor = { plantillaId: null, equipoId: null, firmanteId: null }

/** Plantillas, equipos y firmantes (activos más lo ya elegido) y los datos de la empresa que usa el PDF. */
export async function leerCatalogosEditor(
  supabase: Cliente,
  elegidos: ElegidosEditor = NADA_ELEGIDO,
): Promise<CatalogosEditor> {
  const [plantillas, equipos, firmantes, empresa] = await Promise.all([
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
  if (empresa.error) throw empresa.error

  return {
    plantillas: plantillas.data
      .filter((plantilla) => plantilla.activa || plantilla.id === elegidos.plantillaId)
      .map((plantilla) => ({
        id: plantilla.id,
        nombre: plantilla.nombre,
        formato: plantilla.formato as Formato,
        asunto: plantilla.asunto,
        intro: plantilla.intro,
        validez_dias: plantilla.validez_dias,
        bloques: leerBloques(plantilla.bloques),
        items: leerItemsPlantilla(plantilla.items),
      })),
    equipos: equipos.data.filter((equipo) => equipo.activo || equipo.id === elegidos.equipoId),
    firmantes: firmantes.data.filter((firmante) => firmante.activo || firmante.id === elegidos.firmanteId),
    empresa: empresa.data,
  }
}

/** Firmante de la última cotización creada en la app que tenga un firmante activo (decisión 9). */
export async function leerUltimoFirmante(
  supabase: Cliente,
  firmantes: CatalogosEditor['firmantes'],
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
export async function leerContactos(supabase: Cliente, clienteId: string): Promise<ContactoEditor[]> {
  const { data, error } = await supabase
    .from('contactos')
    .select('id, nombre, email')
    .eq('cliente_id', clienteId)
    .order('nombre')
  if (error) throw error
  return data
}
