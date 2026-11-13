import type { CraneDeliveryNoteStatus } from './schemas'

export type Page<T> = { total: number; page: number; pageSize: number } & T

export type CraneDeliveryNoteSummary = {
  id: string
  operatorId: string
  authorName: string | null
  equipmentId: string
  equipmentName: string
  status: CraneDeliveryNoteStatus
  number: string
  serviceDate: string
  customerName: string
  workDescription: string
  notes: string
  requestedBudgetId: string | null
  documentId: string | null
  linkedBudgetId: string | null
  linkedAt: string | null
  createdAt: string
}

export type CraneDeliveryNoteFile = {
  id: string
  noteId: string
  path: string
  originalName: string
  mime: string
  size: number
}

export type CraneDeliveryNoteDetail = CraneDeliveryNoteSummary & {
  files: CraneDeliveryNoteFile[]
}
export type EquipmentOption = { id: string; name: string }

export type LinkableBudget = {
  id: string
  number: number
  customerName: string
  subject: string
  equipmentId: string | null
  status: string | null
}
