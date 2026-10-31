import path from 'node:path'
import { Font } from '@react-pdf/renderer'

export const FAMILIA = 'Carlito'
const DIRECTORIO = path.join(process.cwd(), 'assets', 'fonts')
let registered = false

/** Carlito es métricamente compatible con Calibri (la fuente de los originales) y cubre á, ñ, °, –, •. */
export function registerFonts() {
  if (registered) return
  Font.register({
    family: FAMILIA,
    fonts: [
      { src: path.join(DIRECTORIO, 'Carlito-Regular.ttf') },
      { src: path.join(DIRECTORIO, 'Carlito-Bold.ttf'), fontWeight: 'bold' },
      { src: path.join(DIRECTORIO, 'Carlito-Italic.ttf'), fontStyle: 'italic' },
      { src: path.join(DIRECTORIO, 'Carlito-BoldItalic.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
  })
  // Sin guiones de corte: react-pdf divide palabras con reglas del inglés.
  Font.registerHyphenationCallback((palabra) => [palabra])
  registered = true
}

export const PATH_LOGO = path.join(process.cwd(), 'assets', 'logo-equipos-patagonicos.jpg')
