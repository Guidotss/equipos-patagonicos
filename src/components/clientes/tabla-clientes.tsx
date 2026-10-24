import Link from 'next/link'
import { Pastilla } from '@/components/ui/pastilla'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCuit } from '@/lib/cuit'

type FilaCliente = { id: string; razon_social: string; cuit: string | null; localidad: string; activo: boolean }

export function TablaClientes({ clientes }: { clientes: FilaCliente[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 pl-5 text-muted-foreground">Razón social</TableHead>
            <TableHead className="hidden h-11 text-muted-foreground md:table-cell">CUIT</TableHead>
            <TableHead className="hidden h-11 text-muted-foreground sm:table-cell">Localidad</TableHead>
            <TableHead className="h-11 pr-5 text-muted-foreground">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clientes.map((cliente) => (
            <TableRow key={cliente.id} className={cliente.activo ? undefined : 'text-muted-foreground'}>
              <TableCell className="py-3 pl-5 whitespace-normal">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-sm font-semibold text-primary"
                  >
                    {cliente.razon_social.trim().charAt(0).toUpperCase()}
                  </span>
                  <Link href={`/clientes/${cliente.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                    {cliente.razon_social}
                  </Link>
                </div>
              </TableCell>
              <TableCell className="hidden tabular-nums md:table-cell">{cliente.cuit ? formatCuit(cliente.cuit) : '—'}</TableCell>
              <TableCell className="hidden sm:table-cell">{cliente.localidad || '—'}</TableCell>
              <TableCell className="pr-5">
                {cliente.activo ? <Pastilla tono="exito">Activo</Pastilla> : <Pastilla>Inactivo</Pastilla>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
