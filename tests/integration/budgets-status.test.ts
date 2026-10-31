// tests/integration/presupuestos-estado.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ITEMS_DAILY, idsOfExample } from './quotes-helpers'
import { limpiarFilesSubidos, limpiarDocuments, newBudget, uploadFile } from './documents-helpers'
import { removeUser, contraTransaccionInCurso, crearUser, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUser>>
let inactivo: Awaited<ReturnType<typeof crearUser>>
let ids: Awaited<ReturnType<typeof idsOfExample>>

beforeAll(async () => {
  activo = await crearUser({ activo: true, rol: 'operador' })
  inactivo = await crearUser({ activo: false })
  ids = await idsOfExample()
})

afterAll(async () => {
  try {
    await limpiarDocuments(MARCA)
    await limpiarFilesSubidos()
  } finally {
    for (const u of [activo, inactivo]) await removeUser(u.id)
  }
})

async function statusBudget(id: string) {
  const [row] = await sql<{ presupuesto_estado: string; presupuesto_motivo: string }>(
    'select presupuesto_estado, presupuesto_motivo from public.cotizaciones where id = $1',
    [id],
  )
  return row
}

/** Una cotización de la app aprobada (a diferencia de un presupuesto directo, se puede revertir). */
async function quoteApproved(): Promise<string> {
  const guardada = await activo.client.rpc('guardar_cotizacion', {
    p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', notas: MARCA },
    p_items: ITEMS_DAILY,
  })
  if (guardada.error) throw new Error('No se pudo guardar la cotización: ' + guardada.error.message)
  const id = guardada.data
  const [{ updated_at }] = await sql<{ updated_at: string }>('select updated_at from public.cotizaciones where id = $1', [id])
  const approved = await activo.client.rpc('aprobar_cotizacion', {
    p_id: id,
    p_updated_at: updated_at,
    p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
  })
  if (approved.error) throw new Error('No se pudo aprobar la cotización: ' + approved.error.message)
  return id
}

/** Registra una orden de compra en el presupuesto y devuelve el resultado tal cual (para los casos que tienen que fallar). */
async function registerOrderOfCompra(budget: string) {
  const archivo = await uploadFile(activo.client, ids.cliente_id)
  return activo.client.rpc('registrar_documento', {
    p_datos: { cliente_id: ids.cliente_id, tipo: 'orden_compra', notas: MARCA },
    p_presupuestos: [budget],
    p_archivos: [archivo],
  })
}

/** Registra una orden de compra en el presupuesto para preparar datos: tira si falla y devuelve su id. */
async function registerOrderOfCompraOk(budget: string): Promise<string> {
  const { data, error } = await registerOrderOfCompra(budget)
  if (error) throw new Error('No se pudo registrar la orden de compra: ' + error.message)
  return data
}

describe('cambiar_estado_presupuesto', () => {
  it('finaliza y vuelve a en curso', async () => {
    const id = await newBudget(activo.client, ids.cliente_id, MARCA)
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'finalizado' })).error).toBeNull()
    expect(await statusBudget(id)).toEqual({ presupuesto_estado: 'finalizado', presupuesto_motivo: '' })
    await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'en_curso' })
    expect((await statusBudget(id)).presupuesto_estado).toBe('en_curso')
  })

  it('el motivo se guarda solo al anular', async () => {
    const id = await newBudget(activo.client, ids.cliente_id, MARCA)
    const { error } = await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'finalizado', p_motivo: 'x' })
    expect(error).toBeNull()
    expect(await statusBudget(id)).toEqual({ presupuesto_estado: 'finalizado', presupuesto_motivo: '' })
  })

  it('anular exige motivo', async () => {
    const id = await newBudget(activo.client, ids.cliente_id, MARCA)
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'anulado' })).error?.message).toMatch(/motivo/)
    await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'anulado', p_motivo: 'Cargado por error' })
    expect(await statusBudget(id)).toEqual({ presupuesto_estado: 'anulado', presupuesto_motivo: 'Cargado por error' })
  })

  it('un motivo de solo espacios no cuenta como motivo', async () => {
    const id = await newBudget(activo.client, ids.cliente_id, MARCA)
    const { error } = await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'anulado', p_motivo: '   ' })
    expect({ code: error?.code, message: error?.message }).toEqual({ code: 'P0001', message: 'Indicá el motivo de la anulación' })
    expect(await statusBudget(id)).toEqual({ presupuesto_estado: 'en_curso', presupuesto_motivo: '' })
  })

  it('rechaza estados desconocidos y cotizaciones no aprobadas', async () => {
    const id = await newBudget(activo.client, ids.cliente_id, MARCA)
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'cobrado' })).error?.message).toMatch(/Estado/)

    const { data: draft, error } = await activo.client.rpc('guardar_cotizacion', {
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', notas: MARCA },
      p_items: [],
    })
    expect(error).toBeNull()
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: draft!, p_estado: 'finalizado' })).error?.message).toMatch(/no existe/)
  })

  it('un usuario inactivo no cambia el estado', async () => {
    const id = await newBudget(activo.client, ids.cliente_id, MARCA)
    const { error } = await inactivo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'finalizado' })
    expect(error?.code).toBe('42501')
    expect(await statusBudget(id)).toEqual({ presupuesto_estado: 'en_curso', presupuesto_motivo: '' })
  })
})

describe('revertir_aprobacion con documentos', () => {
  it('no revierte si el presupuesto tiene documentos activos; sí después de anularlos', async () => {
    const id = await quoteApproved()
    const oc = await registerOrderOfCompraOk(id)

    expect((await activo.client.rpc('revertir_aprobacion', { p_id: id })).error?.message).toMatch(/tiene documentos/)

    expect((await activo.client.rpc('anular_documento', { p_id: oc })).error).toBeNull()
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: id })).error).toBeNull()
  })

  it('a un presupuesto directo con documentos le dice que se anula, no que anule los documentos', async () => {
    const id = await newBudget(activo.client, ids.cliente_id, MARCA)
    await registerOrderOfCompraOk(id)

    const { error } = await activo.client.rpc('revertir_aprobacion', { p_id: id })
    expect({ code: error?.code, message: error?.message }).toEqual({
      code: 'P0001',
      message: 'Un presupuesto directo no se revierte: anulalo desde el presupuesto',
    })
  })
})

describe('concurrencia entre el presupuesto y sus documentos', () => {
  const revert = (id: string) => () => activo.client.rpc('revertir_aprobacion', { p_id: id })
  const documentsActivos = async (id: string) =>
    (
      await sql<{ cantidad: number }>(
        `select count(*)::int as cantidad
         from public.documento_presupuestos dp
         join public.documentos d on d.id = dp.documento_id and d.deleted_at is null
         where dp.cotizacion_id = $1`,
        [id],
      )
    )[0].cantidad

  it('no revierte la aprobación mientras se registra un documento en el presupuesto', async () => {
    const id = await quoteApproved()
    const archivo = await uploadFile(activo.client, ids.cliente_id)
    const result = await contraTransaccionInCurso(
      activo.id,
      'select public.registrar_documento($1::jsonb, $2::uuid[], $3::jsonb)',
      [JSON.stringify({ cliente_id: ids.cliente_id, tipo: 'orden_compra', notas: MARCA }), [id], JSON.stringify([archivo])],
      revert(id),
    )
    expect(result.error?.message).toMatch(/tiene documentos/)
    expect((await statusBudget(id)).presupuesto_estado).toBe('en_curso')
  })

  it('no registra un documento mientras se revierte la aprobación del presupuesto', async () => {
    const id = await quoteApproved()
    const result = await contraTransaccionInCurso(activo.id, 'select public.revertir_aprobacion($1)', [id], () =>
      registerOrderOfCompra(id),
    )
    expect(result.error?.message).toMatch(/presupuestos aprobados/)
    expect(await documentsActivos(id)).toBe(0)
  })

  it('no registra un documento mientras se anula el presupuesto', async () => {
    const id = await newBudget(activo.client, ids.cliente_id, MARCA)
    const result = await contraTransaccionInCurso(
      activo.id,
      `select public.cambiar_estado_presupuesto($1, 'anulado', 'Cargado por error')`,
      [id],
      () => registerOrderOfCompra(id),
    )
    expect(result.error?.message).toMatch(/no anulados/)
    expect(await documentsActivos(id)).toBe(0)
  })

  it('no restaura un documento mientras se revierte la aprobación de su presupuesto', async () => {
    const id = await quoteApproved()
    const oc = await registerOrderOfCompraOk(id)
    expect((await activo.client.rpc('anular_documento', { p_id: oc })).error).toBeNull()

    const result = await contraTransaccionInCurso(activo.id, 'select public.revertir_aprobacion($1)', [id], () =>
      activo.client.rpc('restaurar_documento', { p_id: oc }),
    )
    expect(result.error?.message).toMatch(/No se puede restaurar/)
    expect(await documentsActivos(id)).toBe(0)
  })

  it('no revierte la aprobación mientras se restaura un documento del presupuesto', async () => {
    const id = await quoteApproved()
    const oc = await registerOrderOfCompraOk(id)
    expect((await activo.client.rpc('anular_documento', { p_id: oc })).error).toBeNull()

    const result = await contraTransaccionInCurso(activo.id, 'select public.restaurar_documento($1)', [oc], revert(id))
    expect(result.error?.message).toMatch(/tiene documentos/)
    expect((await statusBudget(id)).presupuesto_estado).toBe('en_curso')
  })
})
