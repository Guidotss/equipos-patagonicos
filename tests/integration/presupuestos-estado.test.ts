// tests/integration/presupuestos-estado.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarDocumentos, nuevoPresupuesto, subirArchivo } from './documentos-helpers'
import { borrarUsuario, conConexion, crearUsuario, sql } from './helpers'

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

/** Una cotización de la app aprobada (a diferencia de un presupuesto directo, se puede revertir). */
async function cotizacionAprobada(): Promise<string> {
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
  return id!
}

async function registrarOrdenDeCompra(presupuesto: string) {
  const archivo = await subirArchivo(activo.client, ids.cliente_id)
  return activo.client.rpc('registrar_documento', {
    p_datos: { cliente_id: ids.cliente_id, tipo: 'orden_compra', notas: MARCA },
    p_presupuestos: [presupuesto],
    p_archivos: [archivo],
  })
}

async function esperarBloqueadaPor(pid: number) {
  for (let intento = 0; intento < 100; intento++) {
    const [fila] = await sql<{ esperando: number }>(
      'select count(*)::int as esperando from pg_stat_activity where $1 = any(pg_blocking_pids(pid))',
      [pid],
    )
    if (fila.esperando > 0) return
    await new Promise((resolver) => setTimeout(resolver, 50))
  }
  throw new Error('La llamada nunca quedó esperando a la otra transacción')
}

/**
 * Corre `llamada` mientras otra transacción (del mismo usuario) ejecutó `consulta` sin confirmar
 * y la confirma recién cuando la llamada ya está esperando.
 */
async function contraTransaccionEnCurso<T>(
  consulta: string,
  parametros: unknown[],
  llamada: () => PromiseLike<T>,
): Promise<T> {
  return conConexion(async (otra) => {
    await otra.query('begin')
    await otra.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: activo.id, role: 'authenticated' }),
    ])
    await otra.query('set local role authenticated')
    await otra.query(consulta, parametros)
    const [{ pid }] = (await otra.query<{ pid: number }>('select pg_backend_pid() as pid')).rows
    const resultado = Promise.resolve(llamada())
    await esperarBloqueadaPor(pid)
    await otra.query('commit')
    return resultado
  })
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
    const id = await cotizacionAprobada()
    const { data: oc } = await registrarOrdenDeCompra(id)

    expect((await activo.client.rpc('revertir_aprobacion', { p_id: id })).error?.message).toMatch(/tiene documentos/)

    await activo.client.rpc('anular_documento', { p_id: oc! })
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: id })).error).toBeNull()
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
      'select public.registrar_documento($1::jsonb, $2::uuid[], $3::jsonb)',
      [JSON.stringify({ cliente_id: ids.cliente_id, tipo: 'orden_compra', notas: MARCA }), [id], JSON.stringify([archivo])],
      revertir(id),
    )
    expect(resultado.error?.message).toMatch(/tiene documentos/)
    expect((await estadoPresupuesto(id)).presupuesto_estado).toBe('en_curso')
  })

  it('no registra un documento mientras se revierte la aprobación del presupuesto', async () => {
    const id = await cotizacionAprobada()
    const resultado = await contraTransaccionEnCurso('select public.revertir_aprobacion($1)', [id], () =>
      registrarOrdenDeCompra(id),
    )
    expect(resultado.error?.message).toMatch(/presupuestos aprobados/)
    expect(await documentosActivos(id)).toBe(0)
  })

  it('no registra un documento mientras se anula el presupuesto', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    const resultado = await contraTransaccionEnCurso(
      `select public.cambiar_estado_presupuesto($1, 'anulado', 'Cargado por error')`,
      [id],
      () => registrarOrdenDeCompra(id),
    )
    expect(resultado.error?.message).toMatch(/no anulados/)
    expect(await documentosActivos(id)).toBe(0)
  })

  it('no restaura un documento mientras se revierte la aprobación de su presupuesto', async () => {
    const id = await cotizacionAprobada()
    const { data: oc } = await registrarOrdenDeCompra(id)
    expect((await activo.client.rpc('anular_documento', { p_id: oc! })).error).toBeNull()

    const resultado = await contraTransaccionEnCurso('select public.revertir_aprobacion($1)', [id], () =>
      activo.client.rpc('restaurar_documento', { p_id: oc! }),
    )
    expect(resultado.error?.message).toMatch(/No se puede restaurar/)
    expect(await documentosActivos(id)).toBe(0)
  })

  it('no revierte la aprobación mientras se restaura un documento del presupuesto', async () => {
    const id = await cotizacionAprobada()
    const { data: oc } = await registrarOrdenDeCompra(id)
    expect((await activo.client.rpc('anular_documento', { p_id: oc! })).error).toBeNull()

    const resultado = await contraTransaccionEnCurso('select public.restaurar_documento($1)', [oc], revertir(id))
    expect(resultado.error?.message).toMatch(/tiene documentos/)
    expect((await estadoPresupuesto(id)).presupuesto_estado).toBe('en_curso')
  })
})
