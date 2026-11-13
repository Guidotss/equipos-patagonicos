import { describe, expect, it } from 'vitest'
import {
  homeForRole,
  isRole,
  isStaffRole,
  ROLE_LABELS,
  ROLES,
} from '.././roles'

describe('roles', () => {
  it('conserva el rol de administración e incorpora al gruista', () => {
    expect(ROLES).toEqual(['admin', 'operador', 'crane_operator'])
    expect(ROLE_LABELS).toEqual({
      admin: 'Administrador',
      operador: 'Administración',
      crane_operator: 'Gruista',
    })
    for (const role of ROLES) expect(isRole(role)).toBe(true)
    for (const role of ['operator', 'staff', '', null, undefined, {}])
      expect(isRole(role)).toBe(false)
  })

  it('limita la gestión comercial a administradores y administración', () => {
    expect(isStaffRole('admin')).toBe(true)
    expect(isStaffRole('operador')).toBe(true)
    expect(isStaffRole('crane_operator')).toBe(false)
    expect(isStaffRole('staff')).toBe(false)
  })

  it('define el inicio de cada rol', () => {
    expect(homeForRole('admin')).toBe('/')
    expect(homeForRole('operador')).toBe('/')
    expect(homeForRole('crane_operator')).toBe('/operator')
  })
})
