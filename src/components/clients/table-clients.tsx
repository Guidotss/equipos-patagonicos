import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { RowListing } from '@/components/listings/row-listing'
import { TableListing } from '@/components/listings/table-listing'
import { Pill } from '@/components/ui/pill'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCuit } from '@/lib/cuit'

type RowClient = { id: string; razon_social: string; cuit: string | null; localidad: string; activo: boolean }

export function TableClients({ clientes }: { clientes: RowClient[] }) {
  return (
    <>
      <div className="hidden @min-[44rem]/listado:block">
        <TableListing aria-label="Clientes">
          <colgroup>
            <col />
            <col className="w-[22%]" />
            <col className="w-28" />
            <col className="w-28" />
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col">Cliente</TableHead>
              <TableHead scope="col">Localidad</TableHead>
              <TableHead scope="col">Estado</TableHead>
              <TableHead scope="col"><span className="sr-only">Abrir cliente</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.map((cliente) => (
              <RowListing key={cliente.id} href={`/clientes/${cliente.id}`}>
                <TableCell>
                  <Link href={`/clientes/${cliente.id}`} className="font-medium leading-5 hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
                    {cliente.razon_social}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {cliente.cuit ? `CUIT ${formatCuit(cliente.cuit)}` : 'Sin CUIT'}
                  </p>
                </TableCell>
                <TableCell className="text-muted-foreground">{cliente.localidad || 'Sin localidad'}</TableCell>
                <TableCell><StatusClient activo={cliente.activo} /></TableCell>
                <TableCell>
                  <Link
                    href={`/clientes/${cliente.id}`}
                    aria-label={`Abrir cliente ${cliente.razon_social}`}
                    className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Abrir <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                </TableCell>
              </RowListing>
            ))}
          </TableBody>
        </TableListing>
      </div>
      <ul className="divide-y @min-[44rem]/listado:hidden">
        {clientes.map((cliente) => (
          <li key={cliente.id}>
            <Link
              href={`/clientes/${cliente.id}`}
              aria-label={cliente.razon_social}
              className="block space-y-3 p-4 hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 font-medium leading-6 [overflow-wrap:anywhere]">{cliente.razon_social}</span>
                <StatusClient activo={cliente.activo} />
              </div>
              <dl className="space-y-1 text-sm text-muted-foreground">
                <div className="flex gap-2"><dt className="w-16 shrink-0">CUIT</dt><dd className="tabular-nums">{cliente.cuit ? formatCuit(cliente.cuit) : 'Sin CUIT'}</dd></div>
                <div className="flex gap-2"><dt className="w-16 shrink-0">Localidad</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{cliente.localidad || 'Sin localidad'}</dd></div>
              </dl>
              <span className="inline-flex items-center gap-1 text-xs text-primary">Abrir cliente <ArrowUpRight className="size-3.5" aria-hidden /></span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function StatusClient({ activo }: { activo: boolean }) {
  return activo ? <Pill tone="exito">Activo</Pill> : <Pill>Inactivo</Pill>
}
