import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BarCrumbs, Content } from '@/components/app-shell/header'
import { HeaderForm } from '@/components/form/structure-form'
import { ActionsDocument } from '@/components/documents/actions-document'
import { DocumentForm } from '@/components/documents/document-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TIPOS_DOCUMENT, type TipoDocument } from '@/lib/documents/schemas'
import { contextoDocument } from '@/lib/documents/queries'
import { numberDocument } from '@/lib/documents/screens'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'

export const metadata: Metadata = { title: 'Documento' }
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const supabase = await createClient()
  const { data: document, error } = await supabase.from('documentos').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!document) notFound()
  const [contexto, archivos, vinculos, aplicaciones] = await Promise.all([
    contextoDocument(supabase, document.cliente_id),
    supabase.from('documento_archivos').select('*').eq('documento_id', id).order('orden'),
    supabase.from('documento_presupuestos').select('cotizacion_id').eq('documento_id', id),
    supabase.from('op_facturas').select('factura_id, monto_aplicado').eq('op_id', id),
  ])
  for (const result of [archivos, vinculos, aplicaciones]) if (result.error) throw result.error
  const budgetId = vinculos.data![0]?.cotizacion_id
  return (
    <>
      <BarCrumbs
        crumbs={[
          { texto: 'Presupuestos', href: '/presupuestos' },
          ...(budgetId
            ? [
                {
                  texto: String(
                    contexto.budgets.find((item) => item.id === budgetId)?.numero ?? 'Presupuesto',
                  ),
                  href: `/presupuestos/${budgetId}`,
                },
              ]
            : []),
          { texto: numberDocument(document) },
        ]}
      />
      <Content className="max-w-6xl">
        <HeaderForm
          titulo={`${TIPOS_DOCUMENT[document.tipo as TipoDocument]} · ${numberDocument(document)}`}
        />
        {document.deleted_at ? (
          <>
            <Alert>
              <AlertDescription>
                Este documento está anulado. Sus archivos y vínculos se conservan. Para restaurar un pago, sus facturas
                deben estar vigentes y tener saldo disponible.
              </AlertDescription>
            </Alert>
            <ActionsDocument id={id} anulado />
            {aplicaciones.data!.length ? (
              <ul className="flex flex-col gap-2">
                {aplicaciones.data!.map((item) => (
                  <li key={item.factura_id}>
                    <Link href={`/documentos/${item.factura_id}`} className="text-sm text-primary underline">
                      Revisar factura{' '}
                      {contexto.documentos.find((invoice) => invoice.id === item.factura_id)?.numero || 'sin número'}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <ul className="flex flex-col gap-2">
              {archivos.data!.map((archivo) => (
                <li key={archivo.id}>
                  <a
                    href={`/documentos/archivos/${archivo.id}`}
                    target="_blank"
                    className="text-sm text-primary underline"
                  >
                    {archivo.nombre_original}
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <DocumentForm
            options={contexto.budgets}
            budgetId={budgetId}
            contextoInitial={contexto}
            document={document}
            filesExisting={archivos.data!}
            vinculos={vinculos.data!.map((item) => item.cotizacion_id)}
            aplicacionesIniciales={aplicaciones.data!}
          />
        )}
      </Content>
    </>
  )
}
