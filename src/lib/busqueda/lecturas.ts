import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { esquemaBusqueda, type GrupoBusqueda } from './modelo'

export const RESULTADOS_POR_PAGINA = 20

export async function buscarGlobal(q: string, grupo?: GrupoBusqueda, pagina = 1) {
  const consulta = esquemaBusqueda.parse(q)
  if (!consulta) return []
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('buscar_global', {
    texto: consulta,
    p_grupo: grupo,
    p_limite: grupo ? RESULTADOS_POR_PAGINA : 5,
    p_desde: grupo ? (pagina - 1) * RESULTADOS_POR_PAGINA : 0,
  })
  if (error) throw error
  return data
}
