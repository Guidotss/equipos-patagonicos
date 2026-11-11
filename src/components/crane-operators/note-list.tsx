import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TableListing } from '@/components/listings/table-listing'
import type { CraneDeliveryNoteSummary } from '@/lib/crane-operators/contracts'
import { formatShortDate } from '@/lib/format/dates'
import { NoteStatus } from './note-status'

export function NoteList({ notes, staff = false }: { notes: CraneDeliveryNoteSummary[]; staff?: boolean }) {
  const href = (id: string) => staff ? `/delivery-notes/${id}` : `/operator/notes/${id}`
  if (!notes.length) return <p className="px-4 py-12 text-center text-sm text-muted-foreground">{staff ? 'No hay remitos en este estado.' : 'Todavía no cargaste remitos. Los envíos aparecerán acá.'}</p>
  return (
    <>
      <div className="hidden md:block">
        <TableListing>
          <TableHeader><TableRow><TableHead className="w-32">Remito / fecha</TableHead><TableHead>Grúa / trabajo</TableHead>{staff ? <TableHead className="w-36">Gruista</TableHead> : <TableHead className="w-44">Estado</TableHead>}<TableHead className="w-24"><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
          <TableBody>{notes.map((note) => <TableRow key={note.id}>
            <TableCell><Link href={href(note.id)} title={note.number || 'Sin número'} className="line-clamp-2 font-medium text-primary hover:underline">{note.number || 'Sin número'}</Link><p className="mt-1 text-xs text-muted-foreground tabular-nums">{formatShortDate(note.serviceDate)}</p></TableCell>
            <TableCell><p title={note.equipmentName} className="line-clamp-1 font-medium">{note.equipmentName}</p>{note.customerName ? <p title={note.customerName} className="line-clamp-2 text-sm">{note.customerName}</p> : null}{note.workDescription ? <p className="line-clamp-2 text-sm text-muted-foreground">{note.workDescription}</p> : null}</TableCell>
            <TableCell>{staff ? <span title={note.authorName || 'Sin nombre'} className="line-clamp-2">{note.authorName || 'Sin nombre'}</span> : <NoteStatus status={note.status} />}</TableCell>
            <TableCell><Button asChild variant="ghost" size="sm"><Link href={href(note.id)}>{staff ? 'Revisar' : 'Ver'}</Link></Button></TableCell>
          </TableRow>)}</TableBody>
        </TableListing>
      </div>
      <ul className="divide-y md:hidden">{notes.map((note) => <li key={note.id} className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><Link href={href(note.id)} className="font-medium text-primary">{note.number ? `Remito ${note.number}` : 'Remito sin número'}</Link><span className="text-sm text-muted-foreground tabular-nums">{formatShortDate(note.serviceDate)}</span></div>
        <p className="font-medium">{note.equipmentName}</p>{note.customerName ? <p className="break-words text-sm">{note.customerName}</p> : null}{note.workDescription ? <p className="line-clamp-2 break-words text-sm text-muted-foreground">{note.workDescription}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">{staff ? <span className="text-sm text-muted-foreground">{note.authorName || 'Sin nombre'}</span> : <NoteStatus status={note.status} />}<Button asChild variant="outline" className="min-h-11"><Link href={href(note.id)}>{staff ? 'Revisar remito' : 'Ver remito'}</Link></Button></div>
      </li>)}</ul>
    </>
  )
}
