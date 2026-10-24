import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCuit } from '@/lib/cuit'

type FilaCliente = { id: string; razon_social: string; cuit: string | null; localidad: string; activo: boolean }

export function TablaClientes({ clientes }: { clientes: FilaCliente[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Razón social</TableHead>
          <TableHead>CUIT</TableHead>
          <TableHead className="hidden sm:table-cell">Localidad</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clientes.map((cliente) => (
          <TableRow key={cliente.id}>
            <TableCell className="font-medium">
              <Link href={`/clientes/${cliente.id}`} className="hover:underline">
                {cliente.razon_social}
              </Link>
              {cliente.activo ? null : (
                <Badge variant="secondary" className="ml-2">
                  Inactivo
                </Badge>
              )}
            </TableCell>
            <TableCell className="tabular-nums">{cliente.cuit ? formatCuit(cliente.cuit) : '—'}</TableCell>
            <TableCell className="hidden sm:table-cell">{cliente.localidad || '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
