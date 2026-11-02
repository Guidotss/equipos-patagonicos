import { AuthApiError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { getStatusSession, requireAdmin, requireCraneOperator, requireStaff, requireUser } from './auth'
import { ROLES, type Role } from './auth/roles'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`Redirección: ${path}`) }),
}))

const userId = '11111111-1111-4111-8111-111111111111'
const email = 'usuario@example.test'

function mockSession(role: Role = 'crane_operator', active = true) {
  const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: userId, email } }, error: null })
  const maybeSingle = vi.fn().mockResolvedValue({ data: { nombre: 'Usuario', rol: role, activo: active }, error: null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  vi.mocked(createClient).mockResolvedValue({ auth: { getClaims }, from } as unknown as Awaited<ReturnType<typeof createClient>>)
  return { getClaims, maybeSingle, eq, select, from }
}

beforeEach(() => vi.clearAllMocks())

describe('sesión y guardas de roles', () => {
  it('lee el rol activo del perfil aunque los metadatos declaren otro rol', async () => {
    const session = mockSession()
    session.getClaims.mockResolvedValue({
      data: { claims: { sub: userId, email, user_metadata: { rol: 'admin', active: true } } }, error: null,
    })
    await expect(getStatusSession()).resolves.toEqual({
      estado: 'activo', user: { id: userId, email, nombre: 'Usuario', rol: 'crane_operator' },
    })
    expect(session.from).toHaveBeenCalledWith('profiles')
    expect(session.eq).toHaveBeenCalledWith('id', userId)
  })

  it('conserva las redirecciones para sesiones anónimas e inactivas', async () => {
    const session = mockSession()
    session.getClaims.mockResolvedValue({ data: null, error: null })
    await expect(requireUser()).rejects.toThrow('Redirección: /login')
    expect(session.from).not.toHaveBeenCalled()
    mockSession('admin', false)
    await expect(requireUser()).rejects.toThrow('Redirección: /sin-acceso')
    const missingProfile = mockSession()
    missingProfile.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(requireUser()).rejects.toThrow('Redirección: /sin-acceso')
  })

  it('no confunde errores de infraestructura con un perfil inactivo', async () => {
    const session = mockSession()
    const error = new AuthApiError('Error interno', 503, 'unexpected_failure')
    session.getClaims.mockResolvedValue({ data: null, error })
    await expect(getStatusSession()).rejects.toBe(error)
    const profile = mockSession()
    profile.maybeSingle.mockResolvedValue({ data: null, error: new Error('Falla de lectura') })
    await expect(getStatusSession()).rejects.toThrow('Falla de lectura')
  })

  it.each(ROLES)('requireUser permite el rol activo %s', async (role) => {
    mockSession(role)
    await expect(requireUser()).resolves.toMatchObject({ id: userId, rol: role })
  })

  it.each(ROLES)('requireStaff controla el rol %s', async (role) => {
    mockSession(role)
    if (role === 'crane_operator') await expect(requireStaff()).rejects.toThrow('Redirección: /operator')
    else await expect(requireStaff()).resolves.toMatchObject({ rol: role })
  })

  it.each(ROLES)('requireAdmin controla el rol %s', async (role) => {
    mockSession(role)
    if (role === 'admin') await expect(requireAdmin()).resolves.toMatchObject({ rol: role })
    else await expect(requireAdmin()).rejects.toThrow(`Redirección: ${role === 'crane_operator' ? '/operator' : '/'}`)
  })

  it.each(ROLES)('requireCraneOperator controla el rol %s', async (role) => {
    mockSession(role)
    if (role === 'crane_operator') await expect(requireCraneOperator()).resolves.toMatchObject({ rol: role })
    else await expect(requireCraneOperator()).rejects.toThrow('Redirección: /')
  })
})
