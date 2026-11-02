import type { CraneOperatorFilters } from './management-schemas'

export type ManagementSearchParams = Record<string, string | string[] | undefined>

export function readManagementPage(value: string | string[] | undefined): number {
  return typeof value === 'string' && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1
}

export function readManagementFilters(params: ManagementSearchParams): CraneOperatorFilters {
  return {
    q: typeof params.q === 'string' ? params.q.trim().slice(0, 200) : '',
    active: params.active === 'active' || params.active === 'inactive' ? params.active : 'all',
    page: readManagementPage(params.page),
  }
}

export function craneOperatorsHref(filters: CraneOperatorFilters, page = 1): string {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.active && filters.active !== 'all') params.set('active', filters.active)
  if (page > 1) params.set('page', String(page))
  return `/crane-operators${params.size ? `?${params}` : ''}`
}
