import Link from 'next/link'
import { EstadoCotizacion } from '@/components/cotizaciones/estado-cotizacion'
import { AccionesFila } from '@/components/cotizaciones/lista/acciones-fila'
import { transicionesDeLista } from '@/lib/cotizaciones/acciones-estado'
import type { FilaCotizacion } from '@/lib/cotizaciones/lista-vista'
import { cn } from '@/lib/utils'

/** La lista en tarjetas angostas (celular o tablet chica): toda la fila abre la cotización y el ⋯ lleva el resto. */
export function ListaCotizacionesMovil({ filas }: { filas: FilaCotizacion[] }) {
  return (
    <ul className="divide-y">
      {filas.map((fila) => (
        <li key={fila.id} className="relative px-4 py-4 transition-colors hover:bg-accent/30 focus-within:bg-accent/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-sm">
              {/* El after: estira el link a toda la fila; el ⋯ queda por encima con z-10. */}
              <Link href={`/cotizaciones/${fila.id}`} className="font-semibold text-primary tabular-nums after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-ring">
                N° {fila.numero}
              </Link>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground tabular-nums">{fila.fecha} · {fila.origen ?? fila.formato}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <EstadoCotizacion estado={fila.estado} vencida={fila.vencida} />
              <div className="relative z-10">
                <AccionesFila id={fila.id} numero={fila.numero} tienePdf={fila.tienePdf} transiciones={transicionesDeLista(fila)} variante="movil" />
              </div>
            </div>
          </div>
          <p className="mt-3 text-[15px] leading-5 font-medium wrap-anywhere">{fila.cliente}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground wrap-anywhere" title={fila.trabajo}>{fila.trabajo}</p>
          {fila.venceEl ? <p className={cn('mt-3 border-t pt-3 text-[13px] tabular-nums', fila.vencida ? 'text-amber-700' : 'text-muted-foreground')}>
            {`${fila.vencida ? 'Venció' : 'Vence'} el ${fila.venceEl}`}
          </p> : null}
        </li>
      ))}
    </ul>
  )
}
