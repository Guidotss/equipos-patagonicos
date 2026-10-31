// src/app/(app)/cotizaciones/vista-previa/route.ts
import { z } from 'zod'
import { getStatusSession } from '@/lib/auth'
import { schemaStatusEditor } from '@/lib/quotes/editor/validation'
import { viewPreview, type EntryViewPreview } from '@/lib/quotes/service'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** El cuerpo: { estado } con la forma del estado del editor (las reglas de negocio no importan para mirar). */
const schemaEntry = z.object({ estado: schemaStatusEditor }) satisfies z.ZodType<EntryViewPreview>

/**
 * POST /cotizaciones/vista-previa con { estado } (el estado del editor, sin guardar): el PDF tal como saldría, con
 * las variables sin completar en amarillo. No guarda nada. 401 sin sesión activa; 400 si el cuerpo no es válido.
 */
export async function POST(request: Request) {
  const session = await getStatusSession()
  if (session.estado !== 'activo') return new Response('No autorizado', { status: 401 })

  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return new Response('Pedido inválido', { status: 400 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response('Pedido inválido', { status: 400 })
  }
  const input = schemaEntry.safeParse(body)
  if (!input.success) return new Response('Pedido inválido', { status: 400 })

  const supabase = await createClient()
  const pdf = await viewPreview(supabase, input.data)
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="vista-previa.pdf"',
      'Cache-Control': 'private, no-store',
    },
  })
}
