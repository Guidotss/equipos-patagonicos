// tests/integration/cotizaciones-servicio.test.ts
import { extractText, getDocumentProxy } from 'unpdf'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ErrorQuote, approveQuote, sendQuote, pdfForShow } from '@/lib/quotes/service'
import type { Json } from '@/lib/supabase/database.types'
import { ITEMS_DAILY, idsOfExample, versionOf } from './quotes-helpers'
import { adminClient, removeUser, crearUser, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUser>>
let ids: Awaited<ReturnType<typeof idsOfExample>>
const paths: string[] = []

beforeAll(async () => {
  activo = await crearUser({ activo: true, rol: 'operador' })
  ids = await idsOfExample()
})

afterAll(async () => {
  const archivos = await sql<{ name: string }>(
    `select o.name from storage.objects o
     where o.bucket_id = 'documentos'
       and (o.name = any($1) or exists (
         select 1 from public.cotizaciones c where c.notas = $2 and o.name like 'cotizaciones/' || c.id || '/%'))`,
    [paths, MARCA],
  )
  if (archivos.length) await adminClient().storage.from('documentos').remove(archivos.map((a) => a.name))
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await removeUser(activo.id)
})

async function nueva(datos: Record<string, unknown> = {}, items: Json[] = ITEMS_DAILY): Promise<string> {
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

/** Guarda la cotización con otra introducción (sigue en el estado en que estaba). */
async function edit(id: string, intro: string) {
  const [row] = await sql<{ datos: Json }>('select datos from public.cotizaciones where id = $1', [id])
  const { error } = await activo.client.rpc('guardar_cotizacion', {
    p_id: id,
    p_updated_at: await versionOf(activo.client, id),
    p_datos: {
      cliente_id: ids.cliente_id,
      formato: 'jornada',
      equipo_id: ids.equipo_id,
      firmante_id: ids.firmante_id,
      asunto: 'Cotización N° {{numero}} capacidad {{capacidad}} TN',
      intro,
      datos: row.datos,
      bloques: [{ titulo: 'Alcance', contenido: '- Horario de 8 a 17 hs.' }],
      notas: MARCA,
    },
    p_items: ITEMS_DAILY,
  })
  if (error) throw error
}

async function textOfPdf(pdf: Buffer): Promise<string> {
  const document = await getDocumentProxy(new Uint8Array(pdf))
  const { text } = await extractText(document, { mergePages: true })
  return text.replace(/\s+/g, ' ')
}

async function numero(id: string) {
  const [row] = await sql<{ numero: string }>('select numero from public.cotizaciones where id = $1', [id])
  return row.numero
}

async function subidos(id: string) {
  return sql<{ name: string }>(`select name from storage.objects where name like $1 order by name`, [`cotizaciones/${id}/%`])
}

/** Exige que la operación se rechace con un ErrorCotizacion (mensaje para el usuario) con ese texto. */
async function rechazaWith(operacion: Promise<unknown>, message: string) {
  const error = await operacion.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ErrorQuote)
  expect((error as Error).message).toBe(message)
}

describe('servicio de cotizaciones', () => {
  it('enviar sube el PDF y registra el envío', async () => {
    const id = await nueva()
    await sendQuote(activo.client, id)

    const [envio] = await sql<{ pdf_path: string }>('select pdf_path from public.cotizacion_envios where cotizacion_id = $1', [id])
    expect(envio.pdf_path).toMatch(new RegExp(`^cotizaciones/${id}/enviada-\\d+\\.pdf$`))
    const { data, error } = await activo.client.storage.from('documentos').download(envio.pdf_path)
    expect(error).toBeNull()
    expect(Buffer.from(await data!.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('no envía si faltan variables, dice cuáles y no sube nada', async () => {
    const id = await nueva({ datos: {} })
    await expect(sendQuote(activo.client, id)).rejects.toThrow(ErrorQuote)
    await expect(sendQuote(activo.client, id)).rejects.toThrow(/Lugar del servicio/)
    const subidos = await sql(`select 1 from storage.objects where name like $1`, [`cotizaciones/${id}/%`])
    expect(subidos).toEqual([])
  })

  it('no envía ni aprueba con variables mal escritas, dice cuáles y no sube nada', async () => {
    const id = await nueva({
      intro: 'Servicios de izaje en {{ubicación}}.',
      bloques: [{ titulo: 'Alcance', contenido: '- Pago: {{forma**_pago}}' }],
    })
    await expect(sendQuote(activo.client, id)).rejects.toThrow(ErrorQuote)
    await expect(sendQuote(activo.client, id)).rejects.toThrow(
      'Hay variables mal escritas: {{ubicación}}, {{forma**_pago}}',
    )
    await expect(approveQuote(activo.client, id, '2026-10-23')).rejects.toThrow('{{ubicación}}')

    const [row] = await sql<{ estado: string }>('select estado from public.cotizaciones where id = $1', [id])
    expect(row.estado).toBe('borrador')
    const subidos = await sql(`select 1 from storage.objects where name like $1`, [`cotizaciones/${id}/%`])
    expect(subidos).toEqual([])
  })

  // Lo que la base rechazaría se frena antes de generar el PDF: un PDF subido no se puede borrar desde la app.
  it('no envía ni aprueba sin ítems o con ítems sin precio, y no sube nada', async () => {
    const withoutItems = await nueva({}, [])
    const withoutPrice = await nueva({}, [ITEMS_DAILY[0], { ...ITEMS_DAILY[1], precio_unitario: null }])

    await rechazaWith(sendQuote(activo.client, withoutItems), 'La cotización no tiene ítems')
    await rechazaWith(approveQuote(activo.client, withoutItems, '2026-10-23'), 'La cotización no tiene ítems')
    await rechazaWith(sendQuote(activo.client, withoutPrice), 'Hay ítems sin precio')
    await rechazaWith(approveQuote(activo.client, withoutPrice, '2026-10-23'), 'Hay ítems sin precio')

    expect(await subidos(withoutItems)).toEqual([])
    expect(await subidos(withoutPrice)).toEqual([])
  })

  it('no aprueba con una fecha inválida o anterior a la de la cotización, y no sube nada', async () => {
    const id = await nueva()

    await rechazaWith(approveQuote(activo.client, id, '2026-10-21'), 'La fecha de aprobación no puede ser anterior a la cotización')
    await rechazaWith(approveQuote(activo.client, id, ''), 'La fecha de aprobación no es válida')
    await rechazaWith(approveQuote(activo.client, id, '2026-11-31'), 'La fecha de aprobación no es válida')

    const [row] = await sql<{ estado: string }>('select estado from public.cotizaciones where id = $1', [id])
    expect(row.estado).toBe('borrador')
    expect(await subidos(id)).toEqual([])
  })

  it('no envía ni vuelve a aprobar una aprobada, no envía un presupuesto directo, y no sube nada más', async () => {
    const id = await nueva()
    await approveQuote(activo.client, id, '2026-10-23')
    const antes = await subidos(id)
    expect(antes).toHaveLength(1)

    await rechazaWith(sendQuote(activo.client, id), 'Solo se puede enviar una cotización en borrador o ya enviada')
    await rechazaWith(approveQuote(activo.client, id, '2026-10-23'), 'Solo se puede aprobar una cotización en borrador o enviada')
    expect(await subidos(id)).toEqual(antes)

    const { data: directo, error } = await activo.client.rpc('presupuesto_directo', {
      p_datos: { cliente_id: ids.cliente_id, asunto: 'Izaje urgente acordado por teléfono', notas: MARCA },
      p_items: [ITEMS_DAILY[0]],
    })
    expect(error).toBeNull()
    await rechazaWith(sendQuote(activo.client, directo!), 'Solo se puede enviar una cotización en borrador o ya enviada')
    expect(await subidos(directo!)).toEqual([])
  })

  it('aprobar congela el PDF y después se sirve ese mismo archivo', async () => {
    const id = await nueva()
    await approveQuote(activo.client, id, '2026-10-23')

    const [row] = await sql<{ estado: string; pdf_aprobado_path: string }>(
      'select estado, pdf_aprobado_path from public.cotizaciones where id = $1',
      [id],
    )
    expect(row.estado).toBe('aprobada')

    const saved = await activo.client.storage.from('documentos').download(row.pdf_aprobado_path)
    const mostrado = await pdfForShow(activo.client, id)
    expect(mostrado?.nameFile).toBe(`COTIZACION N° ${await numero(id)} VERTICE.pdf`)
    expect(Buffer.compare(mostrado!.pdf, Buffer.from(await saved.data!.arrayBuffer()))).toBe(0)
  })

  it('una cotización cargada se aprueba sin generar PDF y se sigue mostrando su original', async () => {
    const path = `importadas/${crypto.randomUUID()}.pdf`
    paths.push(path)
    const original = Buffer.from('%PDF-1.4 original cargado')
    const upload = await activo.client.storage.from('documentos').upload(path, original, { contentType: 'application/pdf' })
    expect(upload.error).toBeNull()

    const { data: id, error } = await activo.client.rpc('importar_cotizacion', {
      p_datos: {
        numero: 100000 + Math.floor(Math.random() * 9000),
        cliente_id: ids.cliente_id,
        formato: 'jornada',
        fecha: '2026-10-01',
        estado: 'enviada',
        archivo_original_path: path,
        notas: MARCA,
      },
    })
    expect(error).toBeNull()

    await expect(sendQuote(activo.client, id!)).rejects.toThrow(/cargada/)
    await approveQuote(activo.client, id!, '2026-10-02')

    const [row] = await sql<{ estado: string; pdf_aprobado_path: string | null }>(
      'select estado, pdf_aprobado_path from public.cotizaciones where id = $1',
      [id],
    )
    expect(row).toEqual({ estado: 'aprobada', pdf_aprobado_path: null })
    const mostrado = await pdfForShow(activo.client, id!)
    expect(Buffer.compare(mostrado!.pdf, original)).toBe(0)
  })

  it('un borrador se genera en el momento; una cotización inexistente devuelve null', async () => {
    const id = await nueva()
    const mostrado = await pdfForShow(activo.client, id)
    expect(mostrado?.pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(await pdfForShow(activo.client, crypto.randomUUID())).toBeNull()
  })

  // Una enviada se puede seguir editando sin que cambie de estado: se muestra lo que recibió el cliente.
  it('una enviada o rechazada muestra su último envío aunque se edite después; reabierta se genera en el momento', async () => {
    const id = await nueva()
    await sendQuote(activo.client, id)
    await edit(id, 'Segunda versión enviada.')
    await sendQuote(activo.client, id)
    await edit(id, 'Cambio sin enviar.')

    const sends = await sql<{ pdf_path: string }>(
      'select pdf_path from public.cotizacion_envios where cotizacion_id = $1 order by enviada_at desc',
      [id],
    )
    expect(sends).toHaveLength(2)
    const last = await activo.client.storage.from('documentos').download(sends[0].pdf_path)
    const lastSent = Buffer.from(await last.data!.arrayBuffer())
    expect(await textOfPdf(lastSent)).toContain('Segunda versión enviada.')

    const sent = await pdfForShow(activo.client, id)
    expect(Buffer.compare(sent!.pdf, lastSent)).toBe(0)

    const { error: errorRechazo } = await activo.client.rpc('rechazar_cotizacion', { p_id: id })
    expect(errorRechazo).toBeNull()
    const rejected = await pdfForShow(activo.client, id)
    expect(Buffer.compare(rejected!.pdf, lastSent)).toBe(0)

    const { error: errorReapertura } = await activo.client.rpc('reabrir_cotizacion', { p_id: id })
    expect(errorReapertura).toBeNull()
    const reabierta = await pdfForShow(activo.client, id)
    expect(await textOfPdf(reabierta!.pdf)).toContain('Cambio sin enviar.')
  })

  it('un presupuesto directo no tiene PDF', async () => {
    const { data: id, error } = await activo.client.rpc('presupuesto_directo', {
      p_datos: { cliente_id: ids.cliente_id, asunto: 'Trabajo directo', notas: MARCA },
      p_items: [],
    })
    expect(error).toBeNull()
    expect(await pdfForShow(activo.client, id!)).toBeNull()
  })

  it('se puede ver el PDF de un envío anterior', async () => {
    const id = await nueva()
    await sendQuote(activo.client, id)
    const [envio] = await sql<{ id: string }>('select id from public.cotizacion_envios where cotizacion_id = $1', [id])
    const mostrado = await pdfForShow(activo.client, id, envio.id)
    expect(mostrado?.pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
