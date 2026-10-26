// src/app/(app)/cotizaciones/[id]/pdf/route.ts
import { getEstadoSesion } from '@/lib/auth'
import { pdfParaMostrar } from '@/lib/cotizaciones/servicio'
import { contentDisposition } from '@/lib/pdf/nombre-archivo'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export const dynamic = 'force-dynamic'

/**
 * GET /cotizaciones/:id/pdf[?envio=:envioId][&descargar=1][&actual=1]
 * Con actual=1 (vista previa en el celular), una de la app no aprobada se genera con lo guardado ahora, aunque se
 * haya enviado antes.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getEstadoSesion()
  if (sesion.estado !== 'activo') return new Response('No autorizado', { status: 401 })

  const { id } = await params
  const parametros = new URL(request.url).searchParams
  const envio = parametros.get('envio') ?? undefined
  if (!esUuid(id) || (envio !== undefined && !esUuid(envio))) return new Response('No encontrada', { status: 404 })

  const supabase = await createClient()
  const resultado = await pdfParaMostrar(supabase, id, envio, { actual: parametros.get('actual') === '1' })
  if (!resultado) return new Response('No encontrada', { status: 404 })

  return new Response(new Uint8Array(resultado.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(resultado.nombreArchivo, parametros.has('descargar') ? 'attachment' : 'inline'),
      'Cache-Control': 'private, no-store',
    },
  })
}
