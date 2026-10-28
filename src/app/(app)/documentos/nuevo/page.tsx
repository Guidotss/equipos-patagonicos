import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarraMigas, Contenido } from '@/components/app-shell/encabezado'
import { EncabezadoFormulario } from '@/components/formulario/estructura-formulario'
import { DocumentoForm } from '@/components/documentos/documento-form'
import { TIPOS_DOCUMENTO, type TipoDocumento } from '@/lib/documentos/esquemas'
import { contextoDocumento } from '@/lib/documentos/lecturas'
import type { OpcionPresupuesto } from '@/lib/documentos/pantallas'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export const metadata: Metadata = { title: 'Subir documento' }
export default async function NuevoDocumentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const consulta = await searchParams
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_presupuestos')
    .select('id, numero, cliente_id, cliente_razon_social, asunto, presupuesto_estado')
    .neq('presupuesto_estado', 'anulado')
    .order('numero', { ascending: false })
  if (error) throw error
  const opciones = data as OpcionPresupuesto[]
  let presupuesto =
    typeof consulta.presupuesto === 'string' ? opciones.find((item) => item.id === consulta.presupuesto) : undefined
  let cotizacion: { id: string; version: string } | undefined
  if (typeof consulta.cotizacion === 'string') {
    if (!esUuid(consulta.cotizacion)) notFound()
    const { data: original, error } = await supabase
      .from('cotizaciones')
      .select('id, updated_at, numero, cliente_id, asunto, estado, cliente:clientes(razon_social)')
      .eq('id', consulta.cotizacion)
      .maybeSingle()
    if (error) throw error
    if (!original || original.estado !== 'enviada') notFound()
    presupuesto = {
      id: original.id,
      numero: original.numero,
      cliente_id: original.cliente_id,
      asunto: original.asunto,
      cliente_razon_social: original.cliente.razon_social,
      presupuesto_estado: 'en_curso',
    }
    opciones.unshift(presupuesto)
    cotizacion = { id: original.id, version: typeof consulta.version === 'string' ? consulta.version : original.updated_at }
  }
  const tipo = cotizacion
    ? 'orden_compra'
    : typeof consulta.tipo === 'string' && Object.hasOwn(TIPOS_DOCUMENTO, consulta.tipo)
      ? (consulta.tipo as TipoDocumento)
      : 'remito'
  const contexto = presupuesto ? await contextoDocumento(supabase, presupuesto.cliente_id) : undefined
  return (
    <>
      <BarraMigas migas={[{ texto: 'Presupuestos', href: '/presupuestos' }, { texto: 'Subir documento' }]} />
      <Contenido className="max-w-6xl">
        <EncabezadoFormulario
          titulo="Subir documento"
          descripcion={
            cotizacion
              ? `Cotización N° ${presupuesto!.numero} · ${presupuesto!.cliente_razon_social}`
              : 'Elegí un presupuesto y adjuntá los documentos del cliente.'
          }
        />
        <DocumentoForm
          opciones={opciones}
          presupuestoId={presupuesto?.id}
          contextoInicial={contexto}
          tipo={tipo}
          cotizacion={cotizacion}
        />
      </Contenido>
    </>
  )
}
