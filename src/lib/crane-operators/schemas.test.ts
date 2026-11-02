import { describe, expect, it } from 'vitest'
import {
  craneDeliveryNoteFiltersSchema,
  craneDeliveryNoteSubmissionSchema,
  craneDeliveryNoteUploadSchema,
  craneOperatorContextSchema,
  linkCraneDeliveryNoteSchema,
  setUserAccessSchema,
} from './schemas'

const userId = '11111111-1111-4111-8111-111111111111'
const noteId = '22222222-2222-4222-8222-222222222222'
const budgetId = '33333333-3333-4333-8333-333333333333'
const uploadId = '44444444-4444-4444-8444-444444444444'
const path = `documentos/crane-operators/${userId}/${uploadId}.pdf`
const submission = () => ({
  id: noteId,
  data: {
    budgetId: null as string | null,
    number: '  R-123  ',
    serviceDate: '2004-02-29',
    customerName: '  Cliente informado  ',
    workDescription: '  Izaje de materiales  ',
    notes: '  Observación  ',
  },
  files: [{ path, originalName: '  Remito firmado.pdf  ' }],
})

describe('contrato de remitos de gruistas', () => {
  it('normaliza textos y permite fechas históricas reales', () => {
    const parsed = craneDeliveryNoteSubmissionSchema.parse(submission())
    expect(parsed.data).toEqual({
      budgetId: null, number: 'R-123', serviceDate: '2004-02-29',
      customerName: 'Cliente informado', workDescription: 'Izaje de materiales', notes: 'Observación',
    })
    expect(parsed.files[0].originalName).toBe('Remito firmado.pdf')
  })

  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '0000-01-01', '0050-01-01', '29/02/2004', '2004-2-29', '2004-02-29T00:00:00Z', ''])('rechaza la fecha %s', (serviceDate) => {
    const input = submission()
    input.data.serviceDate = serviceDate
    expect(craneDeliveryNoteSubmissionSchema.safeParse(input).success).toBe(false)
  })

  it('requiere cliente sin presupuesto y trabajo en todos los casos', () => {
    const input = submission()
    input.data.customerName = '  '
    expect(craneDeliveryNoteSubmissionSchema.safeParse(input).success).toBe(false)
    input.data.budgetId = budgetId
    expect(craneDeliveryNoteSubmissionSchema.safeParse(input).success).toBe(true)
    input.data.workDescription = '  '
    expect(craneDeliveryNoteSubmissionSchema.safeParse(input).success).toBe(false)
  })

  it.each([['number', 100], ['customerName', 2000], ['workDescription', 2000], ['notes', 2000]] as const)('respeta el límite de %s', (field, limit) => {
    const input = submission()
    input.data[field] = 'a'.repeat(limit)
    expect(craneDeliveryNoteSubmissionSchema.safeParse(input).success).toBe(true)
    input.data[field] += 'a'
    expect(craneDeliveryNoteSubmissionSchema.safeParse(input).success).toBe(false)
  })

  it.each(['operatorId', 'operator_id', 'equipmentId', 'equipment_id', 'created_by', 'amount', 'monto', 'price', 'status', 'documentId'])('rechaza la inyección del campo %s', (field) => {
    const input = submission()
    expect(craneDeliveryNoteSubmissionSchema.safeParse({ ...input, [field]: userId }).success).toBe(false)
    expect(craneDeliveryNoteSubmissionSchema.safeParse({ ...input, data: { ...input.data, [field]: userId } }).success).toBe(false)
    expect(craneDeliveryNoteSubmissionSchema.safeParse({ ...input, files: [{ ...input.files[0], [field]: userId }] }).success).toBe(false)
  })

  it('exige identificadores UUID y el contrato de archivo nuevo', () => {
    const input = submission()
    expect(craneDeliveryNoteSubmissionSchema.safeParse({ ...input, id: 'otro' }).success).toBe(false)
    expect(craneDeliveryNoteSubmissionSchema.safeParse({ ...input, data: { ...input.data, budgetId: '' } }).success).toBe(false)
    expect(craneDeliveryNoteSubmissionSchema.safeParse({ ...input, files: [{ path, nombre_original: 'Remito.pdf' }] }).success).toBe(false)
    for (const invalidPath of ['', '../otro.pdf', 'documentos/otro.pdf', path.replace('.pdf', '.exe')]) {
      expect(craneDeliveryNoteSubmissionSchema.safeParse({ ...input, files: [{ path: invalidPath, originalName: 'Remito.pdf' }] }).success).toBe(false)
    }
  })

  it('acepta de 1 a 50 archivos distintos y nombres de hasta 255 caracteres', () => {
    const input = submission()
    expect(craneDeliveryNoteSubmissionSchema.safeParse({ ...input, files: [] }).success).toBe(false)
    const files = Array.from({ length: 50 }, (_, index) => ({
      path: `documentos/crane-operators/${userId}/${String(index).padStart(8, '0')}-4444-4444-8444-444444444444.png`,
      originalName: 'a'.repeat(255),
    }))
    expect(craneDeliveryNoteSubmissionSchema.safeParse({ ...input, files }).success).toBe(true)
    expect(craneDeliveryNoteSubmissionSchema.safeParse({ ...input, files: [...files, { ...files[0], path }] }).success).toBe(false)
    expect(craneDeliveryNoteSubmissionSchema.safeParse({ ...input, files: [files[0], files[0]] }).success).toBe(false)
    for (const originalName of [' ', 'a'.repeat(256)]) {
      expect(craneDeliveryNoteSubmissionSchema.safeParse({ ...input, files: [{ path, originalName }] }).success).toBe(false)
    }
  })
})

describe('contexto y operaciones de acceso', () => {
  it('valida el número real del presupuesto como número, sin datos comerciales extra', () => {
    const context = {
      equipment: { id: userId, name: 'Grúa 1', active: true },
      jobs: [{ id: budgetId, number: 112989, customerName: 'Cliente', subject: 'Izaje', location: 'Neuquén' }],
    }
    expect(craneOperatorContextSchema.parse(context)).toEqual(context)
    expect(craneOperatorContextSchema.parse({ equipment: null, jobs: [] })).toEqual({ equipment: null, jobs: [] })
    expect(craneOperatorContextSchema.safeParse({ ...context, jobs: [{ ...context.jobs[0], number: '112989' }] }).success).toBe(false)
    expect(craneOperatorContextSchema.safeParse({ ...context, jobs: [{ ...context.jobs[0], amount: 100 }] }).success).toBe(false)
  })

  it('solo reserva PDF, JPG o PNG de 1 byte a 10 MiB', () => {
    for (const mime of ['application/pdf', 'image/jpeg', 'image/png']) {
      expect(craneDeliveryNoteUploadSchema.safeParse({ mime, size: 1 }).success).toBe(true)
      expect(craneDeliveryNoteUploadSchema.safeParse({ mime, size: 10 * 1024 * 1024 }).success).toBe(true)
    }
    for (const size of [0, -1, 1.5, 10 * 1024 * 1024 + 1, NaN, Infinity, '10']) {
      expect(craneDeliveryNoteUploadSchema.safeParse({ mime: 'application/pdf', size }).success).toBe(false)
    }
    expect(craneDeliveryNoteUploadSchema.safeParse({ mime: 'image/svg+xml', size: 1 }).success).toBe(false)
    expect(craneDeliveryNoteUploadSchema.safeParse({ mime: 'application/pdf', size: 1, equipmentId: userId }).success).toBe(false)
  })

  it('valida paginación, estado y propietario sin interpolar filtros libres', () => {
    expect(craneDeliveryNoteFiltersSchema.parse({})).toEqual({ page: 1, pageSize: 25 })
    expect(craneDeliveryNoteFiltersSchema.safeParse({ status: 'pending', operatorId: userId, page: 2, pageSize: 100 }).success).toBe(true)
    expect(craneDeliveryNoteFiltersSchema.safeParse({ order: 'submission' }).success).toBe(true)
    for (const filter of [{ order: 'created_at' }, { status: 'pending,linked' }, { operatorId: 'otro' }, { page: 0 }, { page: 1.5 }, { page: '2' }, { pageSize: 101 }, { raw: 'or=true' }]) {
      expect(craneDeliveryNoteFiltersSchema.safeParse(filter).success).toBe(false)
    }
  })

  it('exige una grúa al activar un gruista y prohíbe asignarla a otro rol', () => {
    const input = { userId, role: 'crane_operator', active: true, equipmentId: budgetId }
    expect(setUserAccessSchema.safeParse(input).success).toBe(true)
    expect(setUserAccessSchema.safeParse({ ...input, equipmentId: null }).success).toBe(false)
    expect(setUserAccessSchema.safeParse({ ...input, active: false, equipmentId: null }).success).toBe(true)
    for (const role of ['admin', 'operador']) {
      expect(setUserAccessSchema.safeParse({ ...input, role }).success).toBe(false)
      expect(setUserAccessSchema.safeParse({ ...input, role, equipmentId: null }).success).toBe(true)
    }
    expect(setUserAccessSchema.safeParse({ ...input, role: 'operator' }).success).toBe(false)
    expect(setUserAccessSchema.safeParse({ ...input, userId: 'otro' }).success).toBe(false)
    expect(setUserAccessSchema.safeParse({ ...input, equipmentId: 'otro' }).success).toBe(false)
    expect(setUserAccessSchema.safeParse({ ...input, active: 'true' }).success).toBe(false)
    expect(setUserAccessSchema.safeParse({ ...input, assignedBy: userId }).success).toBe(false)
  })

  it('solo permite identificar el remito y el presupuesto al vincular', () => {
    expect(linkCraneDeliveryNoteSchema.safeParse({ noteId, budgetId }).success).toBe(true)
    expect(linkCraneDeliveryNoteSchema.safeParse({ noteId: 'otro', budgetId }).success).toBe(false)
    expect(linkCraneDeliveryNoteSchema.safeParse({ noteId, budgetId, customerId: userId }).success).toBe(false)
  })
})
