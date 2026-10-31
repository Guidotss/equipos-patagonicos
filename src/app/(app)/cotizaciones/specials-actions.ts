'use server'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { schemaStatusEditor, SELECT_EDITOR, statusFromRow, type StatusEditor, type CatalogsEditor } from '@/lib/quotes/editor'
import { readCatalogsEditor } from '@/lib/quotes/queries-editor'
import { schemaSpecial, templateFromEditor } from '@/lib/quotes/specials'
import { isDate, todayArgentina } from '@/lib/format/dates'
import { errorsByPath } from '@/lib/forms'
import { messageForUser, type Result } from '@/lib/result'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'

export async function preparePdfExisting(tamano: number, mime: string): Promise<Result<{ path: string; token: string }>> {
  const user = await requireUser()
  if (mime !== 'application/pdf' || !Number.isFinite(tamano) || tamano <= 0 || tamano > 10 * 1024 * 1024) {
    return { ok: false, message: 'Elegí un PDF de hasta 10 MB' }
  }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.storage.from('documentos').createSignedUploadUrl(`importadas/${user.id}/${crypto.randomUUID()}.pdf`)
    if (error) throw error
    return { ok: true, datos: { path: data.path, token: data.token } }
  } catch (error) { unstable_rethrow(error); return { ok: false, message: messageForUser(error) } }
}

export async function crearSpecial(origen: 'importada' | 'directa', entrada: unknown, path?: string): Promise<Result<{ id: string }>> {
  await requireUser()
  if (origen !== 'importada' && origen !== 'directa') return { ok: false, message: 'Origen inválido' }
  const leido = schemaSpecial(origen).safeParse(entrada)
  if (!leido.success) return { ok: false, message: 'Revisá los datos marcados', errors: errorsByPath(leido.error) }
  if (origen === 'importada' && (typeof path !== 'string' || !path.startsWith('importadas/'))) return { ok: false, message: 'Subí el PDF de la cotización' }
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
  } catch (error) { unstable_rethrow(error); return { ok: false, message: messageForUser(error) } }
}

export async function saveTemplateEditor(estado: StatusEditor, nombre: string, id?: string): Promise<Result<{ id: string }>> {
  await requireUser()
  const leido = schemaStatusEditor.safeParse(estado)
  if (!leido.success || typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 100 || (id !== undefined && !isUuid(id))) return { ok: false, message: 'Revisá el nombre y el contenido de la plantilla' }
  const content = templateFromEditor(leido.data)
  if (!Number.isInteger(content.validez_dias) || content.validez_dias < 1 || content.validez_dias > 365 || content.items.some((i) => !i.descripcion.trim() || i.cantidad === null || i.cantidad <= 0)) return { ok: false, message: 'Completá las descripciones, cantidades y validez antes de guardar la plantilla' }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('guardar_plantilla_editor', { p_nombre: nombre.trim(), p_contenido: content, p_id: id })
    if (error) throw error
    revalidatePath('/configuracion/plantillas')
    if (id) revalidatePath(`/configuracion/plantillas/${id}`)
    return { ok: true, datos: { id: data }, message: 'Plantilla guardada' }
  } catch (error) { unstable_rethrow(error); return { ok: false, message: messageForUser(error) } }
}

export async function eliminarTemplate(id: string): Promise<Result> {
  await requireUser()
  if (!isUuid(id)) return { ok: false, message: 'Plantilla inválida' }
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('eliminar_plantilla', { p_id: id })
    if (error) throw error
    revalidatePath('/configuracion/plantillas')
    return { ok: true, datos: null, message: 'Plantilla eliminada; si ya fue utilizada, quedó archivada' }
  } catch (error) { unstable_rethrow(error); return { ok: false, message: messageForUser(error) } }
}

export async function actualizarFollowUp(id: string, version: string, notas: string, fecha: string): Promise<Result> {
  await requireUser()
  const v = z.object({ id: z.uuid(), version: z.iso.datetime({ offset: true }), notas: z.string().max(2000), fecha: z.string().refine((f) => f === '' || isDate(f)) }).safeParse({ id, version, notas, fecha })
  if (!v.success) return { ok: false, message: 'Revisá las notas y la fecha de actualización' }
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('actualizar_seguimiento_cotizacion', { p_id: id, p_updated_at: version, p_notas: notas, p_fecha: fecha || undefined })
    if (error) throw error
    revalidatePath(`/cotizaciones/${id}`); revalidatePath(`/presupuestos/${id}`); revalidatePath('/')
    return { ok: true, datos: null, message: 'Seguimiento guardado' }
  } catch (error) { unstable_rethrow(error); return { ok: false, message: messageForUser(error) } }
}

export async function basarInLast(clientId: string): Promise<Result<{ estado: StatusEditor; catalogs: CatalogsEditor }>> {
  await requireUser()
  if (!isUuid(clientId)) return { ok: false, message: 'Cliente inválido' }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('cotizaciones').select(SELECT_EDITOR).eq('cliente_id', clientId).eq('origen', 'app').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!data) return { ok: false, message: 'Este cliente todavía no tiene cotizaciones creadas en la app' }
    const estado = statusFromRow(data)
    const catalogs = await readCatalogsEditor(supabase, { templateId: data.plantilla_id, equipoId: data.equipo_id, firmanteId: data.firmante_id })
    return { ok: true, datos: { estado: { ...estado, id: null, version: null, numero: null, estado: 'borrador', origen: 'app', fecha: todayArgentina(), replacesA: null }, catalogs } }
  } catch (error) { unstable_rethrow(error); return { ok: false, message: messageForUser(error) } }
}
