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

let preparedFonts: Promise<void> | undefined

function canonicalBaseCodePoints(characterSet: number[]): number[] {
  const baseCodePoints = new Set<number>()
  for (const codePoint of characterSet) {
    const character = String.fromCodePoint(codePoint)
    const decomposed = character.normalize('NFD')
    if (decomposed === character) continue
    for (const base of decomposed) {
      if (/\p{Letter}/u.test(base)) baseCodePoints.add(base.codePointAt(0)!)
    }
  }
  return [...baseCodePoints].sort((a, b) => a - b)
}

/** Evita que una letra acentuada deje su glifo base sin Unicode, sin precargar ligaduras ni sus aliases. */
export function prepareFonts(): Promise<void> {
  registerFonts()
  preparedFonts ??= Promise.all(
    [400, 700].flatMap((fontWeight) => (['normal', 'italic'] as const).map(async (fontStyle) => {
      const descriptor = { fontFamily: FAMILIA, fontWeight, fontStyle }
      await Font.load(descriptor)
      const font = Font.getFont(descriptor).data
      if (!font) throw new Error('No se pudo cargar la fuente del PDF')
      for (const codePoint of canonicalBaseCodePoints(font.characterSet)) {
        if (font.hasGlyphForCodePoint(codePoint)) font.glyphForCodePoint(codePoint)
      }
    })),
  ).then(() => undefined)
  return preparedFonts
}
