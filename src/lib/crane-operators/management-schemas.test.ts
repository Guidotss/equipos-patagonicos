import { describe, expect, it } from 'vitest'
import {
  craneOperatorFiltersSchema,
  newCraneOperatorSchema,
  setCraneOperatorAccessSchema,
} from './management-schemas'

const userId = '11111111-1111-4111-8111-111111111111'
const equipmentId = '22222222-2222-4222-8222-222222222222'
const account = { name: '  Juan Pérez  ', email: '  Juan@Example.test  ', password: ' clave ', equipmentId }

describe('alta de gruistas', () => {
  it('normaliza nombre y email sin modificar la contraseña', () => {
    expect(newCraneOperatorSchema.parse(account)).toEqual({
      ...account, name: 'Juan Pérez', email: 'juan@example.test',
    })
  })

  it.each(['actorId', 'userId', 'role', 'active', 'user_metadata', 'other'])('rechaza el campo extra %s', (field) => {
    expect(newCraneOperatorSchema.safeParse({ ...account, [field]: userId }).success).toBe(false)
  })

  it('limita nombre, email e identificador de la grúa', () => {
    expect(newCraneOperatorSchema.safeParse({ ...account, name: 'a'.repeat(120) }).success).toBe(true)
    for (const name of ['', '  ', 'a'.repeat(121), 'Juan\u0000']) {
      expect(newCraneOperatorSchema.safeParse({ ...account, name }).success).toBe(false)
    }
    for (const email of ['', 'juan', 'juan@', '@example.test', 'juan@example.test,otro@example.test']) {
      expect(newCraneOperatorSchema.safeParse({ ...account, email }).success).toBe(false)
    }
    for (const equipmentId of ['', 'otra', null]) {
      expect(newCraneOperatorSchema.safeParse({ ...account, equipmentId }).success).toBe(false)
    }
  })

  it('exige seis caracteres sin recortar y limita a 72 bytes UTF-8', () => {
    for (const password of ['123456', '      ', 'a'.repeat(72), 'á'.repeat(36), '🦺'.repeat(18)]) {
      expect(newCraneOperatorSchema.parse({ ...account, password }).password).toBe(password)
    }
    for (const password of ['', '12345', 'a'.repeat(73), 'á'.repeat(36) + 'a', '🦺'.repeat(19)]) {
      expect(newCraneOperatorSchema.safeParse({ ...account, password }).success).toBe(false)
    }
  })
})

describe('acceso exclusivo de gruistas', () => {
  const access = { userId, active: true, equipmentId }

  it('requiere grúa al activar y admite quitarla al desactivar', () => {
    expect(setCraneOperatorAccessSchema.parse(access)).toEqual(access)
    expect(setCraneOperatorAccessSchema.safeParse({ ...access, equipmentId: null }).success).toBe(false)
    expect(setCraneOperatorAccessSchema.parse({ ...access, active: false, equipmentId: null }).active).toBe(false)
  })

  it.each([
    { active: 'false' }, { active: 0 }, { userId: 'otro' }, { equipmentId: 'otra' },
    { role: 'admin' }, { actorId: userId }, { equipmentId: undefined },
  ])('rechaza coerciones y atributos ajenos: %j', (change) => {
    expect(setCraneOperatorAccessSchema.safeParse({ ...access, ...change }).success).toBe(false)
  })
})

describe('filtros del directorio de gruistas', () => {
  it('aplica los valores iniciales y recorta la búsqueda', () => {
    expect(craneOperatorFiltersSchema.parse({})).toEqual({ q: '', active: 'all', page: 1, pageSize: 25 })
    expect(craneOperatorFiltersSchema.parse({ q: '  Juan  ', active: 'inactive', page: 2, pageSize: 100 }))
      .toEqual({ q: 'Juan', active: 'inactive', page: 2, pageSize: 100 })
    expect(craneOperatorFiltersSchema.safeParse({ q: 'a'.repeat(200) }).success).toBe(true)
  })

  it.each([
    { q: 'a'.repeat(201) }, { active: false }, { active: 'false' }, { active: 'other' },
    { page: 0 }, { page: 1.5 }, { page: '2' }, { pageSize: 0 }, { pageSize: 101 }, { role: 'admin' },
  ])('rechaza el filtro inválido %j', (input) => {
    expect(craneOperatorFiltersSchema.safeParse(input).success).toBe(false)
  })
})
