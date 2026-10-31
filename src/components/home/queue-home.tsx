import { ArrowRight, Mail, Phone } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Conteo } from '@/components/ui/conteo'
import { Pastilla } from '@/components/ui/pastilla'
import { formatFechaCorta } from '@/lib/format/fechas'
import { formatMoneda } from '@/lib/format/montos'
import type { PendienteInicio, ResumenInicio } from '@/lib/inicio/lecturas'
import { antiguedadCobranza, COLAS_INICIO, vencimientoPendiente, type ColaInicio } from '@/lib/inicio/modelo'

function accionPendiente(fila: PendienteInicio, cola: ColaInicio) {
  const presupuesto = `/presupuestos/${fila.presupuesto_id}`
  switch (cola) {
    case 'seguimiento': return { href: `/cotizaciones/${fila.id}`, texto: 'Registrar respuesta' }
    case 'falta_oc': return { href: `${presupuesto}?nuevo=orden_compra`, texto: 'Cargar OC' }
    case 'para_facturar': return {
      href: fila.presupuesto_id ? `${presupuesto}?nuevo=factura&remito=${fila.id}` : `/documentos/${fila.id}`,
      texto: fila.presupuesto_id ? 'Facturar' : 'Ver remito',
    }
    case 'cobranzas': return {
      href: fila.presupuesto_id ? `${presupuesto}?nuevo=orden_pago&factura=${fila.id}` : `/documentos/${fila.id}`,
      texto: fila.presupuesto_id ? 'Registrar pago' : 'Ver factura',
    }
    case 'actualizacion': return { href: `/cotizaciones/${fila.id}`, texto: 'Actualizar' }
  }
}

function DetallePendiente({ fila, cola, hoy }: { fila: PendienteInicio; cola: ColaInicio; hoy: string }) {
  if (cola === 'seguimiento') {
    const vencimiento = fila.vence_el ? vencimientoPendiente(fila.vence_el, hoy) : null
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Último envío hace {Math.max(fila.dias ?? 0, 0)} d</span>
          {vencimiento ? <Pastilla tono={vencimiento.tono}>{vencimiento.texto}</Pastilla> : null}
        </div>
        {fila.contacto_nombre ? <p className="text-xs text-muted-foreground">{fila.contacto_nombre}</p> : null}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {fila.telefono ? (
            <a href={`tel:${fila.telefono.replace(/[^+\d]/g, '')}`} className="inline-flex items-center gap-1 hover:underline">
              <Phone className="size-3" aria-hidden />{fila.telefono}
            </a>
          ) : null}
          {fila.email ? (
            <a href={`mailto:${fila.email}`} className="inline-flex min-w-0 items-center gap-1 hover:underline">
              <Mail className="size-3 shrink-0" aria-hidden /><span className="break-all">{fila.email}</span>
            </a>
          ) : null}
          {!fila.telefono && !fila.email ? <span className="text-muted-foreground">Sin teléfono ni email cargados.</span> : null}
        </div>
      </div>
    )
  }
  if (cola === 'cobranzas') {
    const antiguedad = antiguedadCobranza(fila.dias ?? 0)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold tabular-nums">{formatMoneda(fila.importe ?? 0)}</p>
        <Pastilla tono={antiguedad.tono}>{antiguedad.texto}</Pastilla>
        {fila.vence_el ? <span className="text-xs text-muted-foreground">Vencimiento {formatFechaCorta(fila.vence_el)}</span> : null}
      </div>
    )
  }
  if (cola === 'actualizacion' && fila.fecha_referencia) {
    return <p className="text-xs text-muted-foreground">{(fila.dias ?? 0) > 0 ? 'Actualización vencida' : 'Actualizar'} · {formatFechaCorta(fila.fecha_referencia)}</p>
  }
  if (cola === 'para_facturar' && fila.fecha_referencia && fila.vence_el) {
    return <p className="text-xs text-muted-foreground">Período {formatFechaCorta(fila.fecha_referencia)} – {formatFechaCorta(fila.vence_el)}</p>
  }
  return fila.fecha ? <p className="text-xs text-muted-foreground">{formatFechaCorta(fila.fecha)}</p> : null
}

export function ColaInicio({
  cola, resumen, filas, hoy, completa = false, className,
}: {
  cola: ColaInicio
  resumen?: ResumenInicio
  filas: PendienteInicio[]
  hoy: string
  completa?: boolean
  className?: string
}) {
  const datos = COLAS_INICIO[cola]
  return (
    <section aria-labelledby={`cola-${cola}`} className={className} data-cola={cola}>
      <Card className="h-full">
        <CardHeader className="border-b">
          <CardTitle><h2 id={`cola-${cola}`}>{datos.titulo}</h2></CardTitle>
          <CardDescription>{datos.descripcion}</CardDescription>
          <CardAction><Conteo>{resumen?.cantidad ?? 0}</Conteo></CardAction>
        </CardHeader>
        <CardContent className="flex-1">
          {cola === 'cobranzas' ? (
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
              <p className="text-xs text-muted-foreground">Pendiente de cobro</p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums" data-testid="total-cobranzas">{formatMoneda(resumen?.importe ?? 0)}</p>
            </div>
          ) : null}
          {filas.length ? (
            <ul className="flex flex-col divide-y">
              {filas.map((fila) => {
                const accion = accionPendiente(fila, cola)
                const href = cola === 'seguimiento' || cola === 'actualizacion'
                  ? `/cotizaciones/${fila.id}`
                  : cola === 'falta_oc' ? `/presupuestos/${fila.id}` : `/documentos/${fila.id}`
                return (
                  <li key={fila.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-pendiente={fila.id}>
                    <Link href={href} className="flex flex-col gap-0.5 hover:text-primary">
                      <span className="font-medium">{cola === 'para_facturar' ? 'Remito ' : cola === 'cobranzas' ? '' : 'N° '}{fila.numero || 'Sin número'}</span>
                      <span className="text-sm">{fila.cliente_razon_social}</span>
                    </Link>
                    {fila.asunto && cola !== 'seguimiento' ? <p className="line-clamp-2 text-xs text-muted-foreground">{fila.asunto}</p> : null}
                    <DetallePendiente fila={fila} cola={cola} hoy={hoy} />
                    <Link href={accion.href} className="self-end text-sm font-medium text-primary underline-offset-4 hover:underline">
                      {accion.texto}<span className="sr-only"> · {fila.numero || fila.cliente_razon_social}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-3 py-3">
              <p className="text-sm text-muted-foreground">{completa && (resumen?.cantidad ?? 0) > 0 ? 'No hay más pendientes en esta página.' : datos.vacio}</p>
              <Link href={datos.enlaceVacio} className="text-sm font-medium text-primary hover:underline">{datos.accionVacio}</Link>
            </div>
          )}
        </CardContent>
        {!completa && (resumen?.cantidad ?? 0) > 0 ? (
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
