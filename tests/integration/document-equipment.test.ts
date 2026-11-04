import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { contextoDocument } from '@/lib/documents/queries'
import { AMBIGUOUS_EQUIPMENT_MESSAGE } from '@/lib/documents/equipment'
import { createCraneFixture, type TestUser } from './crane-operator-helpers'
import { limpiarFilesSubidos, uploadFile } from './documents-helpers'

const fixture = createCraneFixture()
let staff: TestUser
let worker: TestUser
let equipmentId: string
let otherEquipmentId: string
let budgetId: string
let sameEquipmentBudgetId: string
let otherBudgetId: string
let emptyBudgetId: string
let otherEmptyBudgetId: string
let clientId: string

beforeAll(async () => {
  staff = await fixture.user('operador')
  worker = await fixture.user()
  equipmentId = await fixture.equipment(false)
  otherEquipmentId = await fixture.equipment()
  budgetId = await fixture.budget(equipmentId)
  sameEquipmentBudgetId = await fixture.budget(equipmentId)
  otherBudgetId = await fixture.budget(otherEquipmentId)
  emptyBudgetId = await fixture.budget(null)
  otherEmptyBudgetId = await fixture.budget(null)
  const result = await staff.client.from('cotizaciones').select('cliente_id').eq('id', budgetId).single()
  if (result.error) throw result.error
  clientId = result.data.cliente_id
})
afterAll(async () => {
  await limpiarFilesSubidos()
  await fixture.cleanup()
})

async function register(budgets: string[], equipment: string | null = otherEquipmentId, type = 'remito') {
  return staff.client.rpc('registrar_documento', {
    p_datos: { cliente_id: clientId, tipo: type, equipo_id: equipment, notas: 'Prueba de equipo derivado' },
    p_presupuestos: budgets,
    p_archivos: [await uploadFile(staff.client, clientId)],
  })
}

async function readEquipment(id: string) {
  const result = await staff.client.from('documentos').select('tipo, equipo_id').eq('id', id).single()
  if (result.error) throw result.error
  return result.data
}

function edit(id: string, budgets: string[], equipment: string | null = otherEquipmentId, type = 'remito') {
  return staff.client.rpc('actualizar_documento_con_archivos', {
    p_id: id,
    p_datos: { tipo: type, equipo_id: equipment, notas: 'Equipo conservado' },
    p_presupuestos: budgets,
    p_remitos: [], p_aplicaciones: [], p_archivos: [], p_quitar: [],
  })
}

describe('equipo autoritativo de remitos administrativos', () => {
  it.each(['other', 'malformed', 'missing', 'null'])('hereda el equipo inactivo e ignora el equipo enviado (%s)', async (kind) => {
    const sent = kind === 'other' ? otherEquipmentId : kind === 'malformed' ? 'equipo-inventado' : kind === 'missing' ? crypto.randomUUID() : null
    const result = await register([budgetId], sent)
    expect(result.error).toBeNull()
    expect(await readEquipment(result.data!)).toEqual({ tipo: 'remito', equipo_id: equipmentId })
    const context = await contextoDocument(staff.client, clientId)
    expect(context.budgets.find((budget) => budget.id === budgetId)?.equipmentId).toBe(equipmentId)
    expect(context.equipos.some((equipment) => equipment.id === equipmentId)).toBe(true)
  })

  it('admite varios presupuestos del mismo equipo y todos sin equipo', async () => {
    const same = await register([budgetId, sameEquipmentBudgetId])
    expect(same.error).toBeNull()
    expect((await readEquipment(same.data!)).equipo_id).toBe(equipmentId)
    const empty = await register([emptyBudgetId, otherEmptyBudgetId])
    expect(empty.error).toBeNull()
    expect((await readEquipment(empty.data!)).equipo_id).toBeNull()
  })

  it.each(['different', 'empty'])('rechaza equipos ambiguos (%s) sin crear documento ni vínculo de archivo', async (kind) => {
    const file = await uploadFile(staff.client, clientId)
    const result = await staff.client.rpc('registrar_documento', {
      p_datos: { cliente_id: clientId, tipo: 'remito', equipo_id: equipmentId },
      p_presupuestos: [budgetId, kind === 'different' ? otherBudgetId : emptyBudgetId], p_archivos: [file],
    })
    expect(result.error).toMatchObject({ code: 'P0001', message: AMBIGUOUS_EQUIPMENT_MESSAGE })
    expect((await staff.client.from('documento_archivos').select('id').eq('path', file.path)).data).toEqual([])
  })

  it.each(['assigned', 'empty'])('conserva el equipo histórico (%s) aunque cambien los presupuestos y el equipo enviado', async (kind) => {
    const result = await register([kind === 'assigned' ? budgetId : emptyBudgetId])
    expect(result.error).toBeNull()
    expect((await edit(result.data!, [otherBudgetId, emptyBudgetId], 'equipo-inventado')).error).toBeNull()
    expect((await readEquipment(result.data!)).equipo_id).toBe(kind === 'assigned' ? equipmentId : null)
  })

  it('deriva al convertir a remito y limpia al convertir desde remito', async () => {
    const result = await register([budgetId], null, 'orden_compra')
    expect(result.error).toBeNull()
    expect((await edit(result.data!, [budgetId])).error).toBeNull()
    expect(await readEquipment(result.data!)).toEqual({ tipo: 'remito', equipo_id: equipmentId })
    expect((await edit(result.data!, [budgetId], otherEquipmentId, 'orden_compra')).error).toBeNull()
    expect(await readEquipment(result.data!)).toEqual({ tipo: 'orden_compra', equipo_id: null })
  })

  it('deriva de los vínculos existentes si la conversión no reemplaza presupuestos y rechaza mezclas', async () => {
    const result = await register([budgetId], null, 'orden_compra')
    expect(result.error).toBeNull()
    // El RPC simple permite omitir los vínculos sin modificar los que existen.
    const converted = await staff.client.rpc('actualizar_documento', {
      p_id: result.data!, p_datos: { tipo: 'remito', equipo_id: otherEquipmentId },
    })
    expect(converted.error).toBeNull()
    expect((await readEquipment(result.data!)).equipo_id).toBe(equipmentId)
    const mixed = await register([budgetId, emptyBudgetId], null, 'orden_compra')
    expect(mixed.error).toBeNull()
    const rejected = await staff.client.rpc('actualizar_documento', { p_id: mixed.data!, p_datos: { tipo: 'remito' } })
    expect(rejected.error?.message).toBe(AMBIGUOUS_EQUIPMENT_MESSAGE)
    expect(await readEquipment(mixed.data!)).toEqual({ tipo: 'orden_compra', equipo_id: null })
  })

  it('mantiene el acceso exclusivo del personal a los RPC administrativos', async () => {
    const registered = await register([budgetId])
    expect(registered.error).toBeNull()
    expect((await worker.client.rpc('actualizar_documento', {
      p_id: registered.data!, p_datos: { tipo: 'remito' },
    })).error).not.toBeNull()
    expect((await worker.client.rpc('registrar_documento', {
      p_datos: { tipo: 'remito', cliente_id: clientId }, p_presupuestos: [budgetId], p_archivos: [],
    })).error).not.toBeNull()
    expect((await readEquipment(registered.data!)).equipo_id).toBe(equipmentId)
  })
})
