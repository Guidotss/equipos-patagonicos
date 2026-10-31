import Link from 'next/link'
import { EstadoCotizacion } from '@/components/cotizaciones/estado-cotizacion'
import { AccionesFila } from '@/components/cotizaciones/lista/acciones-fila'
import { FilaListado } from '@/components/listados/fila-listado'
import { TablaListado } from '@/components/listados/tabla-listado'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { transicionesDeLista } from '@/lib/cotizaciones/acciones-estado'
import type { FilaCotizacion } from '@/lib/cotizaciones/lista-vista'
import { cn } from '@/lib/utils'

export function TablaCotizaciones({ filas }: { filas: FilaCotizacion[] }) {
  return (
    <TablaListado>
      <colgroup>
        <col className="w-33" />
        <col />
        <col className="w-32" />
        <col className="w-32" />
        <col className="w-19" />
      </colgroup>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Cotización</TableHead>
          <TableHead>Cliente / trabajo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Vencimiento</TableHead>
          <TableHead><span className="sr-only">Acciones</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((fila) => (
          <FilaListado key={fila.id} href={`/cotizaciones/${fila.id}`}>
            <TableCell>
              <Link
                href={`/cotizaciones/${fila.id}`}
                className="rounded-sm font-semibold text-primary tabular-nums underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                {fila.numero}
              </Link>
              <p className="mt-1 text-xs leading-5 text-muted-foreground tabular-nums">{fila.fecha}</p>
              <p className="text-xs leading-5 text-muted-foreground">{fila.origen ?? fila.formato}</p>
            </TableCell>
            <TableCell>
              <p className="font-medium leading-5">{fila.cliente}</p>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{fila.trabajo}</p>
            </TableCell>
            <TableCell><EstadoCotizacion estado={fila.estado} vencida={fila.vencida} /></TableCell>
            <TableCell>
              {fila.venceEl ? (
                <span className={cn('whitespace-nowrap tabular-nums', fila.vencida && 'text-amber-700')}>{fila.venceEl}</span>
              ) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell className="px-2!">
              <AccionesFila
                id={fila.id}
                numero={fila.numero}
                tienePdf={fila.tienePdf}
                transiciones={transicionesDeLista(fila)}
              />
            </TableCell>
          </FilaListado>
        ))}
      </TableBody>
    </TablaListado>
  )
}
