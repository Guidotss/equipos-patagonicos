// tests/integration/cotizaciones-estados.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Json } from '@/lib/supabase/database.types'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { borrarUsuario, conConexion, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await borrarUsuario(activo.id)
})

async function nueva(items: Json[] = ITEMS_JORNADA): Promise<string> {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', {
    p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', notas: MARCA },
    p_items: items,
  })
  if (error) throw error
  return data
}

async function estado(id: string) {
  const [fila] = await sql<{ estado: string; fecha_aprobacion: string | null; presupuesto_estado: string | null; pdf_aprobado_path: string | null }>(
    `select estado, to_char(fecha_aprobacion, 'YYYY-MM-DD') as fecha_aprobacion, presupuesto_estado, pdf_aprobado_path
     from public.cotizaciones where id = $1`,
    [id],
  )
  return fila
}

/** El updated_at tal como lo devuelve la API (con microsegundos), que es lo que lee quien genera el PDF. */
async function version(id: string): Promise<string> {
  const { data, error } = await activo.client.from('cotizaciones').select('updated_at').eq('id', id).single()
  if (error) throw error
  return data.updated_at
}

/** Una cotización existente cargada como enviada: sin ítems y con su PDF original. */
async function importada(): Promise<string> {
  const [fila] = await sql<{ id: string }>(
    `insert into public.cotizaciones (origen, estado, cliente_id, formato, fecha, archivo_original_path, notas)
     values ('importada', 'enviada', $1, 'jornada', '2026-10-22', $2, $3)
     returning id`,
    [ids.cliente_id, `importadas/${crypto.randomUUID()}.pdf`, MARCA],
  )
  return fila.id
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
 * Corre `llamada` mientras otra transacción tiene a medio guardar la cotización (con un ítem sin precio)
 * y confirma ese guardado recién cuando la llamada ya está esperando.
 */
async function contraGuardadoEnCurso<T>(id: string, llamada: () => PromiseLike<T>): Promise<T> {
  return conConexion(async (otra) => {
    await otra.query('begin')
    await otra.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: activo.id, role: 'authenticated' }),
    ])
    await otra.query('set local role authenticated')
    await otra.query('select public.guardar_cotizacion($1::jsonb, $2::jsonb, $3)', [
      JSON.stringify({ cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', notas: MARCA }),
      JSON.stringify([{ descripcion: 'Sin precio', unidad: 'JORNADA' }]),
      id,
    ])
    const [{ pid }] = (await otra.query<{ pid: number }>('select pg_backend_pid() as pid')).rows
    const resultado = Promise.resolve(llamada())
    await esperarBloqueadaPor(pid)
    await otra.query('commit')
    return resultado
  })
}

describe('enviar', () => {
  it('pasa a enviada y guarda cada envío con su PDF', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/enviada-1.pdf`, p_updated_at: await version(id) })).error).toBeNull()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/enviada-2.pdf`, p_updated_at: await version(id) })).error).toBeNull()
    expect((await estado(id)).estado).toBe('enviada')
    const envios = await sql('select pdf_path from public.cotizacion_envios where cotizacion_id = $1', [id])
    expect(envios).toHaveLength(2)
  })

  it('exige ítems, todos con precio, y una ruta de PDF de esa cotización', async () => {
    const sinItems = await nueva([])
    expect((await activo.client.rpc('marcar_enviada', { p_id: sinItems, p_pdf_path: `cotizaciones/${sinItems}/a.pdf`, p_updated_at: await version(sinItems) })).error?.message).toMatch(/no tiene ítems/)

    const sinPrecio = await nueva([{ descripcion: 'Jornada', unidad: 'JORNADA' }])
    expect((await activo.client.rpc('marcar_enviada', { p_id: sinPrecio, p_pdf_path: `cotizaciones/${sinPrecio}/a.pdf`, p_updated_at: await version(sinPrecio) })).error?.message).toMatch(/sin precio/)

    const id = await nueva()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: 'cotizaciones/otra/a.pdf', p_updated_at: await version(id) })).error?.message).toMatch(/Ruta de PDF inválida/)
  })
})

describe('aprobar', () => {
  it('desde enviada: queda congelada, con fecha y presupuesto en curso', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/enviada.pdf`, p_updated_at: await version(id) })).error).toBeNull()
    const { error } = await activo.client.rpc('aprobar_cotizacion', {
      p_id: id,
      p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
      p_fecha: '2026-10-25',
      p_updated_at: await version(id),
    })
    expect(error).toBeNull()
    expect(await estado(id)).toEqual({
      estado: 'aprobada',
      fecha_aprobacion: '2026-10-25',
      presupuesto_estado: 'en_curso',
      pdf_aprobado_path: `cotizaciones/${id}/aprobada.pdf`,
    })
  })

  it('la fecha de aprobación no puede ser anterior a la cotización', async () => {
    const id = await nueva()
    const { error } = await activo.client.rpc('aprobar_cotizacion', {
      p_id: id,
      p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
      p_fecha: '2026-10-01',
      p_updated_at: await version(id),
    })
    expect(error?.message).toMatch(/anterior a la cotización/)
  })

  it('no se aprueba dos veces', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/a.pdf`, p_updated_at: await version(id) })).error).toBeNull()
    const { error } = await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/b.pdf`, p_updated_at: await version(id) })
    expect(error?.message).toMatch(/Solo se puede aprobar/)
  })
})

describe('cotizaciones cargadas', () => {
  it('una enviada se aprueba sin ítems y su documento sigue siendo el PDF original', async () => {
    const id = await importada()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_fecha: '2026-10-25', p_updated_at: await version(id) })).error).toBeNull()
    expect(await estado(id)).toEqual({
      estado: 'aprobada',
      fecha_aprobacion: '2026-10-25',
      presupuesto_estado: 'en_curso',
      pdf_aprobado_path: null,
    })
  })

  it('no se le asocia un PDF generado por la app', async () => {
    const id = await importada()
    const { error } = await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/a.pdf`, p_updated_at: await version(id) })
    expect(error?.message).toMatch(/PDF original/)
    expect((await estado(id)).estado).toBe('enviada')
  })

  it('no se envía desde la app, aunque tenga ítems con precio', async () => {
    const id = await importada()
    await sql(
      `insert into public.cotizacion_items (cotizacion_id, orden, descripcion, cantidad, precio_unitario, unidad)
       values ($1, 1, 'Jornada', 1, 1950000, 'JORNADA')`,
      [id],
    )
    const { error } = await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/e.pdf`, p_updated_at: await version(id) })
    expect(error?.message).toMatch(/cargada/)
    expect(await sql('select 1 from public.cotizacion_envios where cotizacion_id = $1', [id])).toHaveLength(0)
  })
})

describe('versión y concurrencia', () => {
  it('una cotización inexistente da un error claro', async () => {
    const id = crypto.randomUUID()
    const ruta = `cotizaciones/${id}/a.pdf`
    const leida = new Date().toISOString()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: ruta, p_updated_at: leida })).error?.message).toMatch(/no existe/)
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: ruta, p_updated_at: leida })).error?.message).toMatch(/no existe/)
  })

  it('exige la versión leída al generar el PDF', async () => {
    const id = await nueva()
    const ruta = `cotizaciones/${id}/a.pdf`
    const sinVersion = null as unknown as string
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: ruta, p_updated_at: sinVersion })).error?.message).toMatch(/Falta la versión/)
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: ruta, p_updated_at: sinVersion })).error?.message).toMatch(/Falta la versión/)
    expect((await estado(id)).estado).toBe('borrador')
  })

  it('no envía ni aprueba si la cotización cambió después de leer la versión', async () => {
    const id = await nueva()
    const leida = await version(id)
    const { error: errorGuardar } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', asunto: 'Otro asunto', notas: MARCA },
      p_items: ITEMS_JORNADA,
    })
    expect(errorGuardar).toBeNull()

    const ruta = `cotizaciones/${id}/a.pdf`
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: ruta, p_updated_at: leida })).error?.message).toMatch(/cambió/)
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: ruta, p_updated_at: leida })).error?.message).toMatch(/cambió/)
    expect((await estado(id)).estado).toBe('borrador')

    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: ruta, p_updated_at: await version(id) })).error).toBeNull()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: ruta, p_updated_at: await version(id) })).error).toBeNull()
    expect((await estado(id)).estado).toBe('aprobada')
  })

  it('compara la versión al milisegundo: pasarla por Date no la invalida', async () => {
    const id = await nueva()
    const ruta = `cotizaciones/${id}/a.pdf`
    const enMilisegundos = async () => new Date(await version(id)).toISOString()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: ruta, p_updated_at: await enMilisegundos() })).error).toBeNull()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: ruta, p_updated_at: await enMilisegundos() })).error).toBeNull()
    expect((await estado(id)).estado).toBe('aprobada')
  })

  it('aprobar espera a un guardado en curso y no registra el PDF de la versión anterior', async () => {
    const id = await nueva()
    const leida = await version(id)
    const { error } = await contraGuardadoEnCurso(id, () =>
      activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/a.pdf`, p_updated_at: leida }),
    )
    expect(error?.message).toMatch(/cambió/)
    expect((await estado(id)).estado).toBe('borrador')
  })

  it('marcar enviada espera a un guardado en curso y no registra el PDF de la versión anterior', async () => {
    const id = await nueva()
    const leida = await version(id)
    const { error } = await contraGuardadoEnCurso(id, () =>
      activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/e.pdf`, p_updated_at: leida }),
    )
    expect(error?.message).toMatch(/cambió/)
    expect((await estado(id)).estado).toBe('borrador')
    expect(await sql('select 1 from public.cotizacion_envios where cotizacion_id = $1', [id])).toHaveLength(0)
  })
})

describe('rechazar, reabrir y revertir', () => {
  it('rechazar y reabrir vuelve a borrador', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('rechazar_cotizacion', { p_id: id })).error).toBeNull()
    expect((await estado(id)).estado).toBe('rechazada')
    expect((await activo.client.rpc('reabrir_cotizacion', { p_id: id })).error).toBeNull()
    expect((await estado(id)).estado).toBe('borrador')
  })

  it('una aprobada no se puede rechazar', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/a.pdf`, p_updated_at: await version(id) })).error).toBeNull()
    expect((await activo.client.rpc('rechazar_cotizacion', { p_id: id })).error?.message).toMatch(/Solo se puede rechazar/)
  })

  it('revertir la aprobación vuelve a enviada si se había enviado, o a borrador', async () => {
    const enviada = await nueva()
    expect((await activo.client.rpc('marcar_enviada', { p_id: enviada, p_pdf_path: `cotizaciones/${enviada}/e.pdf`, p_updated_at: await version(enviada) })).error).toBeNull()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: enviada, p_pdf_path: `cotizaciones/${enviada}/a.pdf`, p_updated_at: await version(enviada) })).error).toBeNull()
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: enviada })).error).toBeNull()
    expect(await estado(enviada)).toEqual({ estado: 'enviada', fecha_aprobacion: null, presupuesto_estado: null, pdf_aprobado_path: null })

    const directa = await nueva()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: directa, p_pdf_path: `cotizaciones/${directa}/a.pdf`, p_updated_at: await version(directa) })).error).toBeNull()
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: directa })).error).toBeNull()
    expect((await estado(directa)).estado).toBe('borrador')
  })
})
