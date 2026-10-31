import { isMonth, monthInLetters } from '@/lib/format/dates'

/** El texto de la próxima actualización en el PDF: el mes elegido manda; sin mes, queda el texto que hubiera. */
export function nextUpdateInText(month: string, textCurrent: string): string {
  return isMonth(month) ? monthInLetters(month) : textCurrent
}
