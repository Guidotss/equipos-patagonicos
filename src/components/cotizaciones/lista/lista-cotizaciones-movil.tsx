import Link from 'next/link'
import { EstadoCotizacion } from '@/components/cotizaciones/estado-cotizacion'
import { AccionesFila } from '@/components/cotizaciones/lista/acciones-fila'
import type { FilaCotizacion } from '@/lib/cotizaciones/lista-vista'
import { cn } from '@/lib/utils'

/** La lista en tarjetas angostas (celular o tablet chica): toda la fila abre la cotización y el ⋯ lleva el resto. */
export function ListaCotizacionesMovil({ filas }: { filas: FilaCotizacion[] }) {
  return (
    <ul className="divide-y">
      {filas.map((fila) => (
        <li key={fila.id} className="relative px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm">
              {/* El after: estira el link a toda la fila; el ⋯ queda por encima con z-10. */}
              <Link href={`/cotizaciones/${fila.id}`} className="font-medium tabular-nums after:absolute after:inset-0">
                N° {fila.numero}
              </Link>
              <span className="text-muted-foreground">
                {' '}
                · {fila.fecha}
                {fila.origen ? ` · ${fila.origen}` : null}
              </span>
            </p>
            <EstadoCotizacion estado={fila.estado} vencida={fila.vencida} />
          </div>
          <p className="mt-1 line-clamp-1 text-[15px] font-medium">{fila.cliente}</p>
          <p className="line-clamp-2 text-sm text-muted-foreground">{fila.trabajo}</p>
          <div className="mt-1.5 flex min-h-7 items-center justify-between gap-3">
            <p className={cn('text-[13px] tabular-nums', fila.vencida ? 'text-amber-700' : 'text-muted-foreground')}>
              {fila.venceEl ? `${fila.vencida ? 'Venció' : 'Vence'} el ${fila.venceEl}` : null}
            </p>
            <div className="relative z-10">
              <AccionesFila id={fila.id} numero={fila.numero} tienePdf={fila.tienePdf} variante="movil" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
