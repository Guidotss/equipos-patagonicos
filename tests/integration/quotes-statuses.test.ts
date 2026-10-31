// tests/integration/cotizaciones-estados.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Json } from '@/lib/supabase/database.types'
import { ITEMS_DAILY, idsOfExample } from './quotes-helpers'
import { removeUser, contraTransaccionInCurso, crearUser, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUser>>
let ids: Awaited<ReturnType<typeof idsOfExample>>

beforeAll(async () => {
  activo = await crearUser({ activo: true, rol: 'operador' })
  ids = await idsOfExample()
})

afterAll(async () => {
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await removeUser(activo.id)
})

async function nueva(items: Json[] = ITEMS_DAILY): Promise<string> {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', {
    p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', notas: MARCA },
    p_items: items,
  })
  if (error) throw new Error('No se pudo guardar la cotización: ' + error.message)
  return data
}

async function estado(id: string) {
  const [row] = await sql<{ estado: string; fecha_aprobacion: string | null; presupuesto_estado: string | null; pdf_aprobado_path: string | null }>(
    `select estado, to_char(fecha_aprobacion, 'YYYY-MM-DD') as fecha_aprobacion, presupuesto_estado, pdf_aprobado_path
     from public.cotizaciones where id = $1`,
    [id],
  )
  return row
}

/** El updated_at tal como lo devuelve la API (con microsegundos), que es lo que lee quien genera el PDF. */
async function version(id: string): Promise<string> {
  const { data, error } = await activo.client.from('cotizaciones').select('updated_at').eq('id', id).single()
  if (error) throw error
  return data.updated_at
}

/** Una cotización existente cargada como enviada: sin ítems y con su PDF original. */
async function imported(): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.cotizaciones (origen, estado, cliente_id, formato, fecha, archivo_original_path, notas)
     values ('importada', 'enviada', $1, 'jornada', '2026-10-22', $2, $3)
     returning id`,
    [ids.cliente_id, `importadas/${crypto.randomUUID()}.pdf`, MARCA],
  )
  return row.id
}

/**
 * Corre `llamada` mientras otra transacción tiene a medio guardar la cotización (con un ítem sin precio, a partir
 * de la versión `leida`) y confirma ese guardado recién cuando la llamada ya está esperando.
 */
async function contraSavedInCurso<T>(id: string, leida: string, llamada: () => PromiseLike<T>): Promise<T> {
  return contraTransaccionInCurso(
    activo.id,
    'select public.guardar_cotizacion($1::jsonb, $2::jsonb, $3::uuid, $4::timestamptz)',
    [
      JSON.stringify({ cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', notas: MARCA }),
      JSON.stringify([{ descripcion: 'Sin precio', unidad: 'JORNADA' }]),
      id,
      leida,
    ],
    llamada,
  )
}

describe('enviar', () => {
  it('pasa a enviada y guarda cada envío con su PDF', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/enviada-1.pdf`, p_updated_at: await version(id) })).error).toBeNull()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/enviada-2.pdf`, p_updated_at: await version(id) })).error).toBeNull()
    expect((await estado(id)).estado).toBe('enviada')
    const sends = await sql('select pdf_path from public.cotizacion_envios where cotizacion_id = $1', [id])
    expect(sends).toHaveLength(2)
  })

  it('exige ítems, todos con precio, y una ruta de PDF de esa cotización', async () => {
    const withoutItems = await nueva([])
    expect((await activo.client.rpc('marcar_enviada', { p_id: withoutItems, p_pdf_path: `cotizaciones/${withoutItems}/a.pdf`, p_updated_at: await version(withoutItems) })).error?.message).toMatch(/no tiene ítems/)

    const withoutPrice = await nueva([{ descripcion: 'Jornada', unidad: 'JORNADA' }])
    expect((await activo.client.rpc('marcar_enviada', { p_id: withoutPrice, p_pdf_path: `cotizaciones/${withoutPrice}/a.pdf`, p_updated_at: await version(withoutPrice) })).error?.message).toMatch(/sin precio/)

    const id = await nueva()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: 'cotizaciones/otra/a.pdf', p_updated_at: await version(id) })).error?.message).toMatch(/Ruta de PDF inválida/)
  })

  it('no se envía una aprobada ni una rechazada', async () => {
    const approved = await nueva()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: approved, p_pdf_path: `cotizaciones/${approved}/a.pdf`, p_updated_at: await version(approved) })).error).toBeNull()
    expect((await activo.client.rpc('marcar_enviada', { p_id: approved, p_pdf_path: `cotizaciones/${approved}/e.pdf`, p_updated_at: await version(approved) })).error?.message).toMatch(/Solo se puede enviar/)
    expect((await estado(approved)).estado).toBe('aprobada')

    const rejected = await nueva()
    expect((await activo.client.rpc('rechazar_cotizacion', { p_id: rejected })).error).toBeNull()
    expect((await activo.client.rpc('marcar_enviada', { p_id: rejected, p_pdf_path: `cotizaciones/${rejected}/e.pdf`, p_updated_at: await version(rejected) })).error?.message).toMatch(/Solo se puede enviar/)
    expect((await estado(rejected)).estado).toBe('rechazada')

    expect(await sql('select 1 from public.cotizacion_envios where cotizacion_id = any($1)', [[approved, rejected]])).toHaveLength(0)
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
    const id = await imported()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_fecha: '2026-10-25', p_updated_at: await version(id) })).error).toBeNull()
    expect(await estado(id)).toEqual({
      estado: 'aprobada',
      fecha_aprobacion: '2026-10-25',
      presupuesto_estado: 'en_curso',
      pdf_aprobado_path: null,
    })
  })

  it('no se le asocia un PDF generado por la app', async () => {
    const id = await imported()
    const { error } = await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/a.pdf`, p_updated_at: await version(id) })
    expect(error?.message).toMatch(/PDF original/)
    expect((await estado(id)).estado).toBe('enviada')
  })

  it('no se envía desde la app, aunque tenga ítems con precio', async () => {
    const id = await imported()
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
    const path = `cotizaciones/${id}/a.pdf`
    const leida = new Date().toISOString()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: path, p_updated_at: leida })).error?.message).toMatch(/no existe/)
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: path, p_updated_at: leida })).error?.message).toMatch(/no existe/)
  })

  it('exige la versión leída al generar el PDF', async () => {
    const id = await nueva()
    const path = `cotizaciones/${id}/a.pdf`
    const withoutVersion = null as unknown as string
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: path, p_updated_at: withoutVersion })).error?.message).toMatch(/Falta la versión/)
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: path, p_updated_at: withoutVersion })).error?.message).toMatch(/Falta la versión/)
    expect((await estado(id)).estado).toBe('borrador')
  })

  it('no envía ni aprueba si la cotización cambió después de leer la versión', async () => {
    const id = await nueva()
    const leida = await version(id)
    const { error: errorSave } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_updated_at: leida,
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', asunto: 'Otro asunto', notas: MARCA },
      p_items: ITEMS_DAILY,
    })
    expect(errorSave).toBeNull()

    const path = `cotizaciones/${id}/a.pdf`
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: path, p_updated_at: leida })).error?.message).toMatch(/cambió desde que la abriste/)
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: path, p_updated_at: leida })).error?.message).toMatch(/cambió desde que la abriste/)
    expect((await estado(id)).estado).toBe('borrador')

    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: path, p_updated_at: await version(id) })).error).toBeNull()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: path, p_updated_at: await version(id) })).error).toBeNull()
    expect((await estado(id)).estado).toBe('aprobada')
  })

  it('compara la versión al milisegundo: pasarla por Date no la invalida', async () => {
    const id = await nueva()
    const path = `cotizaciones/${id}/a.pdf`
    const inMilisegundos = async () => new Date(await version(id)).toISOString()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: path, p_updated_at: await inMilisegundos() })).error).toBeNull()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: path, p_updated_at: await inMilisegundos() })).error).toBeNull()
    expect((await estado(id)).estado).toBe('aprobada')
  })

  it('aprobar espera a un guardado en curso y no registra el PDF de la versión anterior', async () => {
    const id = await nueva()
    const leida = await version(id)
    const { error } = await contraSavedInCurso(id, leida, () =>
      activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/a.pdf`, p_updated_at: leida }),
    )
    expect(error?.message).toMatch(/cambió desde que la abriste/)
    expect((await estado(id)).estado).toBe('borrador')
  })

  it('marcar enviada espera a un guardado en curso y no registra el PDF de la versión anterior', async () => {
    const id = await nueva()
    const leida = await version(id)
    const { error } = await contraSavedInCurso(id, leida, () =>
      activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/e.pdf`, p_updated_at: leida }),
    )
    expect(error?.message).toMatch(/cambió desde que la abriste/)
    expect((await estado(id)).estado).toBe('borrador')
    expect(await sql('select 1 from public.cotizacion_envios where cotizacion_id = $1', [id])).toHaveLength(0)
  })
})

describe('rechazar, reabrir y revertir', () => {
  it('rechazar y reabrir una de la app vuelve a borrador', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('rechazar_cotizacion', { p_id: id })).error).toBeNull()
    expect((await estado(id)).estado).toBe('rechazada')
    expect((await activo.client.rpc('reabrir_cotizacion', { p_id: id })).error).toBeNull()
    expect((await estado(id)).estado).toBe('borrador')
  })

  it('reabrir una cargada rechazada la devuelve a enviada (es lo que tiene el cliente)', async () => {
    const id = await imported()
    expect((await activo.client.rpc('rechazar_cotizacion', { p_id: id })).error).toBeNull()
    expect((await estado(id)).estado).toBe('rechazada')
    expect((await activo.client.rpc('reabrir_cotizacion', { p_id: id })).error).toBeNull()
    expect((await estado(id)).estado).toBe('enviada')
  })

  it('solo se reabre una rechazada', async () => {
    const draft = await nueva()
    expect((await activo.client.rpc('reabrir_cotizacion', { p_id: draft })).error?.message).toMatch(/Solo se puede reabrir/)
    expect((await estado(draft)).estado).toBe('borrador')

    const sent = await imported()
    expect((await activo.client.rpc('reabrir_cotizacion', { p_id: sent })).error?.message).toMatch(/Solo se puede reabrir/)
    expect((await estado(sent)).estado).toBe('enviada')
  })

  it('una aprobada no se puede rechazar', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/a.pdf`, p_updated_at: await version(id) })).error).toBeNull()
    expect((await activo.client.rpc('rechazar_cotizacion', { p_id: id })).error?.message).toMatch(/Solo se puede rechazar/)
  })

  it('revertir la aprobación vuelve a enviada si se había enviado, o a borrador', async () => {
    const sent = await nueva()
    expect((await activo.client.rpc('marcar_enviada', { p_id: sent, p_pdf_path: `cotizaciones/${sent}/e.pdf`, p_updated_at: await version(sent) })).error).toBeNull()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: sent, p_pdf_path: `cotizaciones/${sent}/a.pdf`, p_updated_at: await version(sent) })).error).toBeNull()
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: sent })).error).toBeNull()
    expect(await estado(sent)).toEqual({ estado: 'enviada', fecha_aprobacion: null, presupuesto_estado: null, pdf_aprobado_path: null })

    const direct = await nueva()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: direct, p_pdf_path: `cotizaciones/${direct}/a.pdf`, p_updated_at: await version(direct) })).error).toBeNull()
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: direct })).error).toBeNull()
    expect((await estado(direct)).estado).toBe('borrador')
  })

  it('revertir una cargada aprobada la devuelve a enviada', async () => {
    const id = await imported()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_fecha: '2026-10-25', p_updated_at: await version(id) })).error).toBeNull()
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: id })).error).toBeNull()
    expect(await estado(id)).toEqual({ estado: 'enviada', fecha_aprobacion: null, presupuesto_estado: null, pdf_aprobado_path: null })
  })

  it('una cargada aprobada por error se revierte y se borra para volver a cargarla', async () => {
    const id = await imported()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_fecha: '2026-10-25', p_updated_at: await version(id) })).error).toBeNull()
    expect((await activo.client.rpc('borrar_cotizacion', { p_id: id })).error?.message).toMatch(/primero revertí la aprobación/)
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: id })).error).toBeNull()
    expect((await activo.client.rpc('borrar_cotizacion', { p_id: id })).error).toBeNull()
    expect(await sql('select 1 from public.cotizaciones where id = $1', [id])).toHaveLength(0)
  })

  it('un presupuesto directo no se revierte: se anula desde el presupuesto', async () => {
    const [{ id }] = await sql<{ id: string }>(
      `insert into public.cotizaciones (origen, estado, cliente_id, formato, fecha, fecha_aprobacion, presupuesto_estado, asunto, notas)
       values ('directa', 'aprobada', $1, 'jornada', '2026-10-22', '2026-10-22', 'en_curso', 'Trabajo urgente', $2)
       returning id`,
      [ids.cliente_id, MARCA],
    )
    const { error } = await activo.client.rpc('revertir_aprobacion', { p_id: id })
    expect(error?.message).toMatch(/presupuesto directo/)
    expect(error?.message).toMatch(/anul/)
    expect(await estado(id)).toEqual({ estado: 'aprobada', fecha_aprobacion: '2026-10-22', presupuesto_estado: 'en_curso', pdf_aprobado_path: null })
  })
})
