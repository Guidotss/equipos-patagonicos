export type ManagedCraneOperator = {
  userId: string
  name: string
  email: string
  active: boolean
  equipmentId: string | null
  equipmentName: string | null
  equipmentActive: boolean | null
  noteCount: number
  pendingNoteCount: number
  lastSubmissionAt: string | null
}
