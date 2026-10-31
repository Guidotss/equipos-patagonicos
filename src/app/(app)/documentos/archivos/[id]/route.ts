import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { urlDownload } from '@/lib/documents/service'
import { isUuid } from '@/lib/validation'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params
  if (!isUuid(id)) return new Response('Archivo no encontrado', { status: 404 })
  const supabase = await createClient()
  const { data: archivo, error } = await supabase
    .from('documento_archivos')
    .select('path, nombre_original')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!archivo) return new Response('Archivo no encontrado', { status: 404 })
  return Response.redirect(await urlDownload(supabase, archivo.path, archivo.nombre_original), 303)
}
