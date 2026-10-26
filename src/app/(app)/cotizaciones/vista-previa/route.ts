// src/app/(app)/cotizaciones/vista-previa/route.ts
import { z } from 'zod'
import { getEstadoSesion } from '@/lib/auth'
import { esquemaEstadoEditor } from '@/lib/cotizaciones/editor'
import { vistaPrevia, type EntradaVistaPrevia } from '@/lib/cotizaciones/servicio'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** El cuerpo: { estado } con la forma del estado del editor (las reglas de negocio no importan para mirar). */
const esquemaEntrada = z.object({ estado: esquemaEstadoEditor }) satisfies z.ZodType<EntradaVistaPrevia>

/**
 * POST /cotizaciones/vista-previa con { estado } (el estado del editor, sin guardar): el PDF tal como saldría, con
 * las variables sin completar en amarillo. No guarda nada. 401 sin sesión activa; 400 si el cuerpo no es válido.
 */
export async function POST(request: Request) {
  const sesion = await getEstadoSesion()
  if (sesion.estado !== 'activo') return new Response('No autorizado', { status: 401 })

  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return new Response('Pedido inválido', { status: 400 })
  }
  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return new Response('Pedido inválido', { status: 400 })
  }
  const entrada = esquemaEntrada.safeParse(cuerpo)
  if (!entrada.success) return new Response('Pedido inválido', { status: 400 })

  const supabase = await createClient()
  const pdf = await vistaPrevia(supabase, entrada.data)
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="vista-previa.pdf"',
      'Cache-Control': 'private, no-store',
    },
  })
}
