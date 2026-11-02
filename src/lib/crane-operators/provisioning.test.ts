import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { CraneOperatorProvisioningError, provisionCraneOperator } from './provisioning'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ publicEnv: {
  NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.test',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'clave-publicable-ficticia',
} }))

const origin = 'https://supabase.example.test'
const actorId = '11111111-1111-4111-8111-111111111111'
const equipmentId = '22222222-2222-4222-8222-222222222222'
const newUserId = '33333333-3333-4333-8333-333333333333'
const privateKey = 'sb_secret_clave_ficticia_sin_valor'
const input = { name: ' Juan Pérez ', email: ' Juan@Example.test ', password: ' clave exacta ', equipmentId }

type Scenario = {
  equipmentAvailable?: boolean
  preflightError?: boolean
  authError?: string
  completionError?: { code: string; message: string }
  cleanupError?: boolean
}

function client(fetch: typeof globalThis.fetch, privileged: boolean) {
  return createClient<Database>(origin, privileged ? privateKey : 'clave-publicable-ficticia', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch, headers: { Authorization: `Bearer ${privileged ? privateKey : 'sesion-ficticia-del-personal'}` } },
  })
}

function setup(scenario: Scenario = {}) {
  const requests: { method: string; path: string; body: unknown }[] = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (requestInput, init) => {
    const request = new Request(requestInput, init)
    const url = new URL(request.url)
    expect(url.origin).toBe(origin)
    const body: unknown = request.method === 'GET' ? null : await request.json()
    requests.push({ method: request.method, path: url.pathname, body })
    if (request.method === 'GET' && url.pathname === '/rest/v1/equipos') {
      expect(request.headers.get('authorization')).toBe('Bearer sesion-ficticia-del-personal')
      expect(url.searchParams.get('id')).toBe(`eq.${equipmentId}`)
      expect(url.searchParams.get('activo')).toBe('eq.true')
      if (scenario.preflightError) return Response.json({ code: 'XX000', message: `${privateKey} ${input.password}` }, { status: 500 })
      return Response.json(scenario.equipmentAvailable === false ? [] : [{ id: equipmentId }])
    }
    expect(request.headers.get('authorization')).toBe(`Bearer ${privateKey}`)
    expect(request.headers.has('cookie')).toBe(false)
    if (request.method === 'POST' && url.pathname === '/auth/v1/admin/users') {
      if (scenario.authError) return Response.json({ code: scenario.authError, msg: `${privateKey} ${input.password}` }, {
        status: 422, headers: { 'x-supabase-api-version': '2024-01-01' },
      })
      return Response.json({ id: newUserId, email: 'juan@example.test' })
    }
    if (request.method === 'POST' && url.pathname === '/rest/v1/rpc/complete_crane_operator_signup') {
      if (scenario.completionError) return Response.json(scenario.completionError, { status: 400 })
      return new Response(null, { status: 204 })
    }
    if (request.method === 'DELETE' && url.pathname === `/auth/v1/admin/users/${newUserId}`) {
      if (scenario.cleanupError) return Response.json({ code: 'unexpected_failure', msg: `${privateKey} ${input.password}` }, { status: 500 })
      return Response.json({ id: newUserId })
    }
    throw new Error(`Pedido no previsto: ${request.method} ${url.pathname}`)
  })
  const createPrivilegedClient = vi.fn(() => client(fetch, true))
  const sessionClient = client(fetch, false)
  return { requests, fetch, createPrivilegedClient, options: { sessionClient, actorId, input, createPrivilegedClient } }
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No se permite red real en estas pruebas'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('alta de gruistas desde una sesión autorizada', () => {
  it('comprueba la grúa antes de crear y confirma/finaliza solo el nuevo ID y el actor del servidor', async () => {
    const fixture = setup()
    await expect(provisionCraneOperator(fixture.options)).resolves.toEqual({ userId: newUserId, email: 'juan@example.test' })
    expect(fixture.createPrivilegedClient).toHaveBeenCalledTimes(1)
    expect(fixture.requests).toEqual([
      { method: 'GET', path: '/rest/v1/equipos', body: null },
      { method: 'POST', path: '/auth/v1/admin/users', body: {
        email: 'juan@example.test', password: input.password, email_confirm: true, user_metadata: { nombre: 'Juan Pérez' },
      } },
      { method: 'POST', path: '/rest/v1/rpc/complete_crane_operator_signup', body: {
        p_user_id: newUserId, p_name: 'Juan Pérez', p_equipment_id: equipmentId, p_actor_id: actorId,
      } },
    ])
    expect(fixture.fetch).toHaveBeenCalledTimes(3)
    expect(console.error).not.toHaveBeenCalled()
  })

  it.each(['role', 'actorId', 'userId', 'active'])('rechaza %s antes de consultar o crear', async (field) => {
    const fixture = setup()
    await expect(provisionCraneOperator({ ...fixture.options, input: { ...input, [field]: actorId } })).rejects.toThrow()
    expect(fixture.fetch).not.toHaveBeenCalled()
    expect(fixture.createPrivilegedClient).not.toHaveBeenCalled()
  })

  it('rechaza la grúa inválida sin usar el cliente privilegiado', async () => {
    const fixture = setup()
    await expect(provisionCraneOperator({ ...fixture.options, input: { ...input, equipmentId: 'otra' } })).rejects.toThrow()
    expect(fixture.fetch).not.toHaveBeenCalled()
    expect(fixture.createPrivilegedClient).not.toHaveBeenCalled()
  })

  it('rechaza una grúa inexistente o inactiva con la sesión antes de invocar Auth', async () => {
    const fixture = setup({ equipmentAvailable: false })
    await expect(provisionCraneOperator(fixture.options)).rejects.toThrow('La grúa no existe o está inactiva')
    expect(fixture.fetch).toHaveBeenCalledTimes(1)
    expect(fixture.createPrivilegedClient).not.toHaveBeenCalled()
  })

  it.each(['email_exists', 'user_already_exists'])('no busca, modifica ni elimina una cuenta duplicada (%s)', async (authError) => {
    const fixture = setup({ authError })
    await expect(provisionCraneOperator(fixture.options)).rejects.toThrow('Ya existe una cuenta con ese email')
    expect(fixture.requests.map((request) => request.method)).toEqual(['GET', 'POST'])
  })

  it.each([
    { code: '22023', message: 'La grúa no existe o está inactiva' },
    { code: '42501', message: 'El usuario que solicita el alta no está habilitado' },
  ])('compensa la carrera al finalizar: $message', async (completionError) => {
    const fixture = setup({ completionError })
    await expect(provisionCraneOperator(fixture.options)).rejects.toThrow(completionError.message)
    expect(fixture.requests.at(-1)).toEqual({ method: 'DELETE', path: `/auth/v1/admin/users/${newUserId}`, body: { should_soft_delete: false } })
    expect(fixture.requests).toHaveLength(4)
  })

  it('sanea errores desconocidos de la finalización después de compensar', async () => {
    const fixture = setup({ completionError: { code: 'XX000', message: `${privateKey} ${input.password}` } })
    const error = await provisionCraneOperator(fixture.options).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(CraneOperatorProvisioningError)
    expect(error).toMatchObject({ pendingUserId: null, message: 'No se pudo crear el gruista. Volvé a intentar.' })
    expect(fixture.requests.at(-1)?.method).toBe('DELETE')
  })

  it('informa el ID pendiente si falla la limpieza sin propagar secretos ni registrarlos', async () => {
    const fixture = setup({ completionError: { code: 'XX000', message: `${privateKey} ${input.password}` }, cleanupError: true })
    const error = await provisionCraneOperator(fixture.options).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(CraneOperatorProvisioningError)
    expect(error).toMatchObject({ pendingUserId: newUserId })
    expect((error as Error).message).toContain(newUserId)
    expect(JSON.stringify(error)).not.toContain(privateKey)
    expect(String(error)).not.toContain(input.password)
    for (const logger of [console.error, console.warn, console.log]) expect(logger).not.toHaveBeenCalled()
  })

  it.each(['preflight', 'auth', 'factory'] as const)('sanea fallos inesperados de %s sin borrar cuentas', async (stage) => {
    const fixture = setup({ preflightError: stage === 'preflight', authError: stage === 'auth' ? 'unexpected_failure' : undefined })
    if (stage === 'factory') fixture.createPrivilegedClient.mockImplementation(() => { throw new Error(`${privateKey} ${input.password}`) })
    const error = await provisionCraneOperator(fixture.options).catch((error: unknown) => error)
    expect(error).toMatchObject({ pendingUserId: null, message: 'No se pudo crear el gruista. Volvé a intentar.' })
    expect(String(error)).not.toContain(privateKey)
    expect(String(error)).not.toContain(input.password)
    expect(fixture.requests.some((request) => request.method === 'DELETE')).toBe(false)
    for (const logger of [console.error, console.warn, console.log]) expect(logger).not.toHaveBeenCalled()
  })
})
