import { Download } from 'lucide-react'
import { SheetForm, SectionForm } from '@/components/form/structure-form'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { CraneDeliveryNoteDetail } from '@/lib/crane-operators/contracts'
import { formatShortDate } from '@/lib/format/dates'

export function NoteDetail({ note, staff = false }: { note: CraneDeliveryNoteDetail; staff?: boolean }) {
  const details = [
    ['Número de remito', note.number || 'Sin número'], ['Fecha del servicio', formatShortDate(note.serviceDate)],
    ['Grúa', note.equipmentName], ['Gruista', note.authorName || 'Sin nombre'], ['Cliente o lugar del trabajo', note.customerName],
  ]
  return <div className="flex flex-col gap-5">
    <Alert><AlertDescription>{note.status === 'pending' ? 'Remito recibido. Administración lo vinculará a un presupuesto.' : 'El remito está vinculado a un presupuesto.'}</AlertDescription></Alert>
    <SheetForm>
      <SectionForm titulo="Trabajo" stacked>
        <dl className="grid gap-5 sm:grid-cols-2">{details.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value || 'Sin informar'}</dd></div>)}</dl>
        <div><h3 className="text-sm text-muted-foreground">Descripción del trabajo</h3><p className="mt-1 whitespace-pre-wrap break-words">{note.workDescription}</p></div>
        {note.notes ? <div><h3 className="text-sm text-muted-foreground">Observaciones</h3><p className="mt-1 whitespace-pre-wrap break-words">{note.notes}</p></div> : null}
      </SectionForm>
      <SectionForm titulo="Archivos" stacked>
        <ul className="flex flex-col gap-2">{note.files.map((file) => <li key={file.id}><Button asChild variant="outline" className="h-auto min-h-11 max-w-full justify-start py-2"><a href={`${staff ? '/delivery-notes' : '/operator'}/files/${file.id}`}><Download data-icon="inline-start" /><span className="min-w-0 break-all whitespace-normal">{file.originalName}</span></a></Button></li>)}</ul>
      </SectionForm>
    </SheetForm>
  </div>
}
