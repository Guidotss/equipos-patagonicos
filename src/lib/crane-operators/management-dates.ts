import { ARGENTINA_TIME_ZONE } from '@/lib/format/dates'

const submissionFormatter = new Intl.DateTimeFormat('es-AR', {
  timeZone: ARGENTINA_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function formatSubmissionTime(value: string): string {
  return submissionFormatter.format(new Date(value))
}
