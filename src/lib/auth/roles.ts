export const ROLES = ['admin', 'operador', 'crane_operator'] as const
export type Role = (typeof ROLES)[number]
export type StaffRole = Exclude<Role, 'crane_operator'>

export const ROLE_LABELS = {
  admin: 'Administrador',
  operador: 'Administración',
  crane_operator: 'Gruista',
} as const satisfies Record<Role, string>

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function isStaffRole(value: unknown): value is StaffRole {
  return value === 'admin' || value === 'operador'
}

export function homeForRole(role: Role): '/' | '/operator' {
  return role === 'crane_operator' ? '/operator' : '/'
}
