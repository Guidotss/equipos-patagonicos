import { Badge } from '@/components/ui/badge'
import type { CraneDeliveryNoteStatus } from '@/lib/crane-operators/schemas'

export function NoteStatus({ status }: { status: CraneDeliveryNoteStatus }) {
  return <Badge variant={status === 'linked' ? 'secondary' : 'outline'}>{status === 'linked' ? 'Vinculado' : 'Pendiente de vincular'}</Badge>
}
