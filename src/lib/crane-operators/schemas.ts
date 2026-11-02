import { z } from 'zod'
import { ROLES } from '@/lib/auth/roles'
import { isDate } from '@/lib/format/dates'

export const CRANE_DELIVERY_NOTE_STATUSES = ['pending', 'linked'] as const
export const CRANE_UPLOAD_MIMES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const CRANE_UPLOAD_MAX_SIZE = 10 * 1024 * 1024
export const craneDeliveryNoteStatusSchema = z.enum(CRANE_DELIVERY_NOTE_STATUSES, { error: 'Elegí un estado válido' })

const uuidSchema = z.uuid({ error: 'El identificador no es válido' })
const roleSchema = z.enum(ROLES, { error: 'Elegí un rol válido' })
const textSchema = (max: number) => z.string({ error: 'Ingresá un texto válido' }).trim().max(max, `Máximo ${max} caracteres`)
  .refine((value) => !value.includes('\u0000'), 'El texto contiene un carácter no permitido')
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const uploadPathPattern = new RegExp(`^documentos/crane-operators/${uuidPattern}/${uuidPattern}\\.(pdf|jpg|png)$`)

export const craneDeliveryNoteFileSchema = z.strictObject({
  path: z.string({ error: 'La ruta del archivo no es válida' }).regex(uploadPathPattern, 'La ruta del archivo no es válida')
    .refine((value) => !/\s/u.test(value), 'La ruta del archivo no es válida'),
  originalName: textSchema(255).refine((value) => value.length > 0, 'Ingresá el nombre del archivo'),
}, { error: 'El archivo contiene datos no permitidos' })

export const craneDeliveryNoteDataSchema = z.strictObject({
  budgetId: uuidSchema.nullable(),
  number: textSchema(100),
  serviceDate: z.string({ error: 'Ingresá una fecha válida' }).refine(isDate, 'Ingresá una fecha válida'),
  customerName: textSchema(2000),
  workDescription: textSchema(2000).refine((value) => value.length > 0, 'Ingresá el trabajo realizado'),
  notes: textSchema(2000),
}, { error: 'El remito contiene campos no permitidos' }).superRefine((data, context) => {
  if (data.budgetId === null && data.customerName === '') {
    context.addIssue({ code: 'custom', path: ['customerName'], message: 'Ingresá el cliente' })
  }
})

export const craneDeliveryNoteSubmissionSchema = z.strictObject({
  id: uuidSchema,
  data: craneDeliveryNoteDataSchema,
  files: z.array(craneDeliveryNoteFileSchema, { error: 'Subí entre 1 y 50 archivos' })
    .min(1, 'Subí al menos un archivo').max(50, 'Subí hasta 50 archivos'),
}, { error: 'El envío contiene campos no permitidos' }).superRefine(({ files }, context) => {
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    context.addIssue({ code: 'custom', path: ['files'], message: 'Un archivo aparece dos veces' })
  }
})

export const craneDeliveryNoteUploadSchema = z.strictObject({
  mime: z.enum(CRANE_UPLOAD_MIMES, { error: 'Solo se aceptan PDF, JPG o PNG' }),
  size: z.number({ error: 'El tamaño no es válido' }).int('El tamaño no es válido').min(1, 'El archivo está vacío')
    .max(CRANE_UPLOAD_MAX_SIZE, 'El archivo supera los 10 MB'),
}, { error: 'La carga contiene datos no permitidos' })

export const craneOperatorContextSchema = z.strictObject({
  equipment: z.strictObject({ id: uuidSchema, name: z.string(), active: z.boolean() }).nullable(),
  jobs: z.array(z.strictObject({
    id: uuidSchema,
    number: z.number().int(),
    customerName: z.string(),
    subject: z.string(),
    location: z.string(),
  })),
})

export const paginationSchema = z.strictObject({
  page: z.number({ error: 'La página no es válida' }).int('La página no es válida')
    .min(1, 'La página no es válida').max(10_000, 'La página no es válida').default(1),
  pageSize: z.number({ error: 'El tamaño de página no es válido' }).int('El tamaño de página no es válido')
    .min(1, 'El tamaño de página no es válido').max(100, 'El tamaño de página no es válido').default(25),
}, { error: 'Los filtros contienen datos no permitidos' })

export const craneDeliveryNoteFiltersSchema = paginationSchema.extend({
  operatorId: uuidSchema.optional(),
  status: craneDeliveryNoteStatusSchema.optional(),
})

export const linkCraneDeliveryNoteSchema = z.strictObject({ noteId: uuidSchema, budgetId: uuidSchema }, {
  error: 'El vínculo contiene datos no permitidos',
})

export const setUserAccessSchema = z.strictObject({
  userId: uuidSchema,
  role: roleSchema,
  active: z.boolean({ error: 'Indicá si el usuario está activo' }),
  equipmentId: uuidSchema.nullable(),
}, { error: 'El acceso contiene datos no permitidos' }).superRefine((input, context) => {
  if (input.role === 'crane_operator' && input.active && input.equipmentId === null) {
    context.addIssue({ code: 'custom', path: ['equipmentId'], message: 'Asigná una grúa activa para habilitar al gruista' })
  }
  if (input.role !== 'crane_operator' && input.equipmentId !== null) {
    context.addIssue({ code: 'custom', path: ['equipmentId'], message: 'Solo un gruista puede tener una grúa asignada' })
  }
})

export const userAccessSchema = z.strictObject({
  userId: uuidSchema,
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  active: z.boolean(),
  equipmentId: uuidSchema.nullable(),
  equipmentName: z.string().nullable(),
})

export type CraneDeliveryNoteStatus = (typeof CRANE_DELIVERY_NOTE_STATUSES)[number]
export type CraneDeliveryNoteSubmissionInput = z.input<typeof craneDeliveryNoteSubmissionSchema>
export type CraneDeliveryNoteUploadInput = z.input<typeof craneDeliveryNoteUploadSchema>
export type CraneOperatorContext = z.output<typeof craneOperatorContextSchema>
export type CraneDeliveryNoteFilters = z.input<typeof craneDeliveryNoteFiltersSchema>
export type PaginationInput = z.input<typeof paginationSchema>
export type LinkCraneDeliveryNoteInput = z.input<typeof linkCraneDeliveryNoteSchema>
export type SetUserAccessInput = z.input<typeof setUserAccessSchema>
export type UserAccess = z.output<typeof userAccessSchema>
