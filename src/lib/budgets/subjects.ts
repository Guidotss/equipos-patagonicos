import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { colapsarPuntoDoble, valuesVariables } from '@/lib/quotes/document'
import { resolverVariables, usedVariables } from '@/lib/templates/variables'

type BudgetSubject = { id: string; numero: number; origen: string; asunto: string }

export async function withBudgetSubjects<T extends BudgetSubject>(
  supabase: SupabaseClient<Database>,
  budgets: T[],
): Promise<(T & { displaySubject: string })[]> {
  const templates = budgets.flatMap((budget) => {
    const variables = budget.origen === 'app' ? usedVariables(budget.asunto) : []
    return variables.length ? [{ id: budget.id, variables }] : []
  })
  if (!templates.length) return budgets.map((budget) => ({ ...budget, displaySubject: budget.asunto }))

  const usesCompany = templates.some(({ variables }) =>
    variables.includes('indice_base') || variables.includes('proxima_actualizacion'),
  )
  const [quotes, company] = await Promise.all([
    supabase.from('cotizaciones').select('id, datos, validez_dias, equipo:equipos(capacidad_tn, descripcion)')
      .in('id', templates.map(({ id }) => id)),
    usesCompany ? supabase.from('empresa_config').select('indice_base, proxima_actualizacion').maybeSingle() : null,
  ])
  if (quotes.error) throw quotes.error
  if (company?.error) throw company.error
  const sources = new Map(quotes.data.map((quote) => [quote.id, quote]))
  const templatedIds = new Set(templates.map(({ id }) => id))

  return budgets.map((budget) => {
    if (!templatedIds.has(budget.id)) return { ...budget, displaySubject: budget.asunto }
    const source = sources.get(budget.id)
    const values: ReturnType<typeof valuesVariables> = source ? valuesVariables({
      cotizacion: { numero: budget.numero, datos: source.datos, validez_dias: source.validez_dias },
      equipo: source.equipo,
      empresa: company?.data ?? undefined,
    }) : { numero: String(budget.numero) }
    // En la ficha, una capacidad sin dato no debe dejar una unidad suelta en el asunto.
    const subject = values.capacidad ? budget.asunto
      : budget.asunto.replace(/\s+(?:(?:de|capacidad)\s+)?\{\{\s*capacidad\s*\}\}\s+TN\b/gi, '')
    const resolved = resolverVariables(subject, values).texto.replace(/\{\{[^{}]*\}\}/g, '')
    const displaySubject = colapsarPuntoDoble(resolved).replace(/\s+/g, ' ').replace(/ ([.,;:])/g, '$1').trim()
    return { ...budget, displaySubject: /[\p{L}\p{N}]/u.test(displaySubject) ? displaySubject : '' }
  })
}
