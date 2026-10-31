import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { schemaSearch, type GroupSearch } from './model'

export const RESULTS_PER_PAGE = 20

export async function searchGlobal(q: string, grupo?: GroupSearch, pagina = 1) {
  const consulta = schemaSearch.parse(q)
  if (!consulta) return []
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('buscar_global', {
    texto: consulta,
    p_grupo: grupo,
    p_limite: grupo ? RESULTS_PER_PAGE : 5,
    p_desde: grupo ? (pagina - 1) * RESULTS_PER_PAGE : 0,
  })
  if (error) throw error
  return data
}
