import { requireUsuario } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { urlDescarga } from '@/lib/documentos/servicio'
import { esUuid } from '@/lib/validacion'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUsuario()
  const { id } = await params
  if (!esUuid(id)) return new Response('Archivo no encontrado', { status: 404 })
  const supabase = await createClient()
  const { data: archivo, error } = await supabase
    .from('documento_archivos')
    .select('path, nombre_original')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!archivo) return new Response('Archivo no encontrado', { status: 404 })
  return Response.redirect(await urlDescarga(supabase, archivo.path, archivo.nombre_original), 303)
}
