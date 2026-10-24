// tests/integration/cotizaciones.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsDeEjemplo } from './cotizaciones-helpers'
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
