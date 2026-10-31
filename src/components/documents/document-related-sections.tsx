import { Card } from '@/components/form/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatAmountTable, formatMoneda } from '@/lib/format/amounts'
import Link from 'next/link'

import { changeList, type documentFormSelections } from './document-form-model'
import type { DocumentFormProps } from './document-form.types'
import type { DocumentFormState } from './use-document-form'

type RelatedSelections = ReturnType<typeof documentFormSelections>

export function LinkedBudgetsSection({
  budgetsClient,
  seleccionados,
  setSeleccionados,
}: Pick<RelatedSelections, 'budgetsClient'> & Pick<DocumentFormState, 'seleccionados' | 'setSeleccionados'>) {
  return (
    <Card
      titulo="Presupuestos vinculados"
      descripcion="Podés compartir este documento entre presupuestos del mismo cliente."
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Presupuestos vinculados</legend>
        {budgetsClient.map((item) => (
          <label key={item.id} className="flex items-start gap-2 rounded-md px-1 py-1.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={seleccionados.includes(item.id)}
              onChange={(evento) => setSeleccionados((list) => changeList(list, item.id, evento.target.checked))}
            />
            <span>
              N° {item.numero} · {item.asunto}
            </span>
          </label>
        ))}
      </fieldset>
    </Card>
  )
}

export function InvoiceDeliveryNotesSection({
  deliveryNotesDisponibles,
  remitos,
  setDeliveryNotes,
}: Pick<RelatedSelections, 'deliveryNotesDisponibles'> & Pick<DocumentFormState, 'remitos' | 'setDeliveryNotes'>) {
  return (
    <Card titulo="Remitos que cubre" descripcion="Elegí los remitos del cliente incluidos en esta factura.">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Remitos que cubre</legend>
        {deliveryNotesDisponibles.length ? (
          deliveryNotesDisponibles.map((item) => (
            <label key={item.id} className="flex items-start gap-2 py-1.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={remitos.includes(item.id)}
                onChange={(evento) => setDeliveryNotes((list) => changeList(list, item.id, evento.target.checked))}
              />
              <span>
                Remito {item.numero || 'sin número'}
                {item.deleted_at ? (
                  <span className="block text-xs text-destructive">
                    Anulado: desmarcalo para desvincularlo o{' '}
                    <Link href={`/documentos/${item.id}`} className="underline">
                      abrilo para restaurarlo
                    </Link>
                    .
                  </span>
                ) : null}
              </span>
            </label>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No hay remitos pendientes de facturar.</p>
        )}
      </fieldset>
    </Card>
  )
}

export function PaymentAllocationsSection({
  invoicesAnuladas,
  aplicaciones,
  changeAplicacion,
  contexto,
  aplicacionesIniciales,
}: Pick<RelatedSelections, 'invoicesAnuladas'> &
  Pick<DocumentFormState, 'aplicaciones' | 'changeAplicacion' | 'contexto'> & {
    aplicacionesIniciales: NonNullable<DocumentFormProps['aplicacionesIniciales']>
  }) {
  return (
    <Card titulo="Facturas que cancela" descripcion="El importe se completa con el saldo disponible; podés ajustarlo.">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Facturas que cancela</legend>
        {invoicesAnuladas.map((item) => (
          <Alert key={item.id} variant="destructive">
            <AlertDescription>
              <p>
                La factura {item.numero || 'sin número'} está anulada.{' '}
                <Link href={`/documentos/${item.id}`} className="underline">
                  Abrila para restaurarla
                </Link>{' '}
                o quitá esta aplicación antes de guardar.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => changeAplicacion(item.id, null)}>
                Desvincular factura {item.numero || 'sin número'}
              </Button>
            </AlertDescription>
          </Alert>
        ))}
        {contexto.facturas
          .filter(
            (item) =>
              item.tipo_comprobante !== 'NC' &&
              ((item.saldo ?? 0) > 0 || (item.id && aplicaciones[item.id] !== undefined)),
          )
          .map((item) => {
            const id = item.id!
            const disponible =
              (item.saldo ?? 0) +
              (aplicacionesIniciales.find((aplicacion) => aplicacion.factura_id === id)?.monto_aplicado ?? 0)
            return (
              <div key={id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={aplicaciones[id] !== undefined}
                    onChange={(evento) =>
                      changeAplicacion(id, evento.target.checked ? formatAmountTable(disponible) : null)
                    }
                  />
                  <span>
                    {[item.tipo_comprobante, item.numero || 'Sin número'].join(' ')}
                    <span className="block text-xs text-muted-foreground">
                      Saldo disponible {formatMoneda(disponible)}
                    </span>
                  </span>
                </label>
                {aplicaciones[id] !== undefined ? (
                  <Input
                    className="w-36"
                    aria-label={`Importe aplicado a ${item.numero || 'factura sin número'}`}
                    inputMode="decimal"
                    value={aplicaciones[id]}
                    onChange={(evento) => changeAplicacion(id, evento.target.value)}
                    required
                  />
                ) : null}
              </div>
            )
          })}
        {!contexto.facturas.some(
          (item) =>
            item.tipo_comprobante !== 'NC' &&
            ((item.saldo ?? 0) > 0 || (item.id && aplicaciones[item.id] !== undefined)),
        ) ? (
          <p className="text-sm text-muted-foreground">No hay facturas con saldo para este cliente.</p>
        ) : null}
      </fieldset>
    </Card>
  )
}
