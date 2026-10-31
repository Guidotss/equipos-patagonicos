import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { adminClient, borrarUsuario, crearUsuario, sql } from './helpers'
import { limpiarDocumentos, subirArchivo } from './documentos-helpers'

const marca = `cierre-${crypto.randomUUID()}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>
const plantillas: string[] = []
beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' }); inactivo = await crearUsuario({ activo: false }); ids = await idsDeEjemplo()
})
afterAll(async () => {
  await limpiarDocumentos(marca)
  await sql('delete from public.cotizaciones where notas=$1', [marca])
  if (plantillas.length) await adminClient().from('plantillas').delete().in('id', plantillas)
  await borrarUsuario(activo.id); await borrarUsuario(inactivo.id)
})
const contenido = { formato: 'jornada', asunto: 'Izaje en {{ubicacion}}', intro: '', validez_dias: 30, items: [{ seccion: 'Servicios', descripcion: 'Grúa', cantidad: 1, unidad: 'JORNADA' }], bloques: [{ titulo: 'Alcance', contenido: 'Con operador', oculto: false }] }

describe('cierre transaccional de cotizaciones', () => {
  it('devuelve la versión escrita y rechaza un guardado con versión anterior', async () => {
    const { data, error } = await activo.client.rpc('guardar_cotizacion_versionada', { p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', notas: marca }, p_items: [] })
    expect(error).toBeNull()
    const original = data![0]
    const segundo = await activo.client.rpc('guardar_cotizacion_versionada', { p_id: original.id, p_updated_at: original.version, p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', notas: marca, asunto: 'Actualizada' }, p_items: [] })
    expect(segundo.error).toBeNull()
    const viejo = await activo.client.rpc('guardar_cotizacion_versionada', { p_id: original.id, p_updated_at: original.version, p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', notas: marca }, p_items: [] })
    expect(viejo.error?.message).toMatch(/cambió/)
    const { data: fila } = await activo.client.from('cotizaciones').select('updated_at,asunto').eq('id', original.id).single()
    expect(fila?.updated_at).toBe(segundo.data![0].version)
    expect(fila?.asunto).toBe('Actualizada')
  })
  it('permite notas y fecha de seguimiento en aprobadas sin cambiar el contenido', async () => {
    const { data: id, error } = await activo.client.rpc('presupuesto_directo', { p_datos: { cliente_id: ids.cliente_id, asunto: 'Trabajo acordado', notas: marca } })
    expect(error).toBeNull()
    const { data: fila } = await activo.client.from('cotizaciones').select('updated_at').eq('id', id!).single()
    const r = await activo.client.rpc('actualizar_seguimiento_cotizacion', { p_id: id!, p_updated_at: fila!.updated_at, p_notas: marca, p_fecha: '2026-11-01' })
    expect(r.error).toBeNull()
    const { data } = await activo.client.from('cotizaciones').select('estado,asunto,fecha_proxima_actualizacion').eq('id', id!).single()
    expect(data).toEqual({ estado: 'aprobada', asunto: 'Trabajo acordado', fecha_proxima_actualizacion: '2026-11-01' })
    expect((await inactivo.client.rpc('actualizar_seguimiento_cotizacion', { p_id: id!, p_updated_at: fila!.updated_at, p_notas: '' })).error).not.toBeNull()
  })
  it('guarda y edita una plantilla, sin permitir usuarios inactivos', async () => {
    const r = await activo.client.rpc('guardar_plantilla_editor', { p_nombre: marca, p_contenido: contenido })
    expect(r.error).toBeNull(); plantillas.push(r.data!)
    expect((await inactivo.client.rpc('guardar_plantilla_editor', { p_nombre: `${marca}-inactivo`, p_contenido: contenido })).error).not.toBeNull()
    expect((await activo.client.rpc('guardar_plantilla_editor', { p_id: r.data!, p_nombre: marca, p_contenido: { ...contenido, asunto: 'Modificada' } })).error).toBeNull()
    const { data } = await activo.client.from('plantillas').select('asunto,items').eq('id', r.data!).single()
    expect(data?.asunto).toBe('Modificada'); expect(data?.items).toEqual(contenido.items)
  })
  it('la RPC de plantillas rechaza unidades ausentes y descarta campos extra y precios', async () => {
    const invalida = await activo.client.rpc('guardar_plantilla_editor', { p_nombre: `${marca}-invalida`, p_contenido: { ...contenido, items: [{ seccion: '', descripcion: 'Grúa', cantidad: 1 }] } })
    expect(invalida.error?.message).toMatch(/ítems/)
    const r = await activo.client.rpc('guardar_plantilla_editor', { p_nombre: `${marca}-limpia`, p_contenido: { ...contenido, items: [{ ...contenido.items[0], precio_unitario: 1500, cliente_id: ids.cliente_id }] } })
    expect(r.error).toBeNull(); plantillas.push(r.data!)
    const { data } = await activo.client.from('plantillas').select('items').eq('id', r.data!).single()
    expect(data?.items).toEqual(contenido.items)
  })
  it('no carga una cotización si su PDF no existe en Storage', async () => {
    const r = await activo.client.rpc('cargar_cotizacion_existente', { p_datos: { cliente_id: ids.cliente_id, numero: 42, estado: 'enviada', archivo_original_path: 'importadas/inexistente.pdf' } })
    expect(r.error?.message).toMatch(/Subí un PDF/)
    expect((await activo.client.rpc('importar_cotizacion', { p_datos: { cliente_id: ids.cliente_id, numero: 42, estado: 'enviada', archivo_original_path: 'importadas/inexistente.pdf' } })).error?.message).toMatch(/Subí un PDF/)
  })
  it('aprueba una cotización importada con su OC en la misma transacción, sin generar otro PDF', async () => {
    const ruta = `importadas/${crypto.randomUUID()}.pdf`
    const { error: subida } = await activo.client.storage.from('documentos').upload(ruta, new Blob(['%PDF-1.4 original'], { type: 'application/pdf' }), { contentType: 'application/pdf' })
    expect(subida).toBeNull()
    try {
      const [{ n }] = await sql<{ n: number }>('select n from generate_series(60000,70000) n where not exists(select 1 from public.cotizaciones c where c.numero=n) limit 1')
      const { data: id, error } = await activo.client.rpc('importar_cotizacion', { p_datos: { cliente_id: ids.cliente_id, numero: n, estado: 'enviada', fecha: '2026-10-01', archivo_original_path: ruta, notas: marca } })
      expect(error).toBeNull()
      const { data: fila } = await activo.client.from('cotizaciones').select('updated_at').eq('id', id!).single()
      const archivo = await subirArchivo(activo.client, ids.cliente_id)
      const r = await activo.client.rpc('aprobar_con_orden_compra', { p_id: id!, p_updated_at: fila!.updated_at, p_pdf_path: '', p_documento: { tipo: 'orden_compra', numero: marca, fecha: '2026-10-28', notas: marca }, p_archivos: [archivo] })
      expect(r.error).toBeNull()
      const { data } = await activo.client.from('cotizaciones').select('estado,pdf_aprobado_path,archivo_original_path').eq('id', id!).single()
      expect(data).toEqual({ estado: 'aprobada', pdf_aprobado_path: null, archivo_original_path: ruta })
    } finally { await adminClient().storage.from('documentos').remove([ruta]) }
  })
  it('si falla el registro de la OC, la aprobación también se revierte', async () => {
    const { data } = await activo.client.rpc('guardar_cotizacion_versionada', { p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', notas: marca }, p_items: [{ orden: 1, descripcion: 'Grúa', cantidad: 1, precio_unitario: 100, unidad: 'JORNADA' }] })
    const original = data![0]
    const r = await activo.client.rpc('aprobar_con_orden_compra', { p_id: original.id, p_updated_at: original.version, p_pdf_path: `cotizaciones/${original.id}/prueba.pdf`, p_documento: { tipo: 'orden_compra', numero: '', fecha: '2026-10-28' }, p_archivos: [] })
    expect(r.error).not.toBeNull()
    const { data: fila } = await activo.client.from('cotizaciones').select('estado,pdf_aprobado_path').eq('id', original.id).single()
    expect(fila).toEqual({ estado: 'borrador', pdf_aprobado_path: null })
  })
})
