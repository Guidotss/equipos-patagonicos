import Link from 'next/link'
import { TableListing } from '@/components/listings/table-listing'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ManagedCraneOperator } from '@/lib/crane-operators/management-contracts'
import { formatSubmissionTime } from '@/lib/crane-operators/management-dates'

export function OperatorEquipment({ operator }: { operator: ManagedCraneOperator }) {
  return <><span title={operator.equipmentName ?? undefined} className="line-clamp-2 [overflow-wrap:anywhere]">{operator.equipmentName || 'Sin asignar'}</span>{operator.equipmentId && operator.equipmentActive === false ? <span className="mt-1 block text-xs text-muted-foreground">Grúa inactiva</span> : null}</>
}

function OperatorStatus({ active }: { active: boolean }) {
  return <Pill tone={active ? 'exito' : 'neutro'}>{active ? 'Activo' : 'Inactivo'}</Pill>
}

export function OperatorList({ operators, filtered }: { operators: ManagedCraneOperator[]; filtered: boolean }) {
  if (!operators.length) return <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
    <p className="font-medium">{filtered ? 'No encontramos gruistas con estos filtros.' : 'Todavía no hay gruistas.'}</p>
    <p className="max-w-md text-sm text-muted-foreground">{filtered ? 'Probá con otro nombre, email o grúa, o limpiá los filtros.' : 'Creá su cuenta y asignale una grúa para que pueda enviar remitos. Su actividad aparecerá acá.'}</p>
    <Button asChild variant="outline" className="min-h-11"><Link href={filtered ? '/crane-operators' : '/crane-operators/new'}>{filtered ? 'Limpiar filtros' : 'Nuevo gruista'}</Link></Button>
  </div>
  return <>
    <div className="hidden lg:block">
      <TableListing>
        <TableHeader><TableRow><TableHead className="w-[24%]">Gruista</TableHead><TableHead className="w-[24%]">Grúa asignada</TableHead><TableHead className="w-22">Acceso</TableHead><TableHead className="w-16">Remitos</TableHead><TableHead>Último envío</TableHead><TableHead className="w-32"><span className="sr-only">Actividad</span></TableHead></TableRow></TableHeader>
        <TableBody>{operators.map((operator) => <TableRow key={operator.userId}>
          <TableCell><p title={operator.name} className="line-clamp-2 font-medium">{operator.name || 'Sin nombre'}</p><p title={operator.email} className="mt-1 truncate text-xs text-muted-foreground">{operator.email}</p></TableCell>
          <TableCell><OperatorEquipment operator={operator} /></TableCell>
          <TableCell><OperatorStatus active={operator.active} /></TableCell>
          <TableCell className="tabular-nums">{operator.noteCount}</TableCell>
          <TableCell className="text-xs text-muted-foreground tabular-nums">{operator.lastSubmissionAt ? <time dateTime={operator.lastSubmissionAt}>{formatSubmissionTime(operator.lastSubmissionAt)}</time> : 'Sin envíos'}</TableCell>
          <TableCell><Button asChild variant="ghost" className="min-h-11 px-0"><Link href={`/crane-operators/${operator.userId}`} aria-label={`Ver actividad de ${operator.name || operator.email}`}>Ver actividad</Link></Button></TableCell>
        </TableRow>)}</TableBody>
      </TableListing>
    </div>
    <ul className="divide-y lg:hidden">{operators.map((operator) => <li key={operator.userId} className="flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium [overflow-wrap:anywhere]">{operator.name || 'Sin nombre'}</p><p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">{operator.email}</p></div><OperatorStatus active={operator.active} /></div>
      <div className="text-sm"><OperatorEquipment operator={operator} /></div>
      <p className="text-sm text-muted-foreground">{operator.noteCount} {operator.noteCount === 1 ? 'remito' : 'remitos'} · {operator.lastSubmissionAt ? <>Último envío: <time dateTime={operator.lastSubmissionAt}>{formatSubmissionTime(operator.lastSubmissionAt)}</time></> : 'Sin envíos'}</p>
      <Button asChild variant="outline" className="min-h-11 self-start"><Link href={`/crane-operators/${operator.userId}`} aria-label={`Ver actividad de ${operator.name || operator.email}`}>Ver actividad</Link></Button>
    </li>)}</ul>
  </>
}
