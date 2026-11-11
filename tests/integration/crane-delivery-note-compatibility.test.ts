import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getLiveDeliveryNoteBudgetId } from '@/lib/crane-operators/queries'
import type { Database } from '@/lib/supabase/database.types'
import { createCraneFixture, NOTE_DATA, submitNote, type TestUser } from './crane-operator-helpers'
import { sql } from './helpers'

type DocumentRow = Database['public']['Tables']['documentos']['Row']
const fixture = createCraneFixture()
let admin: TestUser
let staff: TestUser
let worker: TestUser
let equipmentId: string
let replacementEquipmentId: string
let budgetId: string

beforeAll(async () => {
  admin = await fixture.user('admin')
  staff = await fixture.user('operador')
  worker = await fixture.user()
  equipmentId = await fixture.equipment()
  replacementEquipmentId = await fixture.equipment()
  expect((await fixture.assign(admin.client, worker.id, equipmentId)).error).toBeNull()
  budgetId = await fixture.budget(equipmentId)
})
afterAll(() => fixture.cleanup())

function editDocument(document: DocumentRow, budgets: string[], changes: Record<string, string> = {}) {
  return staff.client.rpc('actualizar_documento_con_archivos', {
    p_id: document.id, p_presupuestos: budgets, p_remitos: [], p_aplicaciones: [], p_archivos: [], p_quitar: [],
    p_datos: { cliente_id: document.cliente_id, tipo: 'remito', numero: document.numero, fecha: document.fecha,
      equipo_id: document.equipo_id, notas: document.notas, ...changes },
  })
}

async function readDocument(id: string) {
  const result = await staff.client.from('documentos').select('*').eq('id', id).single()
  if (result.error) throw result.error
  return result.data
}

async function deleteImportedBudget(id: string) {
  expect((await staff.client.rpc('revertir_aprobacion', { p_id: id })).error).toBeNull()
  expect((await staff.client.rpc('borrar_cotizacion', { p_id: id })).error).toBeNull()
  expect((await staff.client.from('cotizaciones').select('id').eq('id', id)).data).toEqual([])
}

// Reproduce la forma persistida por el envío anterior, que vinculaba directamente desde obra.
async function recordLegacyBudgetRequest(noteId: string, requestedBudgetId: string) {
  await sql(`update public.crane_delivery_notes set requested_budget_id=$2, linked_by=operator_id,
    submission_data=jsonb_set(submission_data, '{budgetId}', to_jsonb($2::uuid)),
    customer_name=(select cl.razon_social from public.cotizaciones c join public.clientes cl on cl.id=c.cliente_id where c.id=$2)
    where id=$1`, [noteId, requestedBudgetId])
}

describe('compatibilidad de remitos recibidos con el circuito comercial', () => {
  it.each(['X', '🦺'])('edita fecha y presupuesto conservando la grúa real y los campos máximos (%s)', async (character) => {
    const data = { ...NOTE_DATA, number: character.repeat(100), customerName: character.repeat(2000),
      workDescription: character.repeat(2000), notes: character.repeat(1998) + '  ' }
    const file = await fixture.upload(worker.client)
    const submitted = await submitNote(worker.client, [file], data)
    expect(submitted.error).toBeNull()
    const linked = await staff.client.rpc('link_crane_delivery_note', { p_note_id: submitted.data!, p_budget_id: budgetId })
    expect(linked.error).toBeNull()
    const document = await readDocument(linked.data!)
    const fullNotes = `Cliente informado: ${data.customerName}\nTrabajo realizado: ${data.workDescription}\nObservaciones: ${data.notes}`
    expect(document).toMatchObject({ numero: data.number, notas: fullNotes, equipo_id: equipmentId, created_by: worker.id, monto: null })
    const nextBudgetId = await fixture.budget(null, 'finalizado')
    expect((await editDocument(document, [nextBudgetId], { fecha: '2026-02-20', equipo_id: replacementEquipmentId })).error).toBeNull()
    expect(await readDocument(document.id)).toMatchObject({ numero: data.number, notas: fullNotes,
      fecha: '2026-02-20', equipo_id: equipmentId, created_by: worker.id, monto: null })
    expect((await staff.client.from('documento_archivos').select('path').eq('documento_id', document.id)).data).toEqual([{ path: file.path }])
    expect((await staff.client.from('documento_presupuestos').select('cotizacion_id').eq('documento_id', document.id)).data).toEqual([{ cotizacion_id: nextBudgetId }])
  })

  it.each([null, 'different'] as const)('conserva la grúa de obra al vincular y editar con un presupuesto de equipo %s', async (kind) => {
    const targetBudgetId = await fixture.budget(kind === null ? null : replacementEquipmentId)
    const file = await fixture.upload(worker.client)
    const submitted = await submitNote(worker.client, [file])
    expect(submitted.error).toBeNull()
    const linked = await staff.client.rpc('link_crane_delivery_note', { p_note_id: submitted.data!, p_budget_id: targetBudgetId })
    expect(linked.error).toBeNull()
    const document = await readDocument(linked.data!)
    expect(document.equipo_id).toBe(equipmentId)
    expect((await editDocument(document, [targetBudgetId], { equipo_id: '' })).error).toBeNull()
    expect((await readDocument(document.id)).equipo_id).toBe(equipmentId)
  })

  it.each(['X', '🦺'])('aplica los límites SQL exactos de 100 y 6200 al editar un remito (%s)', async (character) => {
    const file = await fixture.upload(worker.client)
    const submitted = await submitNote(worker.client, [file])
    expect(submitted.error).toBeNull()
    const linked = await staff.client.rpc('link_crane_delivery_note', { p_note_id: submitted.data!, p_budget_id: budgetId })
    expect(linked.error).toBeNull()
    const document = await readDocument(linked.data!)
    const changes = { numero: character.repeat(100), notas: character.repeat(6200) }
    expect((await editDocument(document, [budgetId], changes)).error).toBeNull()
    const saved = await readDocument(document.id)
    expect(saved).toMatchObject(changes)
    expect((await editDocument(saved, [budgetId], { numero: character.repeat(101) })).error?.message).toBe('El número puede tener hasta 100 caracteres')
    expect((await editDocument(saved, [budgetId], { notas: character.repeat(6201) })).error?.message).toBe('Las notas pueden tener hasta 6200 caracteres')
    expect(await readDocument(document.id)).toEqual(saved)
  })

  it.each([true, false])('elimina una cotización importada tras anular y conserva el historial e idempotencia (presupuesto solicitado: %s)', async (requested) => {
    const importedBudgetId = await fixture.importedBudget(staff.client, equipmentId)
    const file = await fixture.upload(worker.client)
    const data = { ...NOTE_DATA, budgetId: requested ? importedBudgetId : null }
    const submitted = await submitNote(worker.client, [file])
    expect(submitted.error).toBeNull()
    expect(await getLiveDeliveryNoteBudgetId(staff.client, importedBudgetId)).toBe(importedBudgetId)
    const linked = await staff.client.rpc('link_crane_delivery_note', { p_note_id: submitted.data!, p_budget_id: importedBudgetId })
    expect(linked.error).toBeNull()
    if (requested) await recordLegacyBudgetRequest(submitted.data!, importedBudgetId)
    const before = await worker.client.from('crane_delivery_notes').select('*').eq('id', submitted.data!).single()
    const filesBefore = await worker.client.from('crane_delivery_note_files').select('*').eq('note_id', submitted.data!)
    expect((await staff.client.rpc('anular_documento', { p_id: linked.data! })).error).toBeNull()
    await deleteImportedBudget(importedBudgetId)
    expect(await getLiveDeliveryNoteBudgetId(staff.client, importedBudgetId)).toBeNull()
    const repeated = await staff.client.rpc('link_crane_delivery_note', { p_note_id: submitted.data!, p_budget_id: importedBudgetId })
    expect(repeated.error).toBeNull()
    expect(repeated.data).toBe(linked.data)
    expect((await staff.client.rpc('link_crane_delivery_note', { p_note_id: submitted.data!, p_budget_id: budgetId })).error?.code).toBe('23505')
    expect((await submitNote(worker.client, [file], data, submitted.data!)).data).toBe(submitted.data)
    expect((await worker.client.from('crane_delivery_notes').select('*').eq('id', submitted.data!).single()).data).toEqual(before.data)
    expect((await worker.client.from('crane_delivery_note_files').select('*').eq('note_id', submitted.data!)).data).toEqual(filesBefore.data)
    expect(before.data).toMatchObject({ status: 'linked', requested_budget_id: requested ? importedBudgetId : null,
      linked_budget_id: importedBudgetId, operator_id: worker.id, equipment_id: equipmentId })
    expect((await worker.client.storage.from('documentos').download(file.path)).error).toBeNull()
  })

  it('elimina el presupuesto original cuando el personal trasladó los vínculos del documento a otro aprobado', async () => {
    const importedBudgetId = await fixture.importedBudget(staff.client, equipmentId)
    const file = await fixture.upload(worker.client)
    const data = { ...NOTE_DATA, budgetId: importedBudgetId }
    const submitted = await submitNote(worker.client, [file])
    expect(submitted.error).toBeNull()
    const linked = await staff.client.rpc('link_crane_delivery_note', { p_note_id: submitted.data!, p_budget_id: importedBudgetId })
    expect(linked.error).toBeNull()
    await recordLegacyBudgetRequest(submitted.data!, importedBudgetId)
    const note = await worker.client.from('crane_delivery_notes').select('*').eq('id', submitted.data!).single()
    const document = await readDocument(note.data!.document_id!)
    expect((await editDocument(document, [budgetId])).error).toBeNull()
    await deleteImportedBudget(importedBudgetId)
    expect((await staff.client.rpc('link_crane_delivery_note', { p_note_id: submitted.data!, p_budget_id: importedBudgetId })).data).toBe(document.id)
    expect((await staff.client.rpc('link_crane_delivery_note', { p_note_id: submitted.data!, p_budget_id: budgetId })).error?.code).toBe('23505')
    expect((await submitNote(worker.client, [file], data, submitted.data!)).data).toBe(submitted.data)
    expect((await worker.client.from('crane_delivery_notes').select('*').eq('id', submitted.data!).single()).data).toEqual(note.data)
    expect((await staff.client.from('documento_presupuestos').select('cotizacion_id').eq('documento_id', document.id)).data).toEqual([{ cotizacion_id: budgetId }])
  })
})
