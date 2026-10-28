'use server'
// src/app/(app)/cotizaciones/actions.ts
// Acciones de la lista y del editor de cotizaciones. No reciben FormData: el editor manda su estado completo y
// los botones, ids. Nunca tiran (salvo el redirect de requireUsuario): devuelven un Resultado con el mensaje para
// mostrar, así "Hay ítems sin precio" o "La cotización cambió…" llegan a la pantalla y no al boundary de error.

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { requireUsuario } from '@/lib/auth'
import { esquemaEstadoEditor, payloadGuardar, type EstadoEditor } from '@/lib/cotizaciones/editor'
import * as servicio from '@/lib/cotizaciones/servicio'
import { mensajeParaUsuario, type Resultado } from '@/lib/resultado'
import { createClient } from '@/lib/supabase/server'
import { esUuid, textoRequerido } from '@/lib/validacion'

type Supabase = Awaited<ReturnType<typeof createClient>>
type Fallo = { ok: false; mensaje: string; errores?: Record<string, string> }

const IDENTIFICADOR_INVALIDO = 'Identificador inválido'

function fallo(mensaje: string, errores?: Record<string, string>): Fallo {
  return errores ? { ok: false, mensaje, errores } : { ok: false, mensaje }
}

/** Corre la operación con la sesión del usuario y convierte cualquier error en un mensaje para mostrar. */
async function ejecutar<T>(operacion: (supabase: Supabase) => Promise<T>, mensaje?: string): Promise<Resultado<T>> {
  try {
    const datos = await operacion(await createClient())
    return mensaje ? { ok: true, datos, mensaje } : { ok: true, datos }
  } catch (error) {
    unstable_rethrow(error)
    return fallo(mensajeParaUsuario(error))
  }
}

function revalidar(...ids: string[]) {
  revalidatePath('/cotizaciones')
  for (const id of ids) revalidatePath(`/cotizaciones/${id}`)
}

/**
 * Guarda el estado del editor: crea la cotización (sin id) o la actualiza con la versión que se editó.
 * Los errores de cada campo vuelven en `errores` con la clave de payloadGuardar ('cliente', 'items.2.precio'…).
 */
export async function guardarCotizacion(
  estado: EstadoEditor,
): Promise<Resultado<{ id: string; numero: number; version: string }>> {
  await requireUsuario()
  const leido = esquemaEstadoEditor.safeParse(estado)
  if (!leido.success) return fallo('Los datos de la cotización no son válidos. Recargá la página y probá de nuevo.')
  const armado = payloadGuardar(leido.data)
  if (!armado.ok) return fallo('Revisá los datos marcados', armado.errores)

  const { id, version } = leido.data
  const resultado = await ejecutar(
    (supabase) => servicio.guardarCotizacion(supabase, armado.payload, id ?? undefined, version ?? undefined),
    'Cotización guardada',
  )
  if (resultado.ok) revalidar(resultado.datos.id)
  return resultado
}

/** Genera el PDF, lo registra como enviado y devuelve el envío para descargarlo. */
export async function enviarCotizacion(id: string, version: string): Promise<Resultado<{ envioId: string }>> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  if (typeof version !== 'string' || !version) return fallo('Falta la versión de la cotización')
  const resultado = await ejecutar(
    (supabase) => servicio.enviarCotizacion(supabase, id, version),
    'Cotización marcada como enviada',
  )
  if (resultado.ok) revalidar(id)
  return resultado
}

/** Aprueba con la fecha elegida. Si reemplaza a un presupuesto en curso, lo devuelve para ofrecer finalizarlo. */
export async function aprobarCotizacion(
  id: string,
  version: string,
  fecha: string,
): Promise<Resultado<{ anterior: { id: string; numero: number } | null }>> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  if (typeof version !== 'string' || !version) return fallo('Falta la versión de la cotización')
  if (typeof fecha !== 'string') return fallo('La fecha de aprobación no es válida')
  const resultado = await ejecutar(
    (supabase) => servicio.aprobarCotizacion(supabase, id, fecha, version),
    'Cotización aprobada',
  )
  if (resultado.ok) {
    revalidar(id)
    revalidatePath('/presupuestos')
  }
  return resultado
}

/** Finaliza el presupuesto de la cotización anterior de una renegociación. */
export async function finalizarPresupuesto(id: string): Promise<Resultado> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  const resultado = await ejecutar(async (supabase) => {
    await servicio.finalizarPresupuesto(supabase, id)
    return null
  }, 'Presupuesto finalizado')
  if (resultado.ok) {
    revalidar(id)
    revalidatePath('/presupuestos')
  }
  return resultado
}

export async function rechazarCotizacion(id: string): Promise<Resultado> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  const resultado = await ejecutar(async (supabase) => {
    await servicio.rechazarCotizacion(supabase, id)
    return null
  }, 'Cotización rechazada')
  if (resultado.ok) revalidar(id)
  return resultado
}

export async function reabrirCotizacion(id: string): Promise<Resultado> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  const resultado = await ejecutar(async (supabase) => {
    await servicio.reabrirCotizacion(supabase, id)
    return null
  }, 'Cotización reabierta')
  if (resultado.ok) revalidar(id)
  return resultado
}

export async function revertirAprobacion(id: string): Promise<Resultado> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  const resultado = await ejecutar(async (supabase) => {
    await servicio.revertirAprobacion(supabase, id)
    return null
  }, 'Aprobación revertida')
  if (resultado.ok) {
    revalidar(id)
    revalidatePath('/presupuestos')
  }
  return resultado
}

export async function borrarCotizacion(id: string): Promise<Resultado> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  const resultado = await ejecutar(async (supabase) => {
    await servicio.borrarCotizacion(supabase, id)
    return null
  }, 'Cotización borrada')
  if (resultado.ok) revalidar(id)
  return resultado
}

/** Copia como borrador nuevo (renegociación del mismo cliente) y devuelve su id para abrirla. */
export async function duplicarCotizacion(id: string, clienteId?: string): Promise<Resultado<{ id: string }>> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  if (clienteId !== undefined && !esUuid(clienteId)) return fallo('Cliente inválido')
  const resultado = await ejecutar((supabase) => servicio.duplicarCotizacion(supabase, id, clienteId), 'Cotización duplicada')
  if (resultado.ok) revalidar(id, resultado.datos.id)
  return resultado
}

/** Para el combobox de cliente: sin acentos, por razón social, CUIT o contacto; los inactivos al final. */
export async function buscarClientes(
  texto: string,
): Promise<Resultado<{ id: string; razon_social: string; cuit: string | null; activo: boolean }[]>> {
  await requireUsuario()
  if (typeof texto !== 'string') return fallo('Búsqueda inválida')
  return ejecutar(async (supabase) => {
    const { data, error } = await supabase
      .rpc('buscar_clientes', { texto: texto.slice(0, 200), limite: 20 })
      .select('id, razon_social, cuit, activo')
    if (error) throw error
    return data
  })
}

const esquemaRazonSocial = textoRequerido('Ingresá la razón social')

/** Alta rápida desde el combobox: solo la razón social (el resto se completa después en Clientes). */
export async function crearClienteRapido(
  razonSocial: string,
): Promise<Resultado<{ id: string; razon_social: string; cuit: string | null }>> {
  await requireUsuario()
  const leido = esquemaRazonSocial.safeParse(razonSocial)
  if (!leido.success) return fallo(leido.error.issues[0].message)
  const resultado = await ejecutar(async (supabase) => {
    const { data, error } = await supabase
      .from('clientes')
      .insert({ razon_social: leido.data })
      .select('id, razon_social, cuit')
      .single()
    if (error) throw error
    return data
  }, 'Cliente creado')
  if (resultado.ok) revalidatePath('/clientes')
  return resultado
}

/** Contactos del cliente (por nombre) y el último que se usó en sus cotizaciones, para preseleccionarlo. */
export async function contactosDeCliente(
  clienteId: string,
): Promise<Resultado<{ contactos: { id: string; nombre: string; email: string }[]; ultimoContactoId: string | null }>> {
  await requireUsuario()
  if (!esUuid(clienteId)) return fallo(IDENTIFICADOR_INVALIDO)
  return ejecutar(async (supabase) => {
    const [contactos, ultima] = await Promise.all([
      supabase.from('contactos').select('id, nombre, email').eq('cliente_id', clienteId).order('nombre'),
      supabase
        .from('cotizaciones')
        .select('contacto_id')
        .eq('cliente_id', clienteId)
        .not('contacto_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (contactos.error) throw contactos.error
    if (ultima.error) throw ultima.error
    return { contactos: contactos.data, ultimoContactoId: ultima.data?.contacto_id ?? null }
  })
}
