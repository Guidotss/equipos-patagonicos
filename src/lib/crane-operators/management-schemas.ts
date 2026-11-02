import { z } from 'zod'

const uuidSchema = z.uuid({ error: 'El identificador no es válido' })

export const newCraneOperatorSchema = z.strictObject({
  name: z.string({ error: 'Ingresá un nombre válido' }).trim()
    .min(1, 'Ingresá el nombre').max(120, 'El nombre puede tener hasta 120 caracteres')
    .refine((value) => !value.includes('\u0000'), 'El nombre contiene un carácter no permitido'),
  email: z.string({ error: 'Ingresá un email válido' }).trim().toLowerCase()
    .pipe(z.email({ error: 'Ingresá un email válido' })),
  password: z.string({ error: 'Ingresá una contraseña válida' }).min(6, 'La contraseña debe tener al menos 6 caracteres')
    .refine((value) => new TextEncoder().encode(value).byteLength <= 72, 'La contraseña puede ocupar hasta 72 bytes'),
  equipmentId: uuidSchema,
}, { error: 'El alta contiene campos no permitidos' })

export const setCraneOperatorAccessSchema = z.strictObject({
  userId: uuidSchema,
  active: z.boolean({ error: 'Elegí el estado del gruista' }),
  equipmentId: uuidSchema.nullable(),
}, { error: 'El acceso contiene campos no permitidos' }).superRefine((input, context) => {
  if (input.active && input.equipmentId === null) {
    context.addIssue({ code: 'custom', path: ['equipmentId'], message: 'Asigná una grúa activa para habilitar al gruista' })
  }
})

export const craneOperatorFiltersSchema = z.strictObject({
  q: z.string({ error: 'Ingresá una búsqueda válida' }).trim().max(200, 'La búsqueda puede tener hasta 200 caracteres').default(''),
  active: z.enum(['all', 'active', 'inactive'], { error: 'Elegí un estado válido' }).default('all'),
  page: z.number({ error: 'La página no es válida' }).int('La página no es válida').min(1, 'La página no es válida').default(1),
  pageSize: z.number({ error: 'El tamaño de página no es válido' }).int('El tamaño de página no es válido')
    .min(1, 'El tamaño de página no es válido').max(100, 'El tamaño de página no es válido').default(25),
}, { error: 'Los filtros contienen datos no permitidos' })

export type NewCraneOperatorInput = z.input<typeof newCraneOperatorSchema>
export type SetCraneOperatorAccessInput = z.input<typeof setCraneOperatorAccessSchema>
export type CraneOperatorFilters = z.input<typeof craneOperatorFiltersSchema>
