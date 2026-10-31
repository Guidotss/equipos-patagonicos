// src/app/(app)/cotizaciones/[id]/pdf/route.ts
import { getStatusSession } from '@/lib/auth'
import { pdfForShow } from '@/lib/quotes/service'
import { contentDisposition } from '@/lib/pdf/file-name'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/**
 * GET /cotizaciones/:id/pdf[?envio=:envioId][&descargar=1][&actual=1]
 * Con actual=1 (vista previa en el celular), una de la app no aprobada se genera con lo guardado ahora, aunque se
 * haya enviado antes.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStatusSession()
  if (session.estado !== 'activo') return new Response('No autorizado', { status: 401 })

  const { id } = await params
  const query = new URL(request.url).searchParams
  const envio = query.get('envio') ?? undefined
  if (!isUuid(id) || (envio !== undefined && !isUuid(envio))) return new Response('No encontrada', { status: 404 })

  const supabase = await createClient()
  const result = await pdfForShow(supabase, id, envio, { actual: query.get('actual') === '1' })
  if (!result) return new Response('No encontrada', { status: 404 })

  return new Response(new Uint8Array(result.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(result.nameFile, query.has('descargar') ? 'attachment' : 'inline'),
      'Cache-Control': 'private, no-store',
    },
  })
}
