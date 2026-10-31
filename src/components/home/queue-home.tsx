import { ArrowRight, Mail, Phone } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Count } from '@/components/ui/count'
import { Pill } from '@/components/ui/pill'
import { formatShortDate } from '@/lib/format/dates'
import { formatCurrency } from '@/lib/format/amounts'
import type { PendingHome, ResumenHome } from '@/lib/home/queries'
import { antiguedadCobranza, QUEUES_HOME, vencimientoPending, type QueueHome } from '@/lib/home/model'

function actionPending(row: PendingHome, cola: QueueHome) {
  const budget = `/presupuestos/${row.presupuesto_id}`
  switch (cola) {
    case 'seguimiento': return { href: `/cotizaciones/${row.id}`, texto: 'Registrar respuesta' }
    case 'falta_oc': return { href: `${budget}?nuevo=orden_compra`, texto: 'Cargar OC' }
    case 'para_facturar': return {
      href: row.presupuesto_id ? `${budget}?nuevo=factura&remito=${row.id}` : `/documentos/${row.id}`,
      texto: row.presupuesto_id ? 'Facturar' : 'Ver remito',
    }
    case 'cobranzas': return {
      href: row.presupuesto_id ? `${budget}?nuevo=orden_pago&factura=${row.id}` : `/documentos/${row.id}`,
      texto: row.presupuesto_id ? 'Registrar pago' : 'Ver factura',
    }
    case 'actualizacion': return { href: `/cotizaciones/${row.id}`, texto: 'Actualizar' }
  }
}

function DetailPending({ fila: row, cola, today }: { fila: PendingHome; cola: QueueHome; today: string }) {
  if (cola === 'seguimiento') {
    const vencimiento = row.vence_el ? vencimientoPending(row.vence_el, today) : null
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Último envío hace {Math.max(row.dias ?? 0, 0)} d</span>
          {vencimiento ? <Pill tone={vencimiento.tone}>{vencimiento.texto}</Pill> : null}
        </div>
        {row.contacto_nombre ? <p className="text-xs text-muted-foreground">{row.contacto_nombre}</p> : null}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {row.telefono ? (
            <a href={`tel:${row.telefono.replace(/[^+\d]/g, '')}`} className="inline-flex items-center gap-1 hover:underline">
              <Phone className="size-3" aria-hidden />{row.telefono}
            </a>
          ) : null}
          {row.email ? (
            <a href={`mailto:${row.email}`} className="inline-flex min-w-0 items-center gap-1 hover:underline">
              <Mail className="size-3 shrink-0" aria-hidden /><span className="break-all">{row.email}</span>
            </a>
          ) : null}
          {!row.telefono && !row.email ? <span className="text-muted-foreground">Sin teléfono ni email cargados.</span> : null}
        </div>
      </div>
    )
  }
  if (cola === 'cobranzas') {
    const antiguedad = antiguedadCobranza(row.dias ?? 0)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold tabular-nums">{formatCurrency(row.importe ?? 0)}</p>
        <Pill tone={antiguedad.tone}>{antiguedad.texto}</Pill>
        {row.vence_el ? <span className="text-xs text-muted-foreground">Vencimiento {formatShortDate(row.vence_el)}</span> : null}
      </div>
    )
  }
  if (cola === 'actualizacion' && row.fecha_referencia) {
    return <p className="text-xs text-muted-foreground">{(row.dias ?? 0) > 0 ? 'Actualización vencida' : 'Actualizar'} · {formatShortDate(row.fecha_referencia)}</p>
  }
  if (cola === 'para_facturar' && row.fecha_referencia && row.vence_el) {
    return <p className="text-xs text-muted-foreground">Período {formatShortDate(row.fecha_referencia)} – {formatShortDate(row.vence_el)}</p>
  }
  return row.fecha ? <p className="text-xs text-muted-foreground">{formatShortDate(row.fecha)}</p> : null
}

export function QueueHome({
  cola, resumen, rows, today, complete = false, className,
}: {
  cola: QueueHome
  resumen?: ResumenHome
  rows: PendingHome[]
  today: string
  complete?: boolean
  className?: string
}) {
  const datos = QUEUES_HOME[cola]
  return (
    <section aria-labelledby={`cola-${cola}`} className={className} data-cola={cola}>
      <Card className="h-full">
        <CardHeader className="border-b">
          <CardTitle><h2 id={`cola-${cola}`}>{datos.titulo}</h2></CardTitle>
          <CardDescription>{datos.descripcion}</CardDescription>
          <CardAction><Count>{resumen?.cantidad ?? 0}</Count></CardAction>
        </CardHeader>
        <CardContent className="flex-1">
          {cola === 'cobranzas' ? (
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
              <p className="text-xs text-muted-foreground">Pendiente de cobro</p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums" data-testid="total-cobranzas">{formatCurrency(resumen?.importe ?? 0)}</p>
            </div>
          ) : null}
          {rows.length ? (
            <ul className="flex flex-col divide-y">
              {rows.map((row) => {
                const accion = actionPending(row, cola)
                const href = cola === 'seguimiento' || cola === 'actualizacion'
                  ? `/cotizaciones/${row.id}`
                  : cola === 'falta_oc' ? `/presupuestos/${row.id}` : `/documentos/${row.id}`
                return (
                  <li key={row.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-pendiente={row.id}>
                    <Link href={href} className="flex flex-col gap-0.5 hover:text-primary">
                      <span className="font-medium">{cola === 'para_facturar' ? 'Remito ' : cola === 'cobranzas' ? '' : 'N° '}{row.numero || 'Sin número'}</span>
                      <span className="text-sm">{row.cliente_razon_social}</span>
                    </Link>
                    {row.asunto && cola !== 'seguimiento' ? <p className="line-clamp-2 text-xs text-muted-foreground">{row.asunto}</p> : null}
                    <DetailPending fila={row} cola={cola} today={today} />
                    <Link href={accion.href} className="self-end text-sm font-medium text-primary underline-offset-4 hover:underline">
                      {accion.texto}<span className="sr-only"> · {row.numero || row.cliente_razon_social}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-3 py-3">
              <p className="text-sm text-muted-foreground">{complete && (resumen?.cantidad ?? 0) > 0 ? 'No hay más pendientes en esta página.' : datos.empty}</p>
              <Link href={datos.enlaceEmpty} className="text-sm font-medium text-primary hover:underline">{datos.actionEmpty}</Link>
            </div>
          )}
        </CardContent>
        {!complete && (resumen?.cantidad ?? 0) > 0 ? (
          <CardFooter>
            <Button variant="ghost" size="sm" asChild className="w-full">
              <Link href={`/?cola=${cola}`}>Ver todos ({resumen?.cantidad})<ArrowRight data-icon="inline-end" aria-hidden /></Link>
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </section>
  )
}
