import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarCrumbs, Content } from '@/components/app-shell/header'
import { HeaderForm } from '@/components/form/structure-form'
import { DocumentForm } from '@/components/documents/document-form'
import { TIPOS_DOCUMENT, type TipoDocument } from '@/lib/documents/schemas'
import { contextoDocument } from '@/lib/documents/queries'
import type { OptionBudget } from '@/lib/documents/screens'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'

export const metadata: Metadata = { title: 'Subir documento' }
export default async function NewDocumentPage({
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
  const options = data as OptionBudget[]
  let budget =
    typeof consulta.presupuesto === 'string' ? options.find((item) => item.id === consulta.presupuesto) : undefined
  let quote: { id: string; version: string } | undefined
  if (typeof consulta.cotizacion === 'string') {
    if (!isUuid(consulta.cotizacion)) notFound()
    const { data: original, error } = await supabase
      .from('cotizaciones')
      .select('id, updated_at, numero, cliente_id, asunto, estado, cliente:clientes(razon_social)')
      .eq('id', consulta.cotizacion)
      .maybeSingle()
    if (error) throw error
    if (!original || original.estado !== 'enviada') notFound()
    budget = {
      id: original.id,
      numero: original.numero,
      cliente_id: original.cliente_id,
      asunto: original.asunto,
      cliente_razon_social: original.cliente.razon_social,
      presupuesto_estado: 'en_curso',
    }
    options.unshift(budget)
    quote = { id: original.id, version: typeof consulta.version === 'string' ? consulta.version : original.updated_at }
  }
  const tipo = quote
    ? 'orden_compra'
    : typeof consulta.tipo === 'string' && Object.hasOwn(TIPOS_DOCUMENT, consulta.tipo)
      ? (consulta.tipo as TipoDocument)
      : 'remito'
  const contexto = budget ? await contextoDocument(supabase, budget.cliente_id) : undefined
  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Presupuestos', href: '/presupuestos' }, { texto: 'Subir documento' }]} />
      <Content className="max-w-6xl">
        <HeaderForm
          titulo="Subir documento"
          descripcion={
            quote
              ? `Cotización N° ${budget!.numero} · ${budget!.cliente_razon_social}`
              : 'Elegí un presupuesto y adjuntá los documentos del cliente.'
          }
        />
        <DocumentForm
          options={options}
          budgetId={budget?.id}
          contextoInitial={contexto}
          tipo={tipo}
          cotizacion={quote}
        />
      </Content>
    </>
  )
}
