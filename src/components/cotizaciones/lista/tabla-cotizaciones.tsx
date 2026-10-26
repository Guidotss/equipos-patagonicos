import Link from 'next/link'
import { EstadoCotizacion } from '@/components/cotizaciones/estado-cotizacion'
import { AccionesFila } from '@/components/cotizaciones/lista/acciones-fila'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { transicionesDeLista } from '@/lib/cotizaciones/acciones-estado'
import type { FilaCotizacion } from '@/lib/cotizaciones/lista-vista'
import { cn } from '@/lib/utils'

const ENCABEZADO = 'h-11 text-muted-foreground'

/**
 * Tabla de escritorio (docs/diseno/referencias/02-cotizaciones.png, sin la columna Importe). Va dentro de una tarjeta
 * con @container: Fecha, Formato y Vence el se esconden según el ancho de la tarjeta, no de la ventana.
 * Cliente tiene un mínimo de 11rem (una razón social como "VERTICE SERVICIOS INTEGRALES S.R.L." entra entera en dos
 * líneas a 1200 px) y Trabajo se queda con el resto (w-full); las dos cortan en la segunda línea, con el texto completo
 * en el title.
 * Formato es la primera que se va: aparece desde 60rem, cuando a Trabajo le quedan ~200 px y "{equipo} · {ubicación}"
 * entra en dos líneas. A 1200 px (tarjeta de ~56rem) no se muestra: con ella, Trabajo quedaba en ~140 px y el equipo
 * llenaba las dos líneas sin dejar ver la ubicación.
 */
export function TablaCotizaciones({ filas }: { filas: FilaCotizacion[] }) {
  return (
    <Table>
      <TableHeader className="bg-muted/50">
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(ENCABEZADO, 'pl-5')}>N°</TableHead>
          <TableHead className={cn(ENCABEZADO, 'hidden @min-[50rem]:table-cell')}>Fecha</TableHead>
          <TableHead className={ENCABEZADO}>Cliente</TableHead>
          <TableHead className={ENCABEZADO}>Trabajo</TableHead>
          <TableHead className={cn(ENCABEZADO, 'hidden @min-[60rem]:table-cell')}>Formato</TableHead>
          <TableHead className={ENCABEZADO}>Estado</TableHead>
          <TableHead className={cn(ENCABEZADO, 'hidden @min-[44rem]:table-cell')}>Vence el</TableHead>
          <TableHead className={cn(ENCABEZADO, 'pr-3')}>
            <span className="sr-only">Acciones</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((fila) => (
          <TableRow key={fila.id}>
            <TableCell className="py-2 pl-5">
              <Link
                href={`/cotizaciones/${fila.id}`}
                className="font-medium tabular-nums hover:text-primary hover:underline"
              >
                {fila.numero}
              </Link>
              {fila.origen ? <p className="text-xs text-muted-foreground">{fila.origen}</p> : null}
            </TableCell>
            <TableCell className="hidden py-2 tabular-nums @min-[50rem]:table-cell">{fila.fecha}</TableCell>
            <TableCell className="min-w-44 py-2 whitespace-normal">
              <span title={fila.cliente} className="line-clamp-2 leading-snug">
                {fila.cliente}
              </span>
            </TableCell>
            <TableCell className="w-full min-w-36 py-2 whitespace-normal">
              <span title={fila.trabajo} className="line-clamp-2 leading-snug text-foreground/80">
                {fila.trabajo}
              </span>
            </TableCell>
            {/* "Por jornada" en dos líneas, como en la referencia: deja el ancho para Cliente y Trabajo. */}
            <TableCell className="hidden py-2 leading-snug whitespace-normal text-foreground/80 @min-[60rem]:table-cell">
              {fila.formato}
            </TableCell>
            <TableCell className="py-2">
              <EstadoCotizacion estado={fila.estado} vencida={fila.vencida} />
            </TableCell>
            <TableCell className="hidden py-2 tabular-nums @min-[44rem]:table-cell">
              {fila.venceEl ? <span className={cn(fila.vencida && 'text-amber-700')}>{fila.venceEl}</span> : '—'}
            </TableCell>
            <TableCell className="py-2 pr-3">
              <AccionesFila
                id={fila.id}
                numero={fila.numero}
                tienePdf={fila.tienePdf}
                transiciones={transicionesDeLista(fila)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
