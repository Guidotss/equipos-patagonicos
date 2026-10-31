import { z } from 'zod'

export const STATUSES_BUDGET = { en_curso: 'En curso', finalizado: 'Finalizado', anulado: 'Anulado' } as const
export const PER_PAGE = 25
const first = (value: unknown) => (Array.isArray(value) ? value[0] : value)
const schema = z.object({
  q: z
    .preprocess(
      first,
      z.string().transform((s) =>
        Array.from(s.replace(/\p{Cc}/gu, ' ').trim())
          .slice(0, 100)
          .join(''),
      ),
    )
    .catch(''),
  estado: z.preprocess(first, z.enum(['', 'en_curso', 'finalizado', 'anulado'])).catch(''),
  cliente: z.preprocess(first, z.uuid()).catch(''),
  pagina: z
    .preprocess(
      first,
      z
        .string()
        .regex(/^\d{1,5}$/)
        .transform(Number)
        .pipe(z.number().min(1).max(10000)),
    )
    .catch(1),
})
export type FiltersBudgets = z.output<typeof schema>
export const readFiltersBudgets = (values: Record<string, string | string[] | undefined>) =>
  schema.parse(values)
export function hrefBudgets(filters: FiltersBudgets, pagina = 1) {
  const params = new URLSearchParams()
  for (const field of ['q', 'cliente', 'estado'] as const) if (filters[field]) params.set(field, filters[field])
  if (pagina > 1) params.set('pagina', String(pagina))
  return `/presupuestos${params.size ? '?' + params.toString() : ''}`
}
