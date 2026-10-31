import { FileText, Plus } from 'lucide-react'
import Link from 'next/link'
import { AccionesDocumento } from '@/components/documentos/acciones-documento'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Button } from '@/components/ui/button'
import { Pastilla } from '@/components/ui/pastilla'
import { TIPOS_DOCUMENTO, type TipoDocumento } from '@/lib/documentos/esquemas'
import {
  ESTADOS_COBRO,
  numeroDocumento,
  type ArchivoDocumento,
  type Documento,
  type Factura,
} from '@/lib/documentos/pantallas'
import { formatMoneda } from '@/lib/format/montos'
import { formatFechaCorta } from '@/lib/format/fechas'

const TITULOS: Record<TipoDocumento, string> = {
  orden_compra: 'Órdenes de compra',
  remito: 'Remitos',
  factura: 'Facturas',
  orden_pago: 'Órdenes de pago',
}

export function SeccionesDocumentos({
  presupuestoId,
  documentos,
  archivos,
  facturas,
  anulados,
  aplicaciones,
}: {
  presupuestoId: string
  documentos: Documento[]
  archivos: ArchivoDocumento[]
  facturas: Factura[]
  anulados: boolean
  aplicaciones: { op_id: string; factura_id: string; monto_aplicado: number }[]
}) {
  return (
    <div className="flex flex-col gap-4">
      {(Object.keys(TIPOS_DOCUMENTO) as TipoDocumento[]).map((tipo) => {
        const lista = documentos.filter((item) => item.tipo === tipo)
        const activos = lista.filter((item) => !item.deleted_at)
        return (
          <Tarjeta
            key={tipo}
            titulo={`${TITULOS[tipo]} · ${activos.length}`}
            compacta
            acciones={
              !anulados ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/presupuestos/${presupuestoId}?nuevo=${tipo}#nuevo-documento`}>
                    <Plus data-icon="inline-start" />
                    Agregar<span className="sr-only"> {TIPOS_DOCUMENTO[tipo]}</span>
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {lista.length ? (
              <ul className="flex flex-col divide-y">
                {lista.map((documento) => {
                  const factura = facturas.find((item) => item.id === documento.id)
                  const facturado = documento.factura_id && facturas.some((item) => item.id === documento.factura_id)
                  const documentoArchivos = archivos.filter((item) => item.documento_id === documento.id)
                  const pagos = aplicaciones.filter((item) => item.op_id === documento.id)
                  return (
                    <li
                      key={documento.id}
                      className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0"
                      data-documento={documento.id}
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <FileText aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/documentos/${documento.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {numeroDocumento(documento)}
                            </Link>
                            {documento.deleted_at ? (
                              <Pastilla>Anulado</Pastilla>
                            ) : factura?.estado_cobro ? (
                              <Pastilla
                                tono={
                                  factura.estado_cobro === 'cobrada'
                                    ? 'exito'
                                    : factura.estado_cobro === 'parcial'
                                      ? 'info'
                                      : 'aviso'
                                }
                              >
                                {ESTADOS_COBRO[factura.estado_cobro]}
                              </Pastilla>
                            ) : tipo === 'remito' ? (
                              <Pastilla tono={facturado ? 'exito' : 'aviso'}>
                                {facturado ? 'Facturado' : 'Sin facturar'}
                              </Pastilla>
                            ) : null}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {documento.fecha ? formatFechaCorta(documento.fecha) : 'Sin fecha'}
                            {documento.monto
                              ? ` · ${tipo === 'factura' ? 'Total ' : ''}${formatMoneda(documento.monto)}`
                              : ''}
                            {factura ? ` · Saldo ${formatMoneda(factura.saldo ?? 0)}` : ''}
                            {documento.fecha_vencimiento
                              ? ` · Vence ${formatFechaCorta(documento.fecha_vencimiento)}`
                              : ''}
                          </p>
                          {documento.periodo_desde || documento.periodo_hasta ? (
                            <p className="text-sm text-muted-foreground">
                              Período {documento.periodo_desde ? formatFechaCorta(documento.periodo_desde) : '—'} –{' '}
                              {documento.periodo_hasta ? formatFechaCorta(documento.periodo_hasta) : '—'}
                            </p>
                          ) : null}
                          {pagos.length ? (
                            <p className="text-xs text-muted-foreground">
                              Aplica a{' '}
                              {pagos
                                .map((pago) => {
                                  const item = documentos.find((item) => item.id === pago.factura_id)
                                  return `${item ? numeroDocumento(item) : 'factura vinculada'} (${formatMoneda(pago.monto_aplicado)})`
                                })
                                .join(', ')}
                            </p>
                          ) : null}
                          {documento.notas ? (
                            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{documento.notas}</p>
                          ) : null}
                          <ul className="flex flex-wrap gap-x-4 gap-y-1">
                            {documentoArchivos.map((archivo) => (
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
                          {!documento.deleted_at ? (
                            <>
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/documentos/${documento.id}`}>Editar</Link>
                              </Button>
                              {tipo === 'remito' && !facturado && !anulados ? (
                                <Button variant="outline" size="sm" asChild>
                                  <Link
                                    href={`/presupuestos/${presupuestoId}?nuevo=factura&remito=${documento.id}#nuevo-documento`}
                                  >
                                    Facturar
                                  </Link>
                                </Button>
                              ) : null}
                              {factura && (factura.saldo ?? 0) > 0 && !anulados ? (
                                <Button variant="outline" size="sm" asChild>
                                  <Link
                                    href={`/presupuestos/${presupuestoId}?nuevo=orden_pago&factura=${documento.id}#nuevo-documento`}
                                  >
                                    Registrar pago
                                  </Link>
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                          <AccionesDocumento id={documento.id} anulado={Boolean(documento.deleted_at)} />
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no hay {TITULOS[tipo].toLowerCase()}.</p>
            )}
          </Tarjeta>
        )
      })}
    </div>
  )
}
