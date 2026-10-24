// tests/integration/presupuestos-estado.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarDocumentos, nuevoPresupuesto, subirArchivo } from './documentos-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  await limpiarDocumentos(MARCA)
  await borrarUsuario(activo.id)
})

async function estadoPresupuesto(id: string) {
  const [fila] = await sql<{ presupuesto_estado: string; presupuesto_motivo: string }>(
    'select presupuesto_estado, presupuesto_motivo from public.cotizaciones where id = $1',
    [id],
  )
  return fila
}

describe('cambiar_estado_presupuesto', () => {
  it('finaliza y vuelve a en curso', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'finalizado' })).error).toBeNull()
    expect(await estadoPresupuesto(id)).toEqual({ presupuesto_estado: 'finalizado', presupuesto_motivo: '' })
    await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'en_curso' })
    expect((await estadoPresupuesto(id)).presupuesto_estado).toBe('en_curso')
  })

  it('anular exige motivo', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'anulado' })).error?.message).toMatch(/motivo/)
    await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'anulado', p_motivo: 'Cargado por error' })
    expect(await estadoPresupuesto(id)).toEqual({ presupuesto_estado: 'anulado', presupuesto_motivo: 'Cargado por error' })
  })

  it('rechaza estados desconocidos y cotizaciones no aprobadas', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'cobrado' })).error?.message).toMatch(/Estado/)

    const { data: borrador } = await activo.client.rpc('guardar_cotizacion', {
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', notas: MARCA },
      p_items: [],
    })
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: borrador!, p_estado: 'finalizado' })).error?.message).toMatch(/no existe/)
  })
})

describe('revertir_aprobacion con documentos', () => {
  it('no revierte si el presupuesto tiene documentos activos; sí después de anularlos', async () => {
    const { data: id } = await activo.client.rpc('guardar_cotizacion', {
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', notas: MARCA },
      p_items: ITEMS_JORNADA,
    })
    const [{ updated_at }] = await sql<{ updated_at: string }>('select updated_at from public.cotizaciones where id = $1', [id])
    const aprobada = await activo.client.rpc('aprobar_cotizacion', {
      p_id: id!,
      p_updated_at: updated_at,
      p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
    })
    expect(aprobada.error).toBeNull()

    const archivo = await subirArchivo(activo.client, ids.cliente_id)
    const { data: oc } = await activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'orden_compra', notas: MARCA },
      p_presupuestos: [id!],
      p_archivos: [archivo],
    })

    expect((await activo.client.rpc('revertir_aprobacion', { p_id: id! })).error?.message).toMatch(/tiene documentos/)

    await activo.client.rpc('anular_documento', { p_id: oc! })
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: id! })).error).toBeNull()
  })
})
