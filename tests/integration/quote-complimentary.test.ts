import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extractText, getDocumentProxy } from 'unpdf'
import { writeFile } from 'node:fs/promises'
import { buildDocument } from '@/lib/quotes/document'
import { loadQuoteSource } from '@/lib/quotes/service/source'
import { pdfForShow, sendQuote } from '@/lib/quotes/service'
import { readItemsTemplate } from '@/lib/templates/content'
import { applyTemplate, statusNew } from '@/lib/quotes/editor'
import { crearUser, removeUser, sql, adminClient } from './helpers'
import { idsOfExample } from './quotes-helpers'

const marker = `complimentary-${crypto.randomUUID()}`
let staff: Awaited<ReturnType<typeof crearUser>>
let crew: Awaited<ReturnType<typeof crearUser>>
let ids: Awaited<ReturnType<typeof idsOfExample>>
const templateIds: string[] = []
const quoteIds: string[] = []
const item = { seccion: 'Servicios', descripcion: 'Traslado bonificado', cantidad: 2, precio_unitario: 900, unidad: 'VIAJE', is_complimentary: true }

beforeAll(async () => {
  staff = await crearUser({ activo: true, rol: 'operador' })
  crew = await crearUser({ activo: true, rol: 'crane_operator' })
  ids = await idsOfExample()
})
afterAll(async () => {
  if (quoteIds.length) {
    const files = await sql<{ name: string }>("select name from storage.objects where bucket_id='documentos' and exists(select 1 from public.cotizaciones c where c.id=any($1::uuid[]) and name like 'cotizaciones/'||c.id||'/%')", [quoteIds])
    if (files.length) await adminClient().storage.from('documentos').remove(files.map((file) => file.name))
    await sql('delete from public.cotizaciones where id=any($1::uuid[])', [quoteIds])
  }
  if (templateIds.length) await sql('delete from public.plantillas where id=any($1::uuid[])', [templateIds])
  await removeUser(staff.id)
  await removeUser(crew.id)
})

async function createQuote(format = 'jornada') {
  const result = await staff.client.rpc('guardar_cotizacion_versionada', {
    p_datos: { cliente_id: ids.cliente_id, formato: format, asunto: 'Servicio', notas: marker, mostrar_total: true },
    p_items: [item, { ...item, descripcion: 'Servicio normal', precio_unitario: 100, is_complimentary: false }, { ...item, descripcion: 'Cero normal', precio_unitario: 0, is_complimentary: false }],
  })
  expect(result.error).toBeNull()
  const row = result.data![0]
  quoteIds.push(row.id)
  return row
}

async function pdfText(pdf: Buffer) {
  const proxy = await getDocumentProxy(new Uint8Array(pdf))
  return (await extractText(proxy, { mergePages: true })).text.replace(/\s+/g, ' ')
}

describe('bonificación explícita de ítems', () => {
  it('persiste cero, conserva el cero normal, duplica con bis y bloquea inconsistencias SQL', async () => {
    const original = await createQuote()
    const loaded = await loadQuoteSource(staff.client, original.id)
    expect(loaded!.source.items.map((row) => [row.precio_unitario, row.is_complimentary])).toEqual([[0, true], [100, false], [0, false]])
    const doc = buildDocument(loaded!.source)
    expect(doc.total).toBe(200)
    expect(doc.items[0]).toMatchObject({ cantidad: 2, isComplimentary: true, total: 0 })
    const duplicate = await staff.client.rpc('duplicar_cotizacion', { p_id: original.id })
    expect(duplicate.error).toBeNull()
    quoteIds.push(duplicate.data!)
    const copied = await loadQuoteSource(staff.client, duplicate.data!)
    expect(copied!.source.items).toEqual(loaded!.source.items)
    expect(copied!.source.cotizacion.asunto).toBe('Servicio bis')
    expect(copied!.fila.reemplaza_a).toBe(original.id)
    for (const price of [null, 15]) {
      await expect(sql('update public.cotizacion_items set precio_unitario=$2 where cotizacion_id=$1 and is_complimentary', [original.id, price])).rejects.toMatchObject({ code: '23514' })
    }
  })

  it('rechaza marcas no booleanas de forma atómica y una edición con versión anterior', async () => {
    const original = await createQuote()
    const data = { cliente_id: ids.cliente_id, formato: 'jornada', asunto: 'Cambió' }
    const invalid = await staff.client.rpc('guardar_cotizacion_versionada', { p_id: original.id, p_updated_at: original.version, p_datos: data, p_items: [{ ...item, is_complimentary: 'true' }] })
    expect(invalid.error?.message).toMatch(/verdadera o falsa/)
    expect((await loadQuoteSource(staff.client, original.id))!.source.cotizacion.asunto).toBe('Servicio')
    expect((await loadQuoteSource(staff.client, original.id))!.source.items).toHaveLength(3)
    const changed = await staff.client.rpc('guardar_cotizacion_versionada', { p_id: original.id, p_updated_at: original.version, p_datos: data, p_items: [{ ...item, is_complimentary: false, precio_unitario: 0 }] })
    expect(changed.error).toBeNull()
    const stale = await staff.client.rpc('guardar_cotizacion_versionada', { p_id: original.id, p_updated_at: original.version, p_datos: data, p_items: [item] })
    expect(stale.error?.message).toMatch(/cambió/)
    expect((await loadQuoteSource(staff.client, original.id))!.source.items[0].is_complimentary).toBe(false)
    const denied = await crew.client.rpc('guardar_cotizacion_versionada', { p_datos: data, p_items: [item] })
    expect(denied.error).not.toBeNull()
    expect((await crew.client.from('cotizacion_items').select('id,is_complimentary')).data).toEqual([])
  })

  it('las plantillas guardan y editan la marca, conservan hidden/oculto y la aplican con precio cero', async () => {
    const content = { formato: 'jornada', asunto: '', intro: '', validez_dias: 30, items: [item, { ...item, descripcion: 'Sin marca', is_complimentary: false }], bloques: [{ titulo: 'Oculto', contenido: 'Texto', hidden: true }, { titulo: 'Anterior', contenido: 'Texto', oculto: true }] }
    const saved = await staff.client.rpc('guardar_plantilla_editor', { p_nombre: marker, p_contenido: content })
    expect(saved.error).toBeNull()
    templateIds.push(saved.data!)
    const { data: row } = await staff.client.from('plantillas').select('*').eq('id', saved.data!).single()
    expect(row!.items).toEqual(content.items.map(({ seccion, descripcion, cantidad, unidad, is_complimentary }) => ({ seccion, descripcion, cantidad, unidad, is_complimentary })))
    expect(row!.bloques).toEqual([{ titulo: 'Oculto', contenido: 'Texto', oculto: true }, { titulo: 'Anterior', contenido: 'Texto', oculto: true }])
    const state = applyTemplate(statusNew({ plantilla: null, firmanteId: '', today: '2026-11-04' }), { id: row!.id, nombre: row!.nombre, formato: 'jornada', asunto: '', intro: '', validez_dias: 30, items: readItemsTemplate(row!.items), bloques: [] })
    expect(state.items.map((row) => [row.precio, row.isComplimentary])).toEqual([['0', true], ['', false]])
    expect((await staff.client.rpc('guardar_plantilla_editor', { p_id: saved.data!, p_nombre: marker, p_contenido: { ...content, items: [{ ...item, is_complimentary: false }] } })).error).toBeNull()
    expect((await staff.client.rpc('guardar_plantilla_editor', { p_nombre: `${marker}-invalid`, p_contenido: { ...content, items: [{ ...item, is_complimentary: null }] } })).error).not.toBeNull()
  })

  it.each(['mensual', 'jornada'])('el PDF %s imprime BONIFICADA y el envío conserva su snapshot', async (format) => {
    const original = await createQuote(format)
    const shown = await pdfForShow(staff.client, original.id)
    await writeFile(`/tmp/complimentary-${format}.pdf`, shown!.pdf)
    const text = await pdfText(shown!.pdf)
    expect(text).toContain('BONIFICADA')
    expect(text).not.toContain('BONIFICADA más IVA')
    expect(text).toContain('200')
    await sendQuote(staff.client, original.id)
    const sent = (await pdfForShow(staff.client, original.id))!.pdf
    const { data: current } = await staff.client.from('cotizaciones').select('updated_at').eq('id', original.id).single()
    const edited = await staff.client.rpc('guardar_cotizacion_versionada', { p_id: original.id, p_updated_at: current!.updated_at, p_datos: { cliente_id: ids.cliente_id, formato: format, asunto: 'Editada' }, p_items: [{ ...item, is_complimentary: false, precio_unitario: 1500 }] })
    expect(edited.error).toBeNull()
    expect((await pdfForShow(staff.client, original.id))!.pdf.equals(sent)).toBe(true)
    expect(await pdfText((await pdfForShow(staff.client, original.id, undefined, { actual: true }))!.pdf)).not.toContain('BONIFICADA')
  })
})
