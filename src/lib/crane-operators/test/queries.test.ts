import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import {
  getLiveDeliveryNoteBudgetId,
  listCraneDeliveryNotes,
} from '.././queries'

const budgetId = '11111111-1111-4111-8111-111111111111'
afterEach(() => vi.restoreAllMocks())

describe('destino comercial de un remito histórico', () => {
  it.each([true, false])(
    'consulta solo la existencia con la sesión actual (disponible: %s)',
    async (available) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
        const request = new Request(input, init)
        const url = new URL(request.url)
        expect(request.headers.get('authorization')).toBe(
          'Bearer sesion-ficticia-del-personal',
        )
        expect(url.pathname).toBe('/rest/v1/v_presupuestos')
        expect(url.searchParams.get('select')).toBe('id')
        expect(url.searchParams.get('id')).toBe(`eq.${budgetId}`)
        return Response.json(available ? [{ id: budgetId }] : [])
      })
      const client = createClient<Database>(
        'https://supabase.example.test',
        'clave-publicable-ficticia',
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: {
            fetch,
            headers: { Authorization: 'Bearer sesion-ficticia-del-personal' },
          },
        },
      )
      expect(await getLiveDeliveryNoteBudgetId(client, budgetId)).toBe(
        available ? budgetId : null,
      )
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )
})

describe('orden de la actividad de remitos', () => {
  it.each([
    [undefined, 'service_date.desc,created_at.desc,id.desc'],
    ['submission', 'created_at.desc,id.desc'],
  ] as const)(
    'consulta el orden %s sin cambiar el filtro por autor',
    async (order, expectedOrder) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
        const request = new Request(input, init)
        const url = new URL(request.url)
        expect(url.origin).toBe('https://supabase.example.test')
        expect(url.pathname).toBe('/rest/v1/crane_delivery_notes')
        expect(url.searchParams.get('operator_id')).toBe(`eq.${budgetId}`)
        expect(url.searchParams.get('order')).toBe(expectedOrder)
        expect(request.headers.get('authorization')).toBe(
          'Bearer sesion-ficticia-del-personal',
        )
        return Response.json([], { headers: { 'content-range': '*/0' } })
      })
      const client = createClient<Database>(
        'https://supabase.example.test',
        'clave-publicable-ficticia',
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: {
            fetch,
            headers: { Authorization: 'Bearer sesion-ficticia-del-personal' },
          },
        },
      )
      await listCraneDeliveryNotes(client, {
        operatorId: budgetId,
        ...(order ? { order } : {}),
      })
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )
})
