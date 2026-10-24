// tests/integration/cotizaciones-servicio.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ErrorCotizacion, aprobarCotizacion, enviarCotizacion, pdfParaMostrar } from '@/lib/cotizaciones/servicio'
import type { Json } from '@/lib/supabase/database.types'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { adminClient, borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>
const rutas: string[] = []

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  const archivos = await sql<{ name: string }>(
    `select o.name from storage.objects o
     where o.bucket_id = 'documentos'
       and (o.name = any($1) or exists (
         select 1 from public.cotizaciones c where c.notas = $2 and o.name like 'cotizaciones/' || c.id || '/%'))`,
    [rutas, MARCA],
  )
  if (archivos.length) await adminClient().storage.from('documentos').remove(archivos.map((a) => a.name))
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await borrarUsuario(activo.id)
})

async function nueva(datos: Record<string, unknown> = {}, items: Json[] = ITEMS_JORNADA): Promise<string> {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', {
    p_datos: {
      cliente_id: ids.cliente_id,
      formato: 'jornada',
      equipo_id: ids.equipo_id,
      firmante_id: ids.firmante_id,
      fecha: '2026-10-22',
      asunto: 'Cotización N° {{numero}} capacidad {{capacidad}} TN',
      intro: 'Servicios de izaje en {{ubicacion}}.',
      datos: { ubicacion: 'Ruta 7 y Ruta 5, Neuquén' },
      bloques: [{ titulo: 'Alcance', contenido: '- Horario de 8 a 17 hs.' }],
      notas: MARCA,
      ...datos,
    },
    p_items: items,
  })
  if (error) throw error
  return data
}

async function numero(id: string) {
  const [fila] = await sql<{ numero: string }>('select numero from public.cotizaciones where id = $1', [id])
  return fila.numero
}

async function subidos(id: string) {
  return sql<{ name: string }>(`select name from storage.objects where name like $1 order by name`, [`cotizaciones/${id}/%`])
}

/** Exige que la operación se rechace con un ErrorCotizacion (mensaje para el usuario) con ese texto. */
async function rechazaCon(operacion: Promise<unknown>, mensaje: string) {
  const error = await operacion.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ErrorCotizacion)
  expect((error as Error).message).toBe(mensaje)
}

describe('servicio de cotizaciones', () => {
  it('enviar sube el PDF y registra el envío', async () => {
    const id = await nueva()
    await enviarCotizacion(activo.client, id)

    const [envio] = await sql<{ pdf_path: string }>('select pdf_path from public.cotizacion_envios where cotizacion_id = $1', [id])
    expect(envio.pdf_path).toMatch(new RegExp(`^cotizaciones/${id}/enviada-\\d+\\.pdf$`))
    const { data, error } = await activo.client.storage.from('documentos').download(envio.pdf_path)
    expect(error).toBeNull()
    expect(Buffer.from(await data!.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('no envía si faltan variables, dice cuáles y no sube nada', async () => {
    const id = await nueva({ datos: {} })
    await expect(enviarCotizacion(activo.client, id)).rejects.toThrow(ErrorCotizacion)
    await expect(enviarCotizacion(activo.client, id)).rejects.toThrow(/Lugar del servicio/)
    const subidos = await sql(`select 1 from storage.objects where name like $1`, [`cotizaciones/${id}/%`])
    expect(subidos).toEqual([])
  })

  it('no envía ni aprueba con variables mal escritas, dice cuáles y no sube nada', async () => {
    const id = await nueva({
      intro: 'Servicios de izaje en {{ubicación}}.',
      bloques: [{ titulo: 'Alcance', contenido: '- Pago: {{forma**_pago}}' }],
    })
    await expect(enviarCotizacion(activo.client, id)).rejects.toThrow(ErrorCotizacion)
    await expect(enviarCotizacion(activo.client, id)).rejects.toThrow(
      'Hay variables mal escritas: {{ubicación}}, {{forma**_pago}}',
    )
    await expect(aprobarCotizacion(activo.client, id, '2026-10-23')).rejects.toThrow('{{ubicación}}')

    const [fila] = await sql<{ estado: string }>('select estado from public.cotizaciones where id = $1', [id])
    expect(fila.estado).toBe('borrador')
    const subidos = await sql(`select 1 from storage.objects where name like $1`, [`cotizaciones/${id}/%`])
    expect(subidos).toEqual([])
  })

  // Lo que la base rechazaría se frena antes de generar el PDF: un PDF subido no se puede borrar desde la app.
  it('no envía ni aprueba sin ítems o con ítems sin precio, y no sube nada', async () => {
    const sinItems = await nueva({}, [])
    const sinPrecio = await nueva({}, [ITEMS_JORNADA[0], { ...ITEMS_JORNADA[1], precio_unitario: null }])

    await rechazaCon(enviarCotizacion(activo.client, sinItems), 'La cotización no tiene ítems')
    await rechazaCon(aprobarCotizacion(activo.client, sinItems, '2026-10-23'), 'La cotización no tiene ítems')
    await rechazaCon(enviarCotizacion(activo.client, sinPrecio), 'Hay ítems sin precio')
    await rechazaCon(aprobarCotizacion(activo.client, sinPrecio, '2026-10-23'), 'Hay ítems sin precio')

    expect(await subidos(sinItems)).toEqual([])
    expect(await subidos(sinPrecio)).toEqual([])
  })

  it('no aprueba con una fecha inválida o anterior a la de la cotización, y no sube nada', async () => {
    const id = await nueva()

    await rechazaCon(aprobarCotizacion(activo.client, id, '2026-10-21'), 'La fecha de aprobación no puede ser anterior a la cotización')
    await rechazaCon(aprobarCotizacion(activo.client, id, ''), 'La fecha de aprobación no es válida')
    await rechazaCon(aprobarCotizacion(activo.client, id, '2026-11-31'), 'La fecha de aprobación no es válida')

    const [fila] = await sql<{ estado: string }>('select estado from public.cotizaciones where id = $1', [id])
    expect(fila.estado).toBe('borrador')
    expect(await subidos(id)).toEqual([])
  })

  it('no envía ni vuelve a aprobar una aprobada, no envía un presupuesto directo, y no sube nada más', async () => {
    const id = await nueva()
    await aprobarCotizacion(activo.client, id, '2026-10-23')
    const antes = await subidos(id)
    expect(antes).toHaveLength(1)

    await rechazaCon(enviarCotizacion(activo.client, id), 'Solo se puede enviar una cotización en borrador o ya enviada')
    await rechazaCon(aprobarCotizacion(activo.client, id, '2026-10-23'), 'Solo se puede aprobar una cotización en borrador o enviada')
    expect(await subidos(id)).toEqual(antes)

    const { data: directo, error } = await activo.client.rpc('presupuesto_directo', {
      p_datos: { cliente_id: ids.cliente_id, asunto: 'Izaje urgente acordado por teléfono', notas: MARCA },
      p_items: [ITEMS_JORNADA[0]],
    })
    expect(error).toBeNull()
    await rechazaCon(enviarCotizacion(activo.client, directo!), 'Solo se puede enviar una cotización en borrador o ya enviada')
    expect(await subidos(directo!)).toEqual([])
  })

  it('aprobar congela el PDF y después se sirve ese mismo archivo', async () => {
    const id = await nueva()
    await aprobarCotizacion(activo.client, id, '2026-10-23')

    const [fila] = await sql<{ estado: string; pdf_aprobado_path: string }>(
      'select estado, pdf_aprobado_path from public.cotizaciones where id = $1',
      [id],
    )
    expect(fila.estado).toBe('aprobada')

    const guardado = await activo.client.storage.from('documentos').download(fila.pdf_aprobado_path)
    const mostrado = await pdfParaMostrar(activo.client, id)
    expect(mostrado?.nombreArchivo).toBe(`COTIZACION N° ${await numero(id)} VERTICE.pdf`)
    expect(Buffer.compare(mostrado!.pdf, Buffer.from(await guardado.data!.arrayBuffer()))).toBe(0)
  })

  it('una cotización cargada se aprueba sin generar PDF y se sigue mostrando su original', async () => {
    const ruta = `importadas/${crypto.randomUUID()}.pdf`
    rutas.push(ruta)
    const original = Buffer.from('%PDF-1.4 original cargado')
    const subida = await activo.client.storage.from('documentos').upload(ruta, original, { contentType: 'application/pdf' })
    expect(subida.error).toBeNull()

    const { data: id, error } = await activo.client.rpc('importar_cotizacion', {
      p_datos: {
        numero: 100000 + Math.floor(Math.random() * 9000),
        cliente_id: ids.cliente_id,
        formato: 'jornada',
        fecha: '2026-10-01',
        estado: 'enviada',
        archivo_original_path: ruta,
        notas: MARCA,
      },
    })
    expect(error).toBeNull()

    await expect(enviarCotizacion(activo.client, id!)).rejects.toThrow(/cargada/)
    await aprobarCotizacion(activo.client, id!, '2026-10-02')

    const [fila] = await sql<{ estado: string; pdf_aprobado_path: string | null }>(
      'select estado, pdf_aprobado_path from public.cotizaciones where id = $1',
      [id],
    )
    expect(fila).toEqual({ estado: 'aprobada', pdf_aprobado_path: null })
    const mostrado = await pdfParaMostrar(activo.client, id!)
    expect(Buffer.compare(mostrado!.pdf, original)).toBe(0)
  })

  it('un borrador se genera en el momento; una cotización inexistente devuelve null', async () => {
    const id = await nueva()
    const mostrado = await pdfParaMostrar(activo.client, id)
    expect(mostrado?.pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(await pdfParaMostrar(activo.client, crypto.randomUUID())).toBeNull()
  })

  it('se puede ver el PDF de un envío anterior', async () => {
    const id = await nueva()
    await enviarCotizacion(activo.client, id)
    const [envio] = await sql<{ id: string }>('select id from public.cotizacion_envios where cotizacion_id = $1', [id])
    const mostrado = await pdfParaMostrar(activo.client, id, envio.id)
    expect(mostrado?.pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
