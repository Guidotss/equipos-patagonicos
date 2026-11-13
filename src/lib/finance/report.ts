import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/supabase/database.types'

export const EQUIPMENT_REVENUE_PATH = '/reports/equipment-revenue'

const dateSchema = z.iso
  .date()
  .refine((date) => date.length === 10 && !date.startsWith('0000-'))
const reviewCategorySchema = z.enum(['unknown', 'unallocated', 'undated'])
const decimalSchema = z.string().regex(/^\d+(\.\d{1,2})?$/)
const totalsSchema = z.object({
  amount: decimalSchema,
  invoiceCount: z.int().nonnegative(),
})
const equipmentRevenueSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('summary'),
    period: totalsSchema,
    undated: totalsSchema,
    groups: z.array(
      totalsSchema.extend({
        category: z.enum(['assigned', 'none', 'unknown', 'unallocated']),
        equipmentId: z.uuid().nullable(),
        equipmentName: z.string().nullable(),
        active: z.boolean().nullable(),
      }),
    ),
  }),
  z.object({
    kind: z.literal('review'),
    category: reviewCategorySchema,
    total: z.int().nonnegative(),
    page: z.int().positive(),
    pageSize: z.int().positive(),
    invoices: z.array(
      z.object({
        id: z.uuid(),
        number: z.string(),
        issuedOn: dateSchema.nullable(),
        amount: decimalSchema,
      }),
    ),
  }),
])

export type RevenueReviewCategory = z.infer<typeof reviewCategorySchema>
type EquipmentRevenue = z.infer<typeof equipmentRevenueSchema>
export type RevenueSummary = Extract<EquipmentRevenue, { kind: 'summary' }>
export type RevenueReview = Extract<EquipmentRevenue, { kind: 'review' }>

type SearchParams = Record<string, string | string[] | undefined>
type DateRange = { from: string; to: string }
export type EquipmentRevenueQuery = DateRange & {
  review: RevenueReviewCategory | null
  page: number
  error: string | null
}

export function isRevenueDate(date: string) {
  return dateSchema.safeParse(date).success
}

export function readEquipmentRevenueQuery(
  params: SearchParams,
): EquipmentRevenueQuery {
  const from = firstValue(params.desde)
  const to = firstValue(params.hasta)
  const review = reviewCategorySchema.safeParse(params.revisar).data ?? null
  const requestedPage = firstValue(params.pagina)
  const page = /^\d{1,10}$/.test(requestedPage) ? Number(requestedPage) : 1
  return {
    from,
    to,
    review,
    page: page >= 1 && page <= 2_147_483_647 ? page : 1,
    error: dateRangeError(params, from, to),
  }
}

function firstValue(value: SearchParams[string]) {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

function dateRangeError(params: SearchParams, from: string, to: string) {
  if (Array.isArray(params.desde) || (from && !isRevenueDate(from)))
    return 'Ingresá una fecha válida en Desde (AAAA-MM-DD).'
  if (Array.isArray(params.hasta) || (to && !isRevenueDate(to)))
    return 'Ingresá una fecha válida en Hasta (AAAA-MM-DD).'
  if (from && to && from > to) return 'Desde debe ser anterior o igual a Hasta.'
  return null
}

export function equipmentRevenueHref(
  { from, to }: DateRange,
  review?: RevenueReviewCategory | null,
  page = 1,
) {
  const params = new URLSearchParams()
  if (from) params.set('desde', from)
  if (to) params.set('hasta', to)
  if (review) params.set('revisar', review)
  if (review && page > 1) params.set('pagina', String(page))
  return params.size
    ? `${EQUIPMENT_REVENUE_PATH}?${params}`
    : EQUIPMENT_REVENUE_PATH
}

export function parseEquipmentRevenue(value: unknown) {
  return equipmentRevenueSchema.parse(value)
}

export async function readEquipmentRevenue(
  client: SupabaseClient<Database>,
  { from, to, review, page }: EquipmentRevenueQuery,
): Promise<EquipmentRevenue> {
  const { data, error } = await client.rpc('read_equipment_revenue', {
    p_from: from || undefined,
    p_to: to || undefined,
    p_review: review ?? undefined,
    p_page: page,
  })
  if (error)
    throw new Error('No se pudo consultar la facturación por grúa', {
      cause: error,
    })
  return parseEquipmentRevenue(data)
}
