import { requireCraneOperator } from '@/lib/auth'
import { getCraneDeliveryNoteFile } from '@/lib/crane-operators/queries'
import { createClient } from '@/lib/supabase/server'
import { urlDownload } from '@/lib/documents/service'
import { isUuid } from '@/lib/validation'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireCraneOperator()
  const { id } = await params
  if (!isUuid(id)) return new Response('Archivo no encontrado', { status: 404 })
  const client = await createClient()
  const file = await getCraneDeliveryNoteFile(client, id)
  if (!file) return new Response('Archivo no encontrado', { status: 404 })
  return Response.redirect(await urlDownload(client, file.path, file.originalName), 303)
}
