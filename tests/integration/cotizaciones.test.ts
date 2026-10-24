// tests/integration/cotizaciones.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { adminClient, borrarUsuario, crearUsuario, sql } from './helpers'

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
  await adminClient().storage.from('documentos').remove([`pruebas/${MARCA}.pdf`])
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  for (const u of [activo, inactivo]) await borrarUsuario(u.id)
})

async function insertarComoPostgres(campos: Record<string, unknown> = {}) {
  const [fila] = await sql<{ id: string; numero: string }>(
    `insert into public.cotizaciones (cliente_id, formato, notas, estado, fecha_aprobacion, presupuesto_estado)
     values ($1, 'jornada', $2, $3, $4, $5) returning id, numero`,
    [ids.cliente_id, MARCA, campos.estado ?? 'borrador', campos.fecha_aprobacion ?? null, campos.presupuesto_estado ?? null],
  )
  return fila
}

describe('tablas de cotizaciones', () => {
  it('la app solo puede leer: insert directo rechazado', async () => {
    const { error } = await activo.client.from('cotizaciones').insert({ cliente_id: ids.cliente_id, formato: 'mensual' })
    expect(error?.code).toBe('42501')
  })

  it('un usuario activo ve cotizaciones; uno inactivo no', async () => {
    const { id } = await insertarComoPostgres()
    const visto = await activo.client.from('cotizaciones').select('id').eq('id', id)
    expect(visto.data).toHaveLength(1)
    const oculto = await inactivo.client.from('cotizaciones').select('id').eq('id', id)
    expect(oculto.data).toEqual([])
  })

  it('el número arranca en la numeración real y es correlativo', async () => {
    const a = await insertarComoPostgres()
    const b = await insertarComoPostgres()
    expect(Number(a.numero)).toBeGreaterThanOrEqual(112712)
    expect(Number(b.numero)).toBe(Number(a.numero) + 1)
  })

  it('una aprobada exige fecha de aprobación y estado de presupuesto', async () => {
    await expect(insertarComoPostgres({ estado: 'aprobada' })).rejects.toThrow()
    await expect(
      insertarComoPostgres({ estado: 'aprobada', fecha_aprobacion: '2026-10-22', presupuesto_estado: 'en_curso' }),
    ).resolves.toBeTruthy()
  })

  it('una aprobada no se puede modificar (salvo estado del presupuesto y notas) ni tocar sus ítems', async () => {
    const { id } = await insertarComoPostgres({ estado: 'aprobada', fecha_aprobacion: '2026-10-22', presupuesto_estado: 'en_curso' })

    await expect(sql(`update public.cotizaciones set asunto = 'cambio' where id = $1`, [id])).rejects.toThrow(/aprobada/)
    await expect(
      sql(`insert into public.cotizacion_items (cotizacion_id, orden, descripcion, unidad) values ($1, 1, 'x', 'HORA')`, [id]),
    ).rejects.toThrow(/aprobada/)

    await sql(`update public.cotizaciones set presupuesto_estado = 'finalizado' where id = $1`, [id])
    const [fila] = await sql<{ presupuesto_estado: string }>('select presupuesto_estado from public.cotizaciones where id = $1', [id])
    expect(fila.presupuesto_estado).toBe('finalizado')
  })

  it('el total de cada ítem se calcula en la base', async () => {
    const { id } = await insertarComoPostgres()
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
    const ruta = `pruebas/${MARCA}.pdf`
    const pdf = new Blob(['%PDF-1.4 prueba'], { type: 'application/pdf' })

    const subida = await activo.client.storage.from('documentos').upload(ruta, pdf)
    expect(subida.error).toBeNull()
    const descarga = await activo.client.storage.from('documentos').download(ruta)
    expect(descarga.error).toBeNull()

    const rechazada = await inactivo.client.storage.from('documentos').upload(`pruebas/${MARCA}-b.pdf`, pdf)
    expect(rechazada.error).not.toBeNull()

    const pisada = await activo.client.storage.from('documentos').upload(ruta, pdf, { upsert: true })
    expect(pisada.error).not.toBeNull()
  })
})

describe('guardar, duplicar y borrar', () => {
  function datosBase(extra: Record<string, unknown> = {}) {
    return {
      cliente_id: ids.cliente_id,
      formato: 'jornada',
      equipo_id: ids.equipo_id,
      firmante_id: ids.firmante_id,
      plantilla_id: ids.plantilla_jornada_id,
      asunto: 'Cotización N° {{numero}}',
      datos: { ubicacion: 'Ruta 7 y Ruta 5, Neuquén' },
      bloques: [{ titulo: 'Alcance', contenido: '- Equipo' }],
      notas: MARCA,
      ...extra,
    }
  }

  it('crea una cotización con sus ítems y registra quién la creó', async () => {
    const { data: id, error } = await activo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: ITEMS_JORNADA })
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
    const { data: id } = await activo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: ITEMS_JORNADA })
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id!,
      p_datos: datosBase({ asunto: 'Nuevo asunto' }),
      p_items: [ITEMS_JORNADA[0]],
    })
    expect(error).toBeNull()
    const [fila] = await sql<{ asunto: string; items: string }>(
      `select asunto, (select count(*) from public.cotizacion_items where cotizacion_id = $1) as items
       from public.cotizaciones where id = $1`,
      [id],
    )
    expect(fila).toEqual({ asunto: 'Nuevo asunto', items: '1' })
  })

  it('rechaza un contacto de otro cliente', async () => {
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_datos: datosBase({ contacto_id: ids.contacto_id }),
      p_items: [],
    })
    expect(error?.message).toMatch(/no pertenece al cliente/)
  })

  it('un usuario inactivo no puede guardar', async () => {
    const { error } = await inactivo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: [] })
    expect(error?.code).toBe('42501')
  })

  it('una aprobada no se puede editar por RPC', async () => {
    const { id } = await insertarComoPostgres({ estado: 'aprobada', fecha_aprobacion: '2026-10-22', presupuesto_estado: 'en_curso' })
    const { error } = await activo.client.rpc('guardar_cotizacion', { p_id: id, p_datos: datosBase(), p_items: [] })
    expect(error?.message).toMatch(/ya no se puede editar/)
  })

  it('duplicar con el mismo cliente enlaza la renegociación y copia ítems con precios', async () => {
    const { data: original } = await activo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: ITEMS_JORNADA })
    const { data: copia, error } = await activo.client.rpc('duplicar_cotizacion', { p_id: original! })
    expect(error).toBeNull()
    await sql('update public.cotizaciones set notas = $1 where id = $2', [MARCA, copia])

    const [fila] = await sql<{ reemplaza_a: string; estado: string }>(
      'select reemplaza_a, estado from public.cotizaciones where id = $1',
      [copia],
    )
    expect(fila).toEqual({ reemplaza_a: original, estado: 'borrador' })
    const precios = await sql<{ precio_unitario: string }>(
      'select precio_unitario from public.cotizacion_items where cotizacion_id = $1 order by orden',
      [copia],
    )
    expect(precios.map((p) => Number(p.precio_unitario))).toEqual([1950000, 2800000, 2530000])
  })

  it('duplicar para otro cliente no copia contacto ni enlaza', async () => {
    const { data: original } = await activo.client.rpc('guardar_cotizacion', {
      p_datos: datosBase({ cliente_id: ids.cliente_con_contacto_id, contacto_id: ids.contacto_id }),
      p_items: ITEMS_JORNADA,
    })
    const { data: copia } = await activo.client.rpc('duplicar_cotizacion', { p_id: original!, p_cliente_id: ids.cliente_id })
    await sql('update public.cotizaciones set notas = $1 where id = $2', [MARCA, copia])
    const [fila] = await sql<{ contacto_id: string | null; reemplaza_a: string | null; cliente_id: string }>(
      'select contacto_id, reemplaza_a, cliente_id from public.cotizaciones where id = $1',
      [copia],
    )
    expect(fila).toEqual({ contacto_id: null, reemplaza_a: null, cliente_id: ids.cliente_id })
  })

  it('solo se borran borradores', async () => {
    const { data: id } = await activo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: [] })
    expect((await activo.client.rpc('borrar_cotizacion', { p_id: id! })).error).toBeNull()

    const { id: enviada } = await insertarComoPostgres({ estado: 'enviada' })
    const { error } = await activo.client.rpc('borrar_cotizacion', { p_id: enviada })
    expect(error?.message).toMatch(/Solo se pueden borrar/)
  })

  it('un borrador que ya se envió (reabierto) o una importada no se borra y conserva su historial', async () => {
    const { id: reabierta } = await insertarComoPostgres()
    await sql('insert into public.cotizacion_envios (cotizacion_id, pdf_path) values ($1, $2)', [
      reabierta,
      `cotizaciones/${reabierta}/e.pdf`,
    ])
    const { error } = await activo.client.rpc('borrar_cotizacion', { p_id: reabierta })
    expect(error?.message).toMatch(/ya se envió no se puede borrar/)
    const [fila] = await sql<{ envios: string }>(
      'select count(*) as envios from public.cotizacion_envios where cotizacion_id = $1',
      [reabierta],
    )
    expect(fila.envios).toBe('1')

    const [{ id: importada }] = await sql<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, formato, notas, origen, archivo_original_path)
       values ($1, 'jornada', $2, 'importada', 'importadas/prueba/original.pdf') returning id`,
      [ids.cliente_id, MARCA],
    )
    const borrarImportada = await activo.client.rpc('borrar_cotizacion', { p_id: importada })
    expect(borrarImportada.error?.message).toMatch(/ya se envió no se puede borrar/)
  })
})
