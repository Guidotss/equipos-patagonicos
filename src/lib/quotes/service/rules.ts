import { z } from 'zod'
import { MESSAGE_CONFLICT } from '../editor/constants'
import { ErrorQuote } from './contracts'
import type { Row } from './source'

const ABIERTAS = ['borrador', 'enviada']

// Lo que la base va a rechazar y ya se ve en la fila cargada se revisa antes de generar y subir el PDF,
// con los mismos mensajes: un PDF subido no se puede borrar desde la app y quedaría huérfano. La base
// sigue siendo la que decide (bloquea la fila y vuelve a validar todo); solo un cambio entre la lectura
// y la RPC puede dejar un archivo de más.

/**
 * La versión que vio la pantalla (el updated_at con el que se abrió o se guardó por última vez) tiene que ser la
 * de la fila que se va a dibujar: si no, se enviaría o aprobaría algo que el usuario no vio. Se compara al
 * milisegundo, como la base, porque la versión pasa por un Date de JS en el navegador. Sin versión (scripts y
 * tests), vale la que se acaba de leer.
 */
export function requireVersion(row: Row, version: string | undefined) {
  if (version === undefined) return
  const view = Date.parse(version)
  // El mismo texto que da la base (private.exigir_version): así el editor lo reconoce y ofrece "Recargar".
  if (Number.isNaN(view) || view !== Date.parse(row.updated_at)) throw new ErrorQuote(MESSAGE_CONFLICT)
}

export function requirePrices(row: Row) {
  if (!row.items.length) throw new ErrorQuote('La cotización no tiene ítems')
  if (row.items.some((item) => item.precio_unitario === null)) throw new ErrorQuote('Hay ítems sin precio')
}

export function requireSendable(row: Row) {
  if (!ABIERTAS.includes(row.estado)) {
    throw new ErrorQuote('Solo se puede enviar una cotización en borrador o ya enviada')
  }
  if (row.origen !== 'app') {
    throw new ErrorQuote('Una cotización cargada no se envía desde la app: su documento es el PDF original')
  }
  requirePrices(row)
}

export function requireApprovable(row: Row, fecha: string) {
  if (!ABIERTAS.includes(row.estado)) throw new ErrorQuote('Solo se puede aprobar una cotización en borrador o enviada')
  if (!z.iso.date().safeParse(fecha).success) throw new ErrorQuote('La fecha de aprobación no es válida')
  if (fecha < row.fecha) throw new ErrorQuote('La fecha de aprobación no puede ser anterior a la cotización')
  if (row.origen !== 'importada') requirePrices(row)
}
