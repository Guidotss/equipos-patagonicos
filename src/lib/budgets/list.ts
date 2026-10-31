import { z } from 'zod'

export const ESTADOS_PRESUPUESTO = { en_curso: 'En curso', finalizado: 'Finalizado', anulado: 'Anulado' } as const
export const POR_PAGINA = 25
const primero = (valor: unknown) => (Array.isArray(valor) ? valor[0] : valor)
const esquema = z.object({
  q: z
    .preprocess(
      primero,
      z.string().transform((s) =>
        Array.from(s.replace(/\p{Cc}/gu, ' ').trim())
          .slice(0, 100)
          .join(''),
      ),
    )
    .catch(''),
  estado: z.preprocess(primero, z.enum(['', 'en_curso', 'finalizado', 'anulado'])).catch(''),
  cliente: z.preprocess(primero, z.uuid()).catch(''),
  pagina: z
    .preprocess(
      primero,
      z
        .string()
        .regex(/^\d{1,5}$/)
        .transform(Number)
        .pipe(z.number().min(1).max(10000)),
    )
    .catch(1),
})
export type FiltrosPresupuestos = z.output<typeof esquema>
export const leerFiltrosPresupuestos = (valores: Record<string, string | string[] | undefined>) =>
  esquema.parse(valores)
export function hrefPresupuestos(filtros: FiltrosPresupuestos, pagina = 1) {
  const parametros = new URLSearchParams()
  for (const campo of ['q', 'cliente', 'estado'] as const) if (filtros[campo]) parametros.set(campo, filtros[campo])
  if (pagina > 1) parametros.set('pagina', String(pagina))
  return `/presupuestos${parametros.size ? '?' + parametros.toString() : ''}`
}
