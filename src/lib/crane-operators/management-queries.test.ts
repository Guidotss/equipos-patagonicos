import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { getManagedCraneOperator, listCraneOperators } from './management-queries'

const origin = 'https://supabase.example.test'
const userId = '11111111-1111-4111-8111-111111111111'
const equipmentId = '22222222-2222-4222-8222-222222222222'
const row = {
  user_id: userId, name: 'Juan Pérez', email: 'juan@example.test', active: false,
  equipment_id: null, equipment_name: null, equipment_active: null,
  note_count: 0, pending_note_count: 0, last_submission_at: null,
}

function sessionClient(fetch: typeof globalThis.fetch) {
  return createClient<Database>(origin, 'clave-publicable-ficticia', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch, headers: { Authorization: 'Bearer sesion-ficticia-del-personal' } },
  })
}

function readRequest(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input, init)
  const url = new URL(request.url)
  expect(url.origin).toBe(origin)
  expect(url.pathname).toBe('/rest/v1/rpc/list_crane_operators')
  expect(request.method).toBe('POST')
  expect(request.headers.get('authorization')).toBe('Bearer sesion-ficticia-del-personal')
  return { request, url }
}

describe('directorio limitado a gruistas', () => {
  it('filtra en la RPC antes de contar y pagina con orden estable; admite columnas nulas', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const { request, url } = readRequest(input, init)
      expect(await request.json()).toEqual({ p_search: 'Juan', p_active: false })
      expect(request.headers.get('prefer')).toBe('count=exact')
      expect(url.searchParams.get('order')).toBe('name.asc,user_id.asc')
      expect(url.searchParams.get('offset')).toBe('2')
      expect(url.searchParams.get('limit')).toBe('2')
      return Response.json([row], { headers: { 'content-range': '2-2/3' } })
    })
    const result = await listCraneOperators(sessionClient(fetch), { q: ' Juan ', active: 'inactive', page: 2, pageSize: 2 })
    expect(result).toEqual({
      operators: [{ userId, name: row.name, email: row.email, active: false,
        noteCount: 0, pendingNoteCount: 0, lastSubmissionAt: null }],
      total: 3, page: 2, pageSize: 2,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('conserva las estadísticas históricas aunque la RPC devuelva una asignación anterior', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const { request } = readRequest(input, init)
      expect(await request.json()).toEqual({ p_search: '' })
      return Response.json([{ ...row, equipment_id: equipmentId, equipment_name: 'Grúa anterior', equipment_active: false,
        note_count: 9, pending_note_count: 3, last_submission_at: '2026-11-02T10:00:00Z' }],
      { headers: { 'content-range': '0-0/1' } })
    })
    const result = await listCraneOperators(sessionClient(fetch))
    expect(result.operators[0]).toMatchObject({ noteCount: 9,
      pendingNoteCount: 3, lastSubmissionAt: '2026-11-02T10:00:00Z' })
    expect(result.operators[0]).not.toHaveProperty('equipmentId')
  })

  it.each([0, 3])('normaliza una página fuera de rango y conserva búsqueda/estado (total %s)', async (total) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const { request, url } = readRequest(input, init)
      expect(await request.json()).toEqual({ p_search: 'Juan', p_active: true })
      if (url.searchParams.get('offset') === '38') {
        return Response.json({ code: 'PGRST103', message: 'Requested range not satisfiable' }, { status: 416 })
      }
      expect(url.searchParams.get('offset')).toBe('0')
      return Response.json(total ? [row, row] : [], { headers: { 'content-range': total ? `0-1/${total}` : '*/0' } })
    })
    const result = await listCraneOperators(sessionClient(fetch), { q: 'Juan', active: 'active', page: 20, pageSize: 2 })
    expect(result).toMatchObject({ total, page: 1, pageSize: 2 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('normaliza también las respuestas vacías sin error de rango', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const { url } = readRequest(input, init)
      return Response.json(url.searchParams.get('offset') === '2' ? [row] : [], { headers: { 'content-range': '*/3' } })
    })
    const result = await listCraneOperators(sessionClient(fetch), { page: 9, pageSize: 2 })
    expect(result).toMatchObject({ total: 3, page: 2 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([true, false])('busca la ficha dentro de la misma RPC (disponible %s)', async (available) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const { url } = readRequest(input, init)
      expect(url.searchParams.get('user_id')).toBe(`eq.${userId}`)
      return Response.json(available ? [row] : [])
    })
    const result = await getManagedCraneOperator(sessionClient(fetch), userId)
    expect(result?.userId ?? null).toBe(available ? userId : null)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('no consulta un identificador inválido y conserva los errores inesperados', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ code: 'XX000', message: 'Error interno' }, { status: 500 }))
    await expect(getManagedCraneOperator(sessionClient(fetch), 'otro')).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
    await expect(listCraneOperators(sessionClient(fetch))).rejects.toMatchObject({ code: 'XX000' })
  })
})
