import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { CraneOperatorError } from './errors'
import { setCraneOperatorAccess } from './management-service'

const userId = '11111111-1111-4111-8111-111111111111'

function sessionClient(fetch: typeof globalThis.fetch) {
  return createClient<Database>('https://supabase.example.test', 'clave-publicable-ficticia', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch, headers: { Authorization: 'Bearer sesion-ficticia-del-personal' } },
  })
}

describe('modificación del acceso de gruistas', () => {
  it.each([true, false])('envía solo el estado con la sesión actual (%s)', async (active) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init)
      expect(request.url).toBe('https://supabase.example.test/rest/v1/rpc/set_crane_operator_access')
      expect(request.headers.get('authorization')).toBe('Bearer sesion-ficticia-del-personal')
      expect(await request.json()).toEqual({ p_user_id: userId, p_active: active })
      return new Response(null, { status: 204 })
    })
    await setCraneOperatorAccess(sessionClient(fetch), { userId, active })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('no permite introducir un rol', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    await expect(setCraneOperatorAccess(sessionClient(fetch), { userId, active: true, role: 'admin' } as never)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('distingue errores de negocio de errores desconocidos', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      code: '22023', message: 'El usuario no existe o no es un gruista',
    }, { status: 400 }))
    await expect(setCraneOperatorAccess(sessionClient(fetch), { userId, active: false }))
      .rejects.toBeInstanceOf(CraneOperatorError)
    fetch.mockResolvedValue(Response.json({ code: '42501', message: 'permission denied secret_table' }, { status: 403 }))
    await expect(setCraneOperatorAccess(sessionClient(fetch), { userId, active: false }))
      .rejects.not.toBeInstanceOf(CraneOperatorError)
  })
})
