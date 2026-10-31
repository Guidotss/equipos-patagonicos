import { FileText, Plus } from 'lucide-react'
import Link from 'next/link'
import { ActionsDocument } from '@/components/documents/actions-document'
import { Card } from '@/components/form/card'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { DOCUMENT_TYPES, type DocumentType } from '@/lib/documents/schemas'
import {
  STATUSES_COBRO,
  numberDocument,
  type FileDocument,
  type Document,
  type Invoice,
} from '@/lib/documents/screens'
import { formatCurrency } from '@/lib/format/amounts'
import { formatShortDate } from '@/lib/format/dates'

const TITULOS: Record<DocumentType, string> = {
  orden_compra: 'Órdenes de compra',
  remito: 'Remitos',
  factura: 'Facturas',
  orden_pago: 'Órdenes de pago',
}

export function SectionsDocuments({
  budgetId,
  documentos,
  archivos,
  facturas,
  anulados,
  aplicaciones,
}: {
  budgetId: string
  documentos: Document[]
  archivos: FileDocument[]
  facturas: Invoice[]
  anulados: boolean
  aplicaciones: { op_id: string; factura_id: string; monto_aplicado: number }[]
}) {
  return (
    <div className="flex flex-col gap-4">
      {(Object.keys(DOCUMENT_TYPES) as DocumentType[]).map((tipo) => {
        const list = documentos.filter((item) => item.tipo === tipo)
        const activos = list.filter((item) => !item.deleted_at)
        return (
          <Card
            key={tipo}
            titulo={`${TITULOS[tipo]} · ${activos.length}`}
            compacta
            actions={
              !anulados ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/presupuestos/${budgetId}?nuevo=${tipo}#nuevo-documento`}>
                    <Plus data-icon="inline-start" />
                    Agregar<span className="sr-only"> {DOCUMENT_TYPES[tipo]}</span>
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {list.length ? (
              <ul className="flex flex-col divide-y">
                {list.map((document) => {
                  const invoice = facturas.find((item) => item.id === document.id)
                  const facturado = document.factura_id && facturas.some((item) => item.id === document.factura_id)
                  const documentFiles = archivos.filter((item) => item.documento_id === document.id)
                  const pagos = aplicaciones.filter((item) => item.op_id === document.id)
                  return (
                    <li
                      key={document.id}
                      className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0"
                      data-documento={document.id}
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <FileText aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/documentos/${document.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {numberDocument(document)}
                            </Link>
                            {document.deleted_at ? (
                              <Pill>Anulado</Pill>
                            ) : invoice?.estado_cobro ? (
                              <Pill
                                tone={
                                  invoice.estado_cobro === 'cobrada'
                                    ? 'exito'
                                    : invoice.estado_cobro === 'parcial'
                                      ? 'info'
                                      : 'aviso'
                                }
                              >
                                {STATUSES_COBRO[invoice.estado_cobro]}
                              </Pill>
                            ) : tipo === 'remito' ? (
                              <Pill tone={facturado ? 'exito' : 'aviso'}>
                                {facturado ? 'Facturado' : 'Sin facturar'}
                              </Pill>
                            ) : null}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {document.fecha ? formatShortDate(document.fecha) : 'Sin fecha'}
                            {document.monto
                              ? ` · ${tipo === 'factura' ? 'Total ' : ''}${formatCurrency(document.monto)}`
                              : ''}
                            {invoice ? ` · Saldo ${formatCurrency(invoice.saldo ?? 0)}` : ''}
                            {document.fecha_vencimiento
                              ? ` · Vence ${formatShortDate(document.fecha_vencimiento)}`
                              : ''}
                          </p>
                          {document.periodo_desde || document.periodo_hasta ? (
                            <p className="text-sm text-muted-foreground">
                              Período {document.periodo_desde ? formatShortDate(document.periodo_desde) : '—'} –{' '}
                              {document.periodo_hasta ? formatShortDate(document.periodo_hasta) : '—'}
                            </p>
                          ) : null}
                          {pagos.length ? (
                            <p className="text-xs text-muted-foreground">
                              Aplica a{' '}
                              {pagos
                                .map((pago) => {
                                  const item = documentos.find((item) => item.id === pago.factura_id)
                                  return `${item ? numberDocument(item) : 'factura vinculada'} (${formatCurrency(pago.monto_aplicado)})`
                                })
                                .join(', ')}
                            </p>
                          ) : null}
                          {document.notas ? (
                            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{document.notas}</p>
                          ) : null}
                          <ul className="flex flex-wrap gap-x-4 gap-y-1">
                            {documentFiles.map((archivo) => (
                              <li key={archivo.id} className="min-w-0 max-w-full">
                                <a
                                  href={`/documentos/archivos/${archivo.id}`}
                                  target="_blank"
                                  className="block truncate text-xs text-primary underline underline-offset-2"
                                >
                                  {archivo.nombre_original}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex flex-wrap items-start gap-2">
                          {!document.deleted_at ? (
                            <>
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/documentos/${document.id}`}>Editar</Link>
                              </Button>
                              {tipo === 'remito' && !facturado && !anulados ? (
                                <Button variant="outline" size="sm" asChild>
                                  <Link
                                    href={`/presupuestos/${budgetId}?nuevo=factura&remito=${document.id}#nuevo-documento`}
                                  >
                                    Facturar
                                  </Link>
                                </Button>
                              ) : null}
                              {invoice && (invoice.saldo ?? 0) > 0 && !anulados ? (
                                <Button variant="outline" size="sm" asChild>
                                  <Link
                                    href={`/presupuestos/${budgetId}?nuevo=orden_pago&factura=${document.id}#nuevo-documento`}
                                  >
                                    Registrar pago
                                  </Link>
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                          <ActionsDocument id={document.id} anulado={Boolean(document.deleted_at)} />
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no hay {TITULOS[tipo].toLowerCase()}.</p>
            )}
          </Card>
        )
      })}
    </div>
  )
}
