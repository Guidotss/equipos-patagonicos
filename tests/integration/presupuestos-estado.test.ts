// tests/integration/presupuestos-estado.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarArchivosSubidos, limpiarDocumentos, nuevoPresupuesto, subirArchivo } from './documentos-helpers'
import { borrarUsuario, contraTransaccionEnCurso, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  await limpiarDocumentos(MARCA)
  await limpiarArchivosSubidos()
  for (const u of [activo, inactivo]) await borrarUsuario(u.id)
})

async function estadoPresupuesto(id: string) {
  const [fila] = await sql<{ presupuesto_estado: string; presupuesto_motivo: string }>(
    'select presupuesto_estado, presupuesto_motivo from public.cotizaciones where id = $1',
    [id],
  )
  return fila
}

/** Una cotización de la app aprobada (a diferencia de un presupuesto directo, se puede revertir). */
async function cotizacionAprobada(): Promise<string> {
  const guardada = await activo.client.rpc('guardar_cotizacion', {
    p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', notas: MARCA },
    p_items: ITEMS_JORNADA,
  })
  if (guardada.error) throw new Error('No se pudo guardar la cotización: ' + guardada.error.message)
  const id = guardada.data
  const [{ updated_at }] = await sql<{ updated_at: string }>('select updated_at from public.cotizaciones where id = $1', [id])
  const aprobada = await activo.client.rpc('aprobar_cotizacion', {
    p_id: id,
    p_updated_at: updated_at,
    p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
  })
  if (aprobada.error) throw new Error('No se pudo aprobar la cotización: ' + aprobada.error.message)
  return id
}

/** Registra una orden de compra en el presupuesto y devuelve el resultado tal cual (para los casos que tienen que fallar). */
async function registrarOrdenDeCompra(presupuesto: string) {
  const archivo = await subirArchivo(activo.client, ids.cliente_id)
  return activo.client.rpc('registrar_documento', {
    p_datos: { cliente_id: ids.cliente_id, tipo: 'orden_compra', notas: MARCA },
    p_presupuestos: [presupuesto],
    p_archivos: [archivo],
  })
}

/** Registra una orden de compra en el presupuesto para preparar datos: tira si falla y devuelve su id. */
async function registrarOrdenDeCompraOk(presupuesto: string): Promise<string> {
  const { data, error } = await registrarOrdenDeCompra(presupuesto)
  if (error) throw new Error('No se pudo registrar la orden de compra: ' + error.message)
  return data
}

describe('cambiar_estado_presupuesto', () => {
  it('finaliza y vuelve a en curso', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'finalizado' })).error).toBeNull()
    expect(await estadoPresupuesto(id)).toEqual({ presupuesto_estado: 'finalizado', presupuesto_motivo: '' })
    await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'en_curso' })
    expect((await estadoPresupuesto(id)).presupuesto_estado).toBe('en_curso')
  })

  it('el motivo se guarda solo al anular', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    const { error } = await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'finalizado', p_motivo: 'x' })
    expect(error).toBeNull()
    expect(await estadoPresupuesto(id)).toEqual({ presupuesto_estado: 'finalizado', presupuesto_motivo: '' })
  })

  it('anular exige motivo', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'anulado' })).error?.message).toMatch(/motivo/)
    await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'anulado', p_motivo: 'Cargado por error' })
    expect(await estadoPresupuesto(id)).toEqual({ presupuesto_estado: 'anulado', presupuesto_motivo: 'Cargado por error' })
  })

  it('un motivo de solo espacios no cuenta como motivo', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    const { error } = await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'anulado', p_motivo: '   ' })
    expect({ code: error?.code, message: error?.message }).toEqual({ code: 'P0001', message: 'Indicá el motivo de la anulación' })
    expect(await estadoPresupuesto(id)).toEqual({ presupuesto_estado: 'en_curso', presupuesto_motivo: '' })
  })

  it('rechaza estados desconocidos y cotizaciones no aprobadas', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'cobrado' })).error?.message).toMatch(/Estado/)

    const { data: borrador, error } = await activo.client.rpc('guardar_cotizacion', {
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', notas: MARCA },
      p_items: [],
    })
    expect(error).toBeNull()
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: borrador!, p_estado: 'finalizado' })).error?.message).toMatch(/no existe/)
  })

  it('un usuario inactivo no cambia el estado', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    const { error } = await inactivo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'finalizado' })
    expect(error?.code).toBe('42501')
    expect(await estadoPresupuesto(id)).toEqual({ presupuesto_estado: 'en_curso', presupuesto_motivo: '' })
  })
})

describe('revertir_aprobacion con documentos', () => {
  it('no revierte si el presupuesto tiene documentos activos; sí después de anularlos', async () => {
    const id = await cotizacionAprobada()
    const oc = await registrarOrdenDeCompraOk(id)

    expect((await activo.client.rpc('revertir_aprobacion', { p_id: id })).error?.message).toMatch(/tiene documentos/)

    await activo.client.rpc('anular_documento', { p_id: oc })
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: id })).error).toBeNull()
  })

  it('a un presupuesto directo con documentos le dice que se anula, no que anule los documentos', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    await registrarOrdenDeCompraOk(id)

    const { error } = await activo.client.rpc('revertir_aprobacion', { p_id: id })
    expect({ code: error?.code, message: error?.message }).toEqual({
      code: 'P0001',
      message: 'Un presupuesto directo no se revierte: anulalo desde el presupuesto',
    })
  })
})

describe('concurrencia entre el presupuesto y sus documentos', () => {
  const revertir = (id: string) => () => activo.client.rpc('revertir_aprobacion', { p_id: id })
  const documentosActivos = async (id: string) =>
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
    const id = await cotizacionAprobada()
    const archivo = await subirArchivo(activo.client, ids.cliente_id)
    const resultado = await contraTransaccionEnCurso(
      activo.id,
      'select public.registrar_documento($1::jsonb, $2::uuid[], $3::jsonb)',
      [JSON.stringify({ cliente_id: ids.cliente_id, tipo: 'orden_compra', notas: MARCA }), [id], JSON.stringify([archivo])],
      revertir(id),
    )
    expect(resultado.error?.message).toMatch(/tiene documentos/)
    expect((await estadoPresupuesto(id)).presupuesto_estado).toBe('en_curso')
  })

  it('no registra un documento mientras se revierte la aprobación del presupuesto', async () => {
    const id = await cotizacionAprobada()
    const resultado = await contraTransaccionEnCurso(activo.id, 'select public.revertir_aprobacion($1)', [id], () =>
      registrarOrdenDeCompra(id),
    )
    expect(resultado.error?.message).toMatch(/presupuestos aprobados/)
    expect(await documentosActivos(id)).toBe(0)
  })

  it('no registra un documento mientras se anula el presupuesto', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    const resultado = await contraTransaccionEnCurso(
      activo.id,
      `select public.cambiar_estado_presupuesto($1, 'anulado', 'Cargado por error')`,
      [id],
      () => registrarOrdenDeCompra(id),
    )
    expect(resultado.error?.message).toMatch(/no anulados/)
    expect(await documentosActivos(id)).toBe(0)
  })

  it('no restaura un documento mientras se revierte la aprobación de su presupuesto', async () => {
    const id = await cotizacionAprobada()
    const oc = await registrarOrdenDeCompraOk(id)
    expect((await activo.client.rpc('anular_documento', { p_id: oc })).error).toBeNull()

    const resultado = await contraTransaccionEnCurso(activo.id, 'select public.revertir_aprobacion($1)', [id], () =>
      activo.client.rpc('restaurar_documento', { p_id: oc }),
    )
    expect(resultado.error?.message).toMatch(/No se puede restaurar/)
    expect(await documentosActivos(id)).toBe(0)
  })

  it('no revierte la aprobación mientras se restaura un documento del presupuesto', async () => {
    const id = await cotizacionAprobada()
    const oc = await registrarOrdenDeCompraOk(id)
    expect((await activo.client.rpc('anular_documento', { p_id: oc })).error).toBeNull()

    const resultado = await contraTransaccionEnCurso(activo.id, 'select public.restaurar_documento($1)', [oc], revertir(id))
    expect(resultado.error?.message).toMatch(/tiene documentos/)
    expect((await estadoPresupuesto(id)).presupuesto_estado).toBe('en_curso')
  })
})
