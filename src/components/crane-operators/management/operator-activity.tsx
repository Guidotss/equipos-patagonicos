import Link from 'next/link'
import { NoteStatus } from '@/components/crane-operators/note-status'
import { TableListing } from '@/components/listings/table-listing'
import { Button } from '@/components/ui/button'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CraneDeliveryNoteSummary } from '@/lib/crane-operators/contracts'
import { formatSubmissionTime } from '@/lib/crane-operators/management-dates'
import { formatShortDate } from '@/lib/format/dates'

export function OperatorActivity({
  notes,
}: {
  notes: CraneDeliveryNoteSummary[]
}) {
  if (!notes.length)
    return (
      <p className="px-4 py-12 text-center text-sm text-muted-foreground">
        Este gruista todavía no envió remitos.
      </p>
    )
  return (
    <>
      <div className="hidden lg:block">
        <TableListing>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Remito / servicio</TableHead>
              <TableHead>Grúa / trabajo</TableHead>
              <TableHead className="w-40">Enviado</TableHead>
              <TableHead className="w-40">Estado</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">Revisión</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notes.map((note) => (
              <TableRow key={note.id}>
                <TableCell>
                  <Link
                    href={`/delivery-notes/${note.id}`}
                    className="line-clamp-2 font-medium text-primary hover:underline"
                  >
                    {note.number || 'Sin número'}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Servicio: {formatShortDate(note.serviceDate)}
                  </p>
                </TableCell>
                <TableCell>
                  <p
                    title={note.equipmentName}
                    className="line-clamp-2 font-medium"
                  >
                    {note.equipmentName}
                  </p>
                  {note.customerName ? (
                    <p className="line-clamp-2 text-sm">{note.customerName}</p>
                  ) : null}
                  {note.workDescription ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {note.workDescription}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  <time dateTime={note.createdAt}>
                    {formatSubmissionTime(note.createdAt)}
                  </time>
                </TableCell>
                <TableCell>
                  <NoteStatus status={note.status} />
                </TableCell>
                <TableCell>
                  <Button asChild variant="ghost" className="min-h-11">
                    <Link href={`/delivery-notes/${note.id}`}>Revisar</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableListing>
      </div>
      <ul className="divide-y lg:hidden">
        {notes.map((note) => (
          <li
            key={note.id}
            className="flex min-w-0 flex-col gap-2 p-4 [overflow-wrap:anywhere]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/delivery-notes/${note.id}`}
                className="font-medium text-primary"
              >
                {note.number ? `Remito ${note.number}` : 'Remito sin número'}
              </Link>
              <NoteStatus status={note.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Servicio: {formatShortDate(note.serviceDate)}
            </p>
            <p className="font-medium">{note.equipmentName}</p>
            {note.customerName ? (
              <p className="text-sm">{note.customerName}</p>
            ) : null}
            {note.workDescription ? (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {note.workDescription}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground tabular-nums">
              Enviado:{' '}
              <time dateTime={note.createdAt}>
                {formatSubmissionTime(note.createdAt)}
              </time>{' '}
              (hora argentina)
            </p>
            <Button asChild variant="outline" className="min-h-11 self-start">
              <Link href={`/delivery-notes/${note.id}`}>Revisar remito</Link>
            </Button>
          </li>
        ))}
      </ul>
    </>
  )
}
