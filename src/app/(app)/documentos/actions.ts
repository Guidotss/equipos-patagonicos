'use server'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'
import { requireUsuario } from '@/lib/auth'
import { aprobarConOrdenCompra, ErrorCotizacion } from '@/lib/cotizaciones/servicio'
import { contextoDocumento } from '@/lib/documentos/lecturas'
import { esquemaGuardarDocumento } from '@/lib/documentos/pantallas'
import { ErrorDocumento, prepararSubida, registrarDocumento } from '@/lib/documentos/servicio'
import { erroresPorRuta, mensajeErrorBase } from '@/lib/formularios'
import type { Resultado } from '@/lib/resultado'
import { createClient } from '@/lib/supabase/server'

function fallo(error: unknown): Resultado<never> {
  unstable_rethrow(error)
  if (error instanceof ErrorDocumento || error instanceof ErrorCotizacion) return { ok: false, mensaje: error.message }
  if (typeof error === 'object' && error && 'code' in error && 'message' in error) {
    return { ok: false, mensaje: mensajeErrorBase(error as { code: string; message: string }) }
  }
  console.error(error)
  return { ok: false, mensaje: 'No se pudo completar la operación. Podés reintentar sin perder los datos.' }
}

function actualizarPantallas() {
  revalidatePath('/presupuestos', 'layout')
  revalidatePath('/documentos', 'layout')
  revalidatePath('/')
}

export async function prepararArchivo(entrada: unknown): Promise<Resultado<{ path: string; signedUrl: string }>> {
  await requireUsuario()
  const validado = z
    .object({
      clienteId: z.uuid(),
      mime: z.string().max(100),
      tamano: z
        .number()
        .int()
        .positive()
        .max(10 * 1024 * 1024),
    })
    .safeParse(entrada)
  if (!validado.success) return { ok: false, mensaje: 'Revisá el tipo y el tamaño del archivo (máximo 10 MB).' }
  try {
    return { ok: true, datos: await prepararSubida(await createClient(), validado.data) }
  } catch (error) {
    return fallo(error)
  }
}

export async function leerContextoDocumento(clienteId: unknown) {
  await requireUsuario()
  const id = z.uuid().safeParse(clienteId)
  if (!id.success) return { ok: false as const, mensaje: 'Cliente inválido' }
  try {
    return { ok: true as const, datos: await contextoDocumento(await createClient(), id.data) }
  } catch (error) {
    return fallo(error)
  }
}

export async function guardarDocumento(entrada: unknown): Promise<Resultado<{ id: string; presupuesto: string }>> {
  await requireUsuario()
  const validado = esquemaGuardarDocumento.safeParse(entrada)
  if (!validado.success)
    return { ok: false, mensaje: 'Revisá los datos marcados', errores: erroresPorRuta(validado.error) }
  const datos = validado.data
  try {
    const supabase = await createClient()
    let id = datos.id
    if (id) {
      const { data: documento, error: lectura } = await supabase
        .from('documentos')
        .select('cliente_id')
        .eq('id', id)
        .single()
      if (lectura) throw lectura
      if (documento.cliente_id !== datos.clienteId) throw new ErrorDocumento('El documento pertenece a otro cliente')
      const { error } = await supabase.rpc('actualizar_documento_con_archivos', {
        p_id: id,
        p_datos: datos.datos,
        p_presupuestos: datos.presupuestos,
        p_remitos: datos.datos.tipo === 'factura' ? datos.remitos : [],
        p_aplicaciones: datos.datos.tipo === 'orden_pago' ? datos.aplicaciones : [],
        p_archivos: datos.archivos,
        p_quitar: datos.quitar,
      })
      if (error) throw error
    } else if (datos.cotizacion) {
      id = await aprobarConOrdenCompra(
        supabase,
        datos.cotizacion.id,
        datos.cotizacion.version,
        datos.datos,
        datos.archivos,
      )
    } else {
      id = await registrarDocumento(supabase, {
        ...datos,
        remitos: datos.datos.tipo === 'factura' ? datos.remitos : [],
        aplicaciones: datos.datos.tipo === 'orden_pago' ? datos.aplicaciones : [],
      })
    }
    actualizarPantallas()
    return { ok: true, datos: { id, presupuesto: datos.presupuestos[0] } }
  } catch (error) {
    return fallo(error)
  }
}

export async function cambiarAnulacionDocumento(id: unknown, restaurar: unknown): Promise<Resultado> {
  await requireUsuario()
  const validado = z.object({ id: z.uuid(), restaurar: z.boolean() }).safeParse({ id, restaurar })
  if (!validado.success) return { ok: false, mensaje: 'Documento inválido' }
  try {
    const { error } = await (
      await createClient()
    ).rpc(validado.data.restaurar ? 'restaurar_documento' : 'anular_documento', { p_id: validado.data.id })
    if (error) throw error
    actualizarPantallas()
    return { ok: true, datos: null }
  } catch (error) {
    return fallo(error)
  }
}
