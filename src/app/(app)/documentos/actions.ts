'use server'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'
import { requireStaff } from '@/lib/auth'
import { approveWithPurchaseOrder, ErrorQuote } from '@/lib/quotes/service'
import { contextoDocument } from '@/lib/documents/queries'
import { schemaSaveDocument } from '@/lib/documents/screens'
import { ErrorDocument, prepareUpload, registerDocument } from '@/lib/documents/service'
import { errorsByPath, databaseErrorMessage } from '@/lib/forms'
import type { Result } from '@/lib/result'
import { changeDocumentLifecycle, changePaymentStatus, financialDocumentData } from '@/lib/finance/service'
import { EQUIPMENT_REVENUE_PATH } from '@/lib/finance/report'
import { documentLifecycleSchema, paymentStatusActionSchema } from '@/lib/finance/schemas'
import { createClient } from '@/lib/supabase/server'

function fallo(error: unknown): Result<never> {
  unstable_rethrow(error)
  if (error instanceof ErrorDocument || error instanceof ErrorQuote) return { ok: false, message: error.message }
  if (typeof error === 'object' && error && 'code' in error && 'message' in error) {
    return { ok: false, message: databaseErrorMessage(error as { code: string; message: string }) }
  }
  console.error(error)
  return { ok: false, message: 'No se pudo completar la operación. Podés reintentar sin perder los datos.' }
}

function actualizarScreens() {
  revalidatePath('/presupuestos', 'layout')
  revalidatePath('/documentos', 'layout')
  revalidatePath(EQUIPMENT_REVENUE_PATH)
  revalidatePath('/')
}

export async function prepareFile(entrada: unknown): Promise<Result<{ path: string; signedUrl: string }>> {
  await requireStaff()
  const validado = z
    .object({
      clientId: z.uuid(),
      mime: z.string().max(100),
      tamano: z
        .number()
        .int()
        .positive()
        .max(10 * 1024 * 1024),
    })
    .safeParse(entrada)
  if (!validado.success) return { ok: false, message: 'Revisá el tipo y el tamaño del archivo (máximo 10 MB).' }
  try {
    return { ok: true, datos: await prepareUpload(await createClient(), validado.data) }
  } catch (error) {
    return fallo(error)
  }
}

export async function readDocumentContext(clientId: unknown) {
  await requireStaff()
  const id = z.uuid().safeParse(clientId)
  if (!id.success) return { ok: false as const, message: 'Cliente inválido' }
  try {
    return { ok: true as const, datos: await contextoDocument(await createClient(), id.data) }
  } catch (error) {
    return fallo(error)
  }
}

export async function saveDocument(entrada: unknown): Promise<Result<{ id: string; presupuesto: string | null }>> {
  await requireStaff()
  const validado = schemaSaveDocument.safeParse(entrada)
  if (!validado.success)
    return { ok: false, message: 'Revisá los datos marcados', errors: errorsByPath(validado.error) }
  const datos = validado.data
  try {
    const supabase = await createClient()
    let id = datos.id
    if (id) {
      const { data: document, error: query } = await supabase
        .from('documentos')
        .select('cliente_id, tipo')
        .eq('id', id)
        .single()
      if (query) throw query
      if (document.cliente_id !== datos.clientId) throw new ErrorDocument('El documento pertenece a otro cliente')
      if (!datos.budgets.length) {
        const { data: existingLinks, error: linkError } = await supabase.from('documento_presupuestos')
          .select('cotizacion_id').eq('documento_id', id).limit(1)
        if (linkError) throw linkError
        if (document.tipo !== 'factura' || existingLinks.length) throw new ErrorDocument('Elegí al menos un presupuesto')
      }
      const { error } = await supabase.rpc('actualizar_documento_con_archivos', {
        p_id: id,
        p_datos: financialDocumentData(datos.datos, datos.finance, datos.paymentCondition),
        ...(datos.budgets.length ? { p_presupuestos: datos.budgets } : {}),
        p_remitos: datos.datos.tipo === 'factura' ? datos.remitos : [],
        p_aplicaciones: datos.finance !== undefined ? null : datos.datos.tipo === 'orden_pago' ? datos.aplicaciones ?? null : [],
        p_archivos: datos.archivos,
        p_quitar: datos.quitar,
      })
      if (error) throw error
    } else if (datos.cotizacion) {
      id = await approveWithPurchaseOrder(
        supabase,
        datos.cotizacion.id,
        datos.cotizacion.version,
        datos.datos,
        datos.archivos,
      )
    } else {
      id = await registerDocument(supabase, {
        ...datos,
        remitos: datos.datos.tipo === 'factura' ? datos.remitos : [],
        ...(datos.finance !== undefined ? {} : { aplicaciones: datos.datos.tipo === 'orden_pago' ? datos.aplicaciones ?? [] : [] }),
      })
    }
    actualizarScreens()
    return { ok: true, datos: { id, presupuesto: datos.budgets[0] ?? null } }
  } catch (error) {
    return fallo(error)
  }
}

export async function changeVoidingDocument(id: unknown, restore: unknown, finance?: { expectedVersion?: number; correctionReason?: string }): Promise<Result> {
  await requireStaff()
  const validado = documentLifecycleSchema.safeParse({ id, restore, ...finance })
  if (!validado.success) return { ok: false, message: 'Documento inválido' }
  try {
    await changeDocumentLifecycle(await createClient(), validado.data)
    actualizarScreens()
    return { ok: true, datos: null }
  } catch (error) {
    return fallo(error)
  }
}

export async function changeInstrumentStatus(input: unknown): Promise<Result<{ financialVersion: number }>> {
  await requireStaff()
  const parsed = paymentStatusActionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Revisá los datos marcados', errors: errorsByPath(parsed.error) }
  try {
    const data = await changePaymentStatus(await createClient(), parsed.data)
    const result = z.object({ financialVersion: z.number().int().positive() }).parse(data)
    actualizarScreens()
    return { ok: true, datos: result }
  } catch (error) { return fallo(error) }
}
