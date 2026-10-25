// tests/integration/cotizaciones-helpers.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { sql } from './helpers'

/** IDs de los datos iniciales (migración) y de ejemplo (seed.sql) que usan los tests de cotizaciones. */
export async function idsDeEjemplo() {
  const [fila] = await sql<{
    cliente_id: string
    cliente_con_contacto_id: string
    contacto_id: string
    equipo_id: string
    firmante_id: string
    plantilla_jornada_id: string
  }>(`
    select
      (select id from public.clientes where razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.') as cliente_id,
      (select id from public.clientes where razon_social = 'Milicic S.A.') as cliente_con_contacto_id,
      (select k.id from public.contactos k join public.clientes c on c.id = k.cliente_id
        where c.razon_social = 'Milicic S.A.' limit 1) as contacto_id,
      (select id from public.equipos where nombre = 'Grúa telescópica XCMG QY70K-1 40 TN') as equipo_id,
      (select id from public.firmantes where nombre = 'Thomas Cravero') as firmante_id,
      (select id from public.plantillas where nombre = 'Por jornada - Grúa con operador') as plantilla_jornada_id
  `)
  return fila
}

export const ITEMS_JORNADA = [
  { seccion: 'Precios Jornada', descripcion: 'Alquiler jornada de Grúa Telescópica de {{capacidad}} TN (lunes a sábado)', unidad: 'JORNADA', cantidad: 1, precio_unitario: 1950000 },
  { seccion: 'Precios Jornada', descripcion: 'Movilización y desmovilización de Grúa Telescópica', unidad: 'VIAJE', cantidad: 1, precio_unitario: 2800000 },
  { seccion: 'Precios Jornada Adicional', descripcion: 'Jornadas diarias (8 hs) adicionales, domingos y feriados', unidad: 'JORNADA', cantidad: 1, precio_unitario: 2530000 },
]

/** El updated_at de la cotización tal como lo devuelve la API: la versión que piden guardar, enviar y aprobar. */
export async function versionDe(cliente: SupabaseClient<Database>, id: string): Promise<string> {
  const { data, error } = await cliente.from('cotizaciones').select('updated_at').eq('id', id).single()
  if (error) throw error
  return data.updated_at
}
