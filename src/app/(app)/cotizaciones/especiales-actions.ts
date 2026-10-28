'use server'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'
import { requireUsuario } from '@/lib/auth'
import { esquemaEstadoEditor, SELECT_EDITOR, estadoDesdeFila, type EstadoEditor, type CatalogosEditor } from '@/lib/cotizaciones/editor'
import { leerCatalogosEditor } from '@/lib/cotizaciones/lecturas-editor'
import { esquemaEspecial, plantillaDesdeEditor } from '@/lib/cotizaciones/especiales'
import { esFecha, hoyArgentina } from '@/lib/format/fechas'
import { erroresPorRuta } from '@/lib/formularios'
import { mensajeParaUsuario, type Resultado } from '@/lib/resultado'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export async function prepararPdfExistente(tamano: number, mime: string): Promise<Resultado<{ path: string; token: string }>> {
  const usuario = await requireUsuario()
  if (mime !== 'application/pdf' || !Number.isFinite(tamano) || tamano <= 0 || tamano > 10 * 1024 * 1024) {
    return { ok: false, mensaje: 'Elegí un PDF de hasta 10 MB' }
  }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.storage.from('documentos').createSignedUploadUrl(`importadas/${usuario.id}/${crypto.randomUUID()}.pdf`)
    if (error) throw error
    return { ok: true, datos: { path: data.path, token: data.token } }
  } catch (error) { unstable_rethrow(error); return { ok: false, mensaje: mensajeParaUsuario(error) } }
}

export async function crearEspecial(origen: 'importada' | 'directa', entrada: unknown, path?: string): Promise<Resultado<{ id: string }>> {
  await requireUsuario()
  if (origen !== 'importada' && origen !== 'directa') return { ok: false, mensaje: 'Origen inválido' }
  const leido = esquemaEspecial(origen).safeParse(entrada)
  if (!leido.success) return { ok: false, mensaje: 'Revisá los datos marcados', errores: erroresPorRuta(leido.error) }
  if (origen === 'importada' && (typeof path !== 'string' || !path.startsWith('importadas/'))) return { ok: false, mensaje: 'Subí el PDF de la cotización' }
  try {
    const supabase = await createClient()
    const v = leido.data
    const datos = { ...v, fecha_aprobacion: v.fecha_aprobacion || undefined }
    const { data, error } = origen === 'importada'
      ? await supabase.rpc('cargar_cotizacion_existente', { p_datos: { ...datos, archivo_original_path: path } })
      : await supabase.rpc('presupuesto_directo', { p_datos: datos, p_items: [] })
    if (error) throw error
    revalidatePath('/cotizaciones'); revalidatePath('/presupuestos'); revalidatePath('/')
    return { ok: true, datos: { id: data } }
  } catch (error) { unstable_rethrow(error); return { ok: false, mensaje: mensajeParaUsuario(error) } }
}

export async function guardarPlantillaEditor(estado: EstadoEditor, nombre: string, id?: string): Promise<Resultado<{ id: string }>> {
  await requireUsuario()
  const leido = esquemaEstadoEditor.safeParse(estado)
  if (!leido.success || typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 100 || (id !== undefined && !esUuid(id))) return { ok: false, mensaje: 'Revisá el nombre y el contenido de la plantilla' }
  const contenido = plantillaDesdeEditor(leido.data)
  if (!Number.isInteger(contenido.validez_dias) || contenido.validez_dias < 1 || contenido.validez_dias > 365 || contenido.items.some((i) => !i.descripcion.trim() || i.cantidad === null || i.cantidad <= 0)) return { ok: false, mensaje: 'Completá las descripciones, cantidades y validez antes de guardar la plantilla' }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('guardar_plantilla_editor', { p_nombre: nombre.trim(), p_contenido: contenido, p_id: id })
    if (error) throw error
    revalidatePath('/configuracion/plantillas')
    if (id) revalidatePath(`/configuracion/plantillas/${id}`)
    return { ok: true, datos: { id: data }, mensaje: 'Plantilla guardada' }
  } catch (error) { unstable_rethrow(error); return { ok: false, mensaje: mensajeParaUsuario(error) } }
}

export async function eliminarPlantilla(id: string): Promise<Resultado> {
  await requireUsuario()
  if (!esUuid(id)) return { ok: false, mensaje: 'Plantilla inválida' }
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('eliminar_plantilla', { p_id: id })
    if (error) throw error
    revalidatePath('/configuracion/plantillas')
    return { ok: true, datos: null, mensaje: 'Plantilla eliminada; si ya fue utilizada, quedó archivada' }
  } catch (error) { unstable_rethrow(error); return { ok: false, mensaje: mensajeParaUsuario(error) } }
}

export async function actualizarSeguimiento(id: string, version: string, notas: string, fecha: string): Promise<Resultado> {
  await requireUsuario()
  const v = z.object({ id: z.uuid(), version: z.iso.datetime({ offset: true }), notas: z.string().max(2000), fecha: z.string().refine((f) => f === '' || esFecha(f)) }).safeParse({ id, version, notas, fecha })
  if (!v.success) return { ok: false, mensaje: 'Revisá las notas y la fecha de actualización' }
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('actualizar_seguimiento_cotizacion', { p_id: id, p_updated_at: version, p_notas: notas, p_fecha: fecha || undefined })
    if (error) throw error
    revalidatePath(`/cotizaciones/${id}`); revalidatePath(`/presupuestos/${id}`); revalidatePath('/')
    return { ok: true, datos: null, mensaje: 'Seguimiento guardado' }
  } catch (error) { unstable_rethrow(error); return { ok: false, mensaje: mensajeParaUsuario(error) } }
}

export async function basarEnUltima(clienteId: string): Promise<Resultado<{ estado: EstadoEditor; catalogos: CatalogosEditor }>> {
  await requireUsuario()
  if (!esUuid(clienteId)) return { ok: false, mensaje: 'Cliente inválido' }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('cotizaciones').select(SELECT_EDITOR).eq('cliente_id', clienteId).eq('origen', 'app').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!data) return { ok: false, mensaje: 'Este cliente todavía no tiene cotizaciones creadas en la app' }
    const estado = estadoDesdeFila(data)
    const catalogos = await leerCatalogosEditor(supabase, { plantillaId: data.plantilla_id, equipoId: data.equipo_id, firmanteId: data.firmante_id })
    return { ok: true, datos: { estado: { ...estado, id: null, version: null, numero: null, estado: 'borrador', origen: 'app', fecha: hoyArgentina(), reemplazaA: null }, catalogos } }
  } catch (error) { unstable_rethrow(error); return { ok: false, mensaje: mensajeParaUsuario(error) } }
}
