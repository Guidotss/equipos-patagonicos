export type ManagedCraneOperator = {
  userId: string
  name: string
  email: string
  active: boolean
  noteCount: number
  pendingNoteCount: number
  lastSubmissionAt: string | null
}
