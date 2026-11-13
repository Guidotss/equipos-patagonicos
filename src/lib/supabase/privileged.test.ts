import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({
  publicEnv: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.test',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'clave-publicable-ficticia',
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('cliente privilegiado del servidor', () => {
  it('permite importar sin clave privada y falla recién al crear el cliente', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', undefined)
    const { createPrivilegedClient } = await import('./privileged')
    expect(() => createPrivilegedClient()).toThrow(
      'La creación de gruistas no está configurada en el servidor',
    )
  })

  it('lee la clave en cada llamada y no hereda una sesión ni almacena credenciales', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const request = new Request(input, init)
        expect(request.url).toBe(
          'https://supabase.example.test/rest/v1/rpc/list_crane_operators',
        )
        expect(request.headers.get('authorization')).toBe(
          `Bearer ${request.headers.get('apikey')}`,
        )
        expect(request.headers.has('cookie')).toBe(false)
        return Response.json([])
      })
    const { createPrivilegedClient } = await import('./privileged')
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_clave_ficticia_1')
    const first = createPrivilegedClient()
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_clave_ficticia_2')
    const second = createPrivilegedClient()
    expect((await first.auth.getSession()).data.session).toBeNull()
    expect((await second.auth.getSession()).data.session).toBeNull()
    await first.rpc('list_crane_operators')
    await second.rpc('list_crane_operators')
    expect(fetch).toHaveBeenCalledTimes(2)
    const requests = fetch.mock.calls.map(
      ([input, init]) => new Request(input, init),
    )
    expect(requests.map((request) => request.headers.get('apikey'))).toEqual([
      'sb_secret_clave_ficticia_1',
      'sb_secret_clave_ficticia_2',
    ])
  })
})
