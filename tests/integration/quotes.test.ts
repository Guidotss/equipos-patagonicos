// tests/integration/cotizaciones.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ITEMS_DAILY, idsOfExample, versionOf } from './quotes-helpers'
import { adminClient, removeUser, crearUser, sql } from './helpers'

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
  await adminClient().storage.from('documentos').remove([`pruebas/${MARCA}.pdf`])
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  for (const u of [activo, inactivo]) await removeUser(u.id)
})

async function insertComoPostgres(fields: Record<string, unknown> = {}) {
  const [row] = await sql<{ id: string; numero: string }>(
    `insert into public.cotizaciones (cliente_id, formato, notas, estado, fecha_aprobacion, presupuesto_estado)
     values ($1, 'jornada', $2, $3, $4, $5) returning id, numero`,
    [ids.cliente_id, MARCA, fields.estado ?? 'borrador', fields.fecha_aprobacion ?? null, fields.presupuesto_estado ?? null],
  )
  return row
}

describe('tablas de cotizaciones', () => {
  it('la app solo puede leer: insert directo rechazado', async () => {
    const { error } = await activo.client.from('cotizaciones').insert({ cliente_id: ids.cliente_id, formato: 'mensual' })
    expect(error?.code).toBe('42501')
  })

  it('un usuario activo ve cotizaciones; uno inactivo no', async () => {
    const { id } = await insertComoPostgres()
    const visto = await activo.client.from('cotizaciones').select('id').eq('id', id)
    expect(visto.data).toHaveLength(1)
    const hidden = await inactivo.client.from('cotizaciones').select('id').eq('id', id)
    expect(hidden.data).toEqual([])
  })

  it('el número arranca en la numeración real y es correlativo', async () => {
    const a = await insertComoPostgres()
    const b = await insertComoPostgres()
    expect(Number(a.numero)).toBeGreaterThanOrEqual(112712)
    expect(Number(b.numero)).toBe(Number(a.numero) + 1)
  })

  it('una aprobada exige fecha de aprobación y estado de presupuesto', async () => {
    await expect(insertComoPostgres({ estado: 'aprobada' })).rejects.toThrow()
    await expect(
      insertComoPostgres({ estado: 'aprobada', fecha_aprobacion: '2026-10-22', presupuesto_estado: 'en_curso' }),
    ).resolves.toBeTruthy()
  })

  it('una aprobada no se puede modificar (salvo estado del presupuesto y notas) ni tocar sus ítems', async () => {
    const { id } = await insertComoPostgres({ estado: 'aprobada', fecha_aprobacion: '2026-10-22', presupuesto_estado: 'en_curso' })

    await expect(sql(`update public.cotizaciones set asunto = 'cambio' where id = $1`, [id])).rejects.toThrow(/aprobada/)
    await expect(
      sql(`insert into public.cotizacion_items (cotizacion_id, orden, descripcion, unidad) values ($1, 1, 'x', 'HORA')`, [id]),
    ).rejects.toThrow(/aprobada/)

    await sql(`update public.cotizaciones set presupuesto_estado = 'finalizado' where id = $1`, [id])
    const [row] = await sql<{ presupuesto_estado: string }>('select presupuesto_estado from public.cotizaciones where id = $1', [id])
    expect(row.presupuesto_estado).toBe('finalizado')
  })

  it('el total de cada ítem se calcula en la base', async () => {
    const { id } = await insertComoPostgres()
    await sql(
      `insert into public.cotizacion_items (cotizacion_id, orden, descripcion, cantidad, precio_unitario, unidad)
       values ($1, 1, 'Jornada', 2, 1950000.5, 'JORNADA')`,
      [id],
    )
    const [item] = await sql<{ total: string }>('select total from public.cotizacion_items where cotizacion_id = $1', [id])
    expect(Number(item.total)).toBe(3900001)
  })

  it('v_cotizaciones marca como vencida una enviada fuera de validez', async () => {
    const [{ id }] = await sql<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, formato, notas, estado, fecha, validez_dias)
       values ($1, 'jornada', $2, 'enviada', current_date - 40, 30) returning id`,
      [ids.cliente_id, MARCA],
    )
    const { data } = await activo.client.from('v_cotizaciones').select('vencida, cliente_razon_social').eq('id', id).single()
    expect(data).toEqual({ vencida: true, cliente_razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.' })
  })

  it('el bucket documentos existe, es privado y solo acepta PDF/JPG/PNG de hasta 10 MB', async () => {
    const [bucket] = await sql<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'documentos'`,
    )
    expect(bucket.public).toBe(false)
    expect(Number(bucket.file_size_limit)).toBe(10485760)
    expect(bucket.allowed_mime_types.sort()).toEqual(['application/pdf', 'image/jpeg', 'image/png'])
  })

  it('un usuario activo sube y lee archivos del bucket; uno inactivo no; nadie pisa', async () => {
    const path = `pruebas/${MARCA}.pdf`
    const pdf = new Blob(['%PDF-1.4 prueba'], { type: 'application/pdf' })

    const upload = await activo.client.storage.from('documentos').upload(path, pdf)
    expect(upload.error).toBeNull()
    const download = await activo.client.storage.from('documentos').download(path)
    expect(download.error).toBeNull()

    const rejected = await inactivo.client.storage.from('documentos').upload(`pruebas/${MARCA}-b.pdf`, pdf)
    expect(rejected.error).not.toBeNull()

    const pisada = await activo.client.storage.from('documentos').upload(path, pdf, { upsert: true })
    expect(pisada.error).not.toBeNull()
  })
})

describe('guardar, duplicar y borrar', () => {
  function dataBase(extra: Record<string, unknown> = {}) {
    return {
      cliente_id: ids.cliente_id,
      formato: 'jornada',
      equipo_id: ids.equipo_id,
      firmante_id: ids.firmante_id,
      plantilla_id: ids.template_daily_id,
      asunto: 'Cotización N° {{numero}}',
      datos: { ubicacion: 'Ruta 7 y Ruta 5, Neuquén' },
      bloques: [{ titulo: 'Alcance', contenido: '- Equipo' }],
      notas: MARCA,
      ...extra,
    }
  }

  it('crea una cotización con sus ítems y registra quién la creó', async () => {
    const { data: id, error } = await activo.client.rpc('guardar_cotizacion', { p_datos: dataBase(), p_items: ITEMS_DAILY })
    expect(error).toBeNull()

    const [cabecera] = await sql<{ estado: string; created_by: string; origen: string }>(
      'select estado, created_by, origen from public.cotizaciones where id = $1',
      [id],
    )
    expect(cabecera).toEqual({ estado: 'borrador', created_by: activo.id, origen: 'app' })

    const items = await sql<{ orden: number }>(
      'select orden from public.cotizacion_items where cotizacion_id = $1 order by orden',
      [id],
    )
    expect(items.map((i) => i.orden)).toEqual([1, 2, 3])
  })

  it('al guardar de nuevo reemplaza los ítems', async () => {
    const { data: id } = await activo.client.rpc('guardar_cotizacion', { p_datos: dataBase(), p_items: ITEMS_DAILY })
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id!,
      p_updated_at: await versionOf(activo.client, id!),
      p_datos: dataBase({ asunto: 'Nuevo asunto' }),
      p_items: [ITEMS_DAILY[0]],
    })
    expect(error).toBeNull()
    const [row] = await sql<{ asunto: string; items: string }>(
      `select asunto, (select count(*) from public.cotizacion_items where cotizacion_id = $1) as items
       from public.cotizaciones where id = $1`,
      [id],
    )
    expect(row).toEqual({ asunto: 'Nuevo asunto', items: '1' })
  })

  it('rechaza un contacto de otro cliente', async () => {
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_datos: dataBase({ contacto_id: ids.contacto_id }),
      p_items: [],
    })
    expect(error?.message).toMatch(/no pertenece al cliente/)
  })

  it('un usuario inactivo no puede guardar', async () => {
    const { error } = await inactivo.client.rpc('guardar_cotizacion', { p_datos: dataBase(), p_items: [] })
    expect(error?.code).toBe('42501')
  })

  it('una aprobada no se puede editar por RPC', async () => {
    const { id } = await insertComoPostgres({ estado: 'aprobada', fecha_aprobacion: '2026-10-22', presupuesto_estado: 'en_curso' })
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_updated_at: await versionOf(activo.client, id),
      p_datos: dataBase(),
      p_items: [],
    })
    expect(error?.message).toMatch(/ya no se puede editar/)
  })

  it('una cargada (importada) no se edita: su documento es el PDF original', async () => {
    const [{ id }] = await sql<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, formato, notas, origen, estado, asunto, archivo_original_path)
       values ($1, 'jornada', $2, 'importada', 'enviada', 'Asunto original', 'importadas/prueba/original.pdf') returning id`,
      [ids.cliente_id, MARCA],
    )
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_updated_at: await versionOf(activo.client, id),
      p_datos: dataBase({ asunto: 'Otro asunto' }),
      p_items: ITEMS_DAILY,
    })
    expect(error?.message).toMatch(/ya no se puede editar/)

    const [row] = await sql<{ estado: string; asunto: string; equipo_id: string | null; items: string }>(
      `select estado, asunto, equipo_id, (select count(*) from public.cotizacion_items where cotizacion_id = $1) as items
       from public.cotizaciones where id = $1`,
      [id],
    )
    expect(row).toEqual({ estado: 'enviada', asunto: 'Asunto original', equipo_id: null, items: '0' })
  })

  it('duplicar con el mismo cliente enlaza la renegociación y copia ítems con precios', async () => {
    const { data: original } = await activo.client.rpc('guardar_cotizacion', { p_datos: dataBase(), p_items: ITEMS_DAILY })
    const { data: copy, error } = await activo.client.rpc('duplicar_cotizacion', { p_id: original! })
    expect(error).toBeNull()
    await sql('update public.cotizaciones set notas = $1 where id = $2', [MARCA, copy])

    const [row] = await sql<{ reemplaza_a: string; estado: string }>(
      'select reemplaza_a, estado from public.cotizaciones where id = $1',
      [copy],
    )
    expect(row).toEqual({ reemplaza_a: original, estado: 'borrador' })
    const prices = await sql<{ precio_unitario: string }>(
      'select precio_unitario from public.cotizacion_items where cotizacion_id = $1 order by orden',
      [copy],
    )
    expect(prices.map((p) => Number(p.precio_unitario))).toEqual([1950000, 2800000, 2530000])
  })

  it('duplicar para otro cliente no copia contacto ni enlaza', async () => {
    const { data: original } = await activo.client.rpc('guardar_cotizacion', {
      p_datos: dataBase({ cliente_id: ids.client_with_contact_id, contacto_id: ids.contacto_id }),
      p_items: ITEMS_DAILY,
    })
    const { data: copy } = await activo.client.rpc('duplicar_cotizacion', { p_id: original!, p_cliente_id: ids.cliente_id })
    await sql('update public.cotizaciones set notas = $1 where id = $2', [MARCA, copy])
    const [row] = await sql<{ contacto_id: string | null; reemplaza_a: string | null; cliente_id: string }>(
      'select contacto_id, reemplaza_a, cliente_id from public.cotizaciones where id = $1',
      [copy],
    )
    expect(row).toEqual({ contacto_id: null, reemplaza_a: null, cliente_id: ids.cliente_id })
  })

  it('solo se borran borradores', async () => {
    const { data: id } = await activo.client.rpc('guardar_cotizacion', { p_datos: dataBase(), p_items: [] })
    expect((await activo.client.rpc('borrar_cotizacion', { p_id: id! })).error).toBeNull()

    const { id: sent } = await insertComoPostgres({ estado: 'enviada' })
    const { error } = await activo.client.rpc('borrar_cotizacion', { p_id: sent })
    expect(error?.message).toMatch(/Solo se pueden borrar/)
  })

  it('un borrador que ya se envió (reabierto) no se borra y conserva su historial', async () => {
    const { id: reabierta } = await insertComoPostgres()
    await sql('insert into public.cotizacion_envios (cotizacion_id, pdf_path) values ($1, $2)', [
      reabierta,
      `cotizaciones/${reabierta}/e.pdf`,
    ])
    const { error } = await activo.client.rpc('borrar_cotizacion', { p_id: reabierta })
    expect(error?.message).toMatch(/ya se envió no se puede borrar/)
    const [row] = await sql<{ envios: string }>(
      'select count(*) as envios from public.cotizacion_envios where cotizacion_id = $1',
      [reabierta],
    )
    expect(row.envios).toBe('1')
  })

  it('una cargada mal se borra (para volver a cargarla) mientras no esté aprobada', async () => {
    async function cargada(estado: 'enviada' | 'rechazada' | 'aprobada') {
      const approved = estado === 'aprobada'
      const [{ id }] = await sql<{ id: string }>(
        `insert into public.cotizaciones
           (cliente_id, formato, notas, origen, estado, fecha_aprobacion, presupuesto_estado, archivo_original_path)
         values ($1, 'jornada', $2, 'importada', $3, $4, $5, 'importadas/prueba/original.pdf') returning id`,
        [ids.cliente_id, MARCA, estado, approved ? '2026-10-22' : null, approved ? 'en_curso' : null],
      )
      return id
    }
    const exists = async (id: string) => (await sql('select 1 from public.cotizaciones where id = $1', [id])).length === 1

    for (const estado of ['enviada', 'rechazada'] as const) {
      const id = await cargada(estado)
      expect((await activo.client.rpc('borrar_cotizacion', { p_id: id })).error).toBeNull()
      expect(await exists(id)).toBe(false)
    }

    const approved = await cargada('aprobada')
    const { error } = await activo.client.rpc('borrar_cotizacion', { p_id: approved })
    expect(error?.message).toMatch(/primero revertí la aprobación/)
    expect(await exists(approved)).toBe(true)
  })
})
