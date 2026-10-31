'use server'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { schemaStatusEditor } from '@/lib/quotes/editor/validation'
import { SELECT_EDITOR } from '@/lib/quotes/editor/constants'
import { statusFromRow } from '@/lib/quotes/editor/state'
import type { StatusEditor, CatalogsEditor } from '@/lib/quotes/editor/types'
import { readCatalogsEditor } from '@/lib/quotes/queries-editor'
import { schemaSpecial, templateFromEditor } from '@/lib/quotes/specials'
import { isDate, todayArgentina } from '@/lib/format/dates'
import { errorsByPath } from '@/lib/forms'
import { messageForUser, type Result } from '@/lib/result'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'

export async function preparePdfExisting(size: number, mime: string): Promise<Result<{ path: string; token: string }>> {
  const user = await requireUser()
  if (mime !== 'application/pdf' || !Number.isFinite(size) || size <= 0 || size > 10 * 1024 * 1024) {
    return { ok: false, message: 'Elegí un PDF de hasta 10 MB' }
  }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.storage.from('documentos').createSignedUploadUrl(`importadas/${user.id}/${crypto.randomUUID()}.pdf`)
    if (error) throw error
    return { ok: true, datos: { path: data.path, token: data.token } }
  } catch (error) { unstable_rethrow(error); return { ok: false, message: messageForUser(error) } }
}

export async function createSpecial(origin: 'importada' | 'directa', input: unknown, path?: string): Promise<Result<{ id: string }>> {
  await requireUser()
  if (origin !== 'importada' && origin !== 'directa') return { ok: false, message: 'Origen inválido' }
  const parsed = schemaSpecial(origin).safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Revisá los datos marcados', errors: errorsByPath(parsed.error) }
  if (origin === 'importada' && (typeof path !== 'string' || !path.startsWith('importadas/'))) return { ok: false, message: 'Subí el PDF de la cotización' }
  try {
    const supabase = await createClient()
    const v = parsed.data
    const quoteData = { ...v, fecha_aprobacion: v.fecha_aprobacion || undefined }
    const { data, error } = origin === 'importada'
      ? await supabase.rpc('cargar_cotizacion_existente', { p_datos: { ...quoteData, archivo_original_path: path } })
      : await supabase.rpc('presupuesto_directo', { p_datos: quoteData, p_items: [] })
    if (error) throw error
    revalidatePath('/cotizaciones'); revalidatePath('/presupuestos'); revalidatePath('/')
    return { ok: true, datos: { id: data } }
  } catch (error) { unstable_rethrow(error); return { ok: false, message: messageForUser(error) } }
}

export async function saveTemplateEditor(state: StatusEditor, name: string, id?: string): Promise<Result<{ id: string }>> {
  await requireUser()
  const parsed = schemaStatusEditor.safeParse(state)
  if (!parsed.success || typeof name !== 'string' || !name.trim() || name.trim().length > 100 || (id !== undefined && !isUuid(id))) return { ok: false, message: 'Revisá el nombre y el contenido de la plantilla' }
  const content = templateFromEditor(parsed.data)
  if (!Number.isInteger(content.validez_dias) || content.validez_dias < 1 || content.validez_dias > 365 || content.items.some((i) => !i.descripcion.trim() || i.cantidad === null || i.cantidad <= 0)) return { ok: false, message: 'Completá las descripciones, cantidades y validez antes de guardar la plantilla' }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('guardar_plantilla_editor', { p_nombre: name.trim(), p_contenido: content, p_id: id })
    if (error) throw error
    revalidatePath('/configuracion/plantillas')
    if (id) revalidatePath(`/configuracion/plantillas/${id}`)
    return { ok: true, datos: { id: data }, message: 'Plantilla guardada' }
  } catch (error) { unstable_rethrow(error); return { ok: false, message: messageForUser(error) } }
}

export async function deleteTemplate(id: string): Promise<Result> {
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

export async function updateFollowUp(id: string, version: string, notes: string, date: string): Promise<Result> {
  await requireUser()
  const v = z.object({ id: z.uuid(), version: z.iso.datetime({ offset: true }), notas: z.string().max(2000), fecha: z.string().refine((f) => f === '' || isDate(f)) }).safeParse({ id, version, notas: notes, fecha: date })
  if (!v.success) return { ok: false, message: 'Revisá las notas y la fecha de actualización' }
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('actualizar_seguimiento_cotizacion', { p_id: id, p_updated_at: version, p_notas: notes, p_fecha: date || undefined })
    if (error) throw error
    revalidatePath(`/cotizaciones/${id}`); revalidatePath(`/presupuestos/${id}`); revalidatePath('/')
    return { ok: true, datos: null, message: 'Seguimiento guardado' }
  } catch (error) { unstable_rethrow(error); return { ok: false, message: messageForUser(error) } }
}

export async function baseOnLastQuote(clientId: string): Promise<Result<{ estado: StatusEditor; catalogs: CatalogsEditor }>> {
  await requireUser()
  if (!isUuid(clientId)) return { ok: false, message: 'Cliente inválido' }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('cotizaciones').select(SELECT_EDITOR).eq('cliente_id', clientId).eq('origen', 'app').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!data) return { ok: false, message: 'Este cliente todavía no tiene cotizaciones creadas en la app' }
    const state = statusFromRow(data)
    const catalogs = await readCatalogsEditor(supabase, { templateId: data.plantilla_id, equipoId: data.equipo_id, firmanteId: data.firmante_id })
    return { ok: true, datos: { estado: { ...state, id: null, version: null, numero: null, estado: 'borrador', origen: 'app', fecha: todayArgentina(), replacesA: null }, catalogs } }
  } catch (error) { unstable_rethrow(error); return { ok: false, message: messageForUser(error) } }
}
