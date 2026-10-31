import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { FilaListado } from '@/components/listados/fila-listado'
import { TablaListado } from '@/components/listados/tabla-listado'
import { Pastilla } from '@/components/ui/pastilla'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatFechaCorta } from '@/lib/format/fechas'
import { formatMoneda } from '@/lib/format/montos'
import { ESTADOS_PRESUPUESTO } from '@/lib/presupuestos/lista'
import type { Database } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

type FilaPresupuesto = Database['public']['Functions']['buscar_presupuestos']['Returns'][number]

export function TablaPresupuestos({ presupuestos }: { presupuestos: FilaPresupuesto[] }) {
  return (
    <>
      <div className="hidden @min-[44rem]/listado:block">
        <TablaListado aria-label="Presupuestos">
          <colgroup>
            <col className="w-28" />
            <col />
            <col className="w-28" />
            <col className="hidden w-40 @min-[52rem]/listado:table-column" />
            <col className="w-36" />
            <col className="w-16" />
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col">Presupuesto</TableHead>
              <TableHead scope="col">Cliente / trabajo</TableHead>
              <TableHead scope="col">Estado</TableHead>
              <TableHead scope="col" className="hidden @min-[52rem]/listado:table-cell">Documentos</TableHead>
              <TableHead scope="col" className="text-right">Saldo a cobrar</TableHead>
              <TableHead scope="col"><span className="sr-only">Abrir presupuesto</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {presupuestos.map((presupuesto) => (
              <FilaListado key={presupuesto.id} href={`/presupuestos/${presupuesto.id}`}>
                <TableCell>
                  <Link
                    href={`/presupuestos/${presupuesto.id}`}
                    aria-label={`Presupuesto ${presupuesto.numero}`}
                    className="font-semibold text-primary tabular-nums hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {presupuesto.numero}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">{fechaAprobacion(presupuesto)}</p>
                </TableCell>
                <TableCell>
                  <Link href={`/presupuestos/${presupuesto.id}`} className="font-medium leading-5 hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
                    {presupuesto.cliente_razon_social}
                  </Link>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{presupuesto.asunto || 'Sin trabajo indicado'}</p>
                  <DocumentosPresupuesto presupuesto={presupuesto} className="mt-3 @min-[52rem]/listado:hidden" />
                </TableCell>
                <TableCell><EstadoPresupuesto estado={presupuesto.presupuesto_estado} /></TableCell>
                <TableCell className="hidden @min-[52rem]/listado:table-cell">
                  <DocumentosPresupuesto presupuesto={presupuesto} columna />
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatMoneda(presupuesto.saldo ?? 0)}</TableCell>
                <TableCell className="px-2!">
                  <Link
                    href={`/presupuestos/${presupuesto.id}`}
                    aria-label={`Abrir presupuesto ${presupuesto.numero}`}
                    className="inline-flex min-h-10 items-center gap-1 whitespace-nowrap text-muted-foreground hover:text-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Abrir <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                </TableCell>
              </FilaListado>
            ))}
          </TableBody>
        </TablaListado>
      </div>
      <ul className="divide-y @min-[44rem]/listado:hidden">
        {presupuestos.map((presupuesto) => (
          <li key={presupuesto.id}>
            <Link
              href={`/presupuestos/${presupuesto.id}`}
              aria-label={`Abrir presupuesto ${presupuesto.numero}`}
              className="block p-4 hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-primary tabular-nums">N° {presupuesto.numero}</p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">{fechaAprobacion(presupuesto)}</p>
                </div>
                <EstadoPresupuesto estado={presupuesto.presupuesto_estado} />
              </div>
              <p className="font-medium leading-6 [overflow-wrap:anywhere]">{presupuesto.cliente_razon_social}</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">{presupuesto.asunto || 'Sin trabajo indicado'}</p>
              <DocumentosPresupuesto presupuesto={presupuesto} className="mt-3" />
              <dl className="mt-3 flex items-baseline justify-between gap-3 border-t pt-3 text-sm">
                <dt className="text-muted-foreground">Saldo a cobrar</dt>
                <dd className="text-right font-semibold tabular-nums">{formatMoneda(presupuesto.saldo ?? 0)}</dd>
              </dl>
              <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary">Abrir presupuesto <ArrowUpRight className="size-3.5" aria-hidden /></span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function DocumentosPresupuesto({ presupuesto, columna = false, className }: {
  presupuesto: FilaPresupuesto
  columna?: boolean
  className?: string
}) {
  const documentos = [
    ['Órdenes de compra', 'OC', presupuesto.ordenes_compra],
    ['Remitos', 'Remitos', presupuesto.remitos],
    ['Facturas', 'Facturas', presupuesto.facturas],
    ['Órdenes de pago', 'OP', presupuesto.ordenes_pago],
  ] as const
  return (
    <dl className={cn(columna ? 'grid grid-cols-2 gap-x-2 gap-y-1' : 'flex flex-wrap gap-x-4 gap-y-1', 'text-xs', className)}>
      {documentos.map(([etiqueta, corta, cantidad]) => (
        <div key={etiqueta} className="flex items-baseline gap-1">
          <dt className="shrink-0 whitespace-nowrap text-muted-foreground">{columna && corta !== etiqueta ? <abbr title={etiqueta} className="no-underline">{corta}</abbr> : etiqueta}</dt>
          <dd className="shrink-0 font-medium tabular-nums">{cantidad ?? 0}</dd>
        </div>
      ))}
    </dl>
  )
}

function EstadoPresupuesto({ estado }: { estado: string | null }) {
  const tono = estado === 'en_curso' ? 'info' : estado === 'finalizado' ? 'exito' : 'neutro'
  return <Pastilla tono={tono}>{ESTADOS_PRESUPUESTO[estado as keyof typeof ESTADOS_PRESUPUESTO] ?? 'Sin estado'}</Pastilla>
}

function fechaAprobacion(presupuesto: FilaPresupuesto) {
  return presupuesto.fecha_aprobacion ? formatFechaCorta(presupuesto.fecha_aprobacion) : 'Sin fecha'
}
