// src/lib/pdf/resaltar.test.ts
import { extractText, getDocumentProxy, getResolvedPDFJS } from 'unpdf'
import { describe, expect, it } from 'vitest'
import { armarDocumento } from '@/lib/cotizaciones/documento'
import { EJEMPLO_JORNADA, EJEMPLO_MENSUAL } from '@/lib/cotizaciones/ejemplos'
import { AMARILLO_VARIABLE } from './estilos'
import { renderizarCotizacion } from './render'

async function textoDelPdf(pdf: Buffer): Promise<string> {
  const documento = await getDocumentProxy(new Uint8Array(pdf))
  const { text } = await extractText(documento, { mergePages: true })
  return text.replace(/\s+/g, ' ')
}

/** Los colores de relleno que usa el PDF ('#rrggbb'), leídos de las operaciones de dibujo de cada página. */
async function coloresDeRelleno(pdf: Buffer): Promise<Set<string>> {
  const { OPS } = await getResolvedPDFJS()
  const documento = await getDocumentProxy(new Uint8Array(pdf))
  const colores = new Set<string>()
  for (let numero = 1; numero <= documento.numPages; numero++) {
    const { fnArray, argsArray } = await (await documento.getPage(numero)).getOperatorList()
    fnArray.forEach((operacion, indice) => {
      if (operacion === OPS.setFillRGBColor) colores.add(String(argsArray[indice][0]).toLowerCase())
    })
  }
  return colores
}

const AMARILLO = AMARILLO_VARIABLE.toLowerCase()

/** La 112523 sin los datos de la cotización: quedan {{horario}}, {{ubicacion}}, {{plazo_entrega}} y {{forma_pago}}. */
const SIN_DATOS = { ...EJEMPLO_MENSUAL, cotizacion: { ...EJEMPLO_MENSUAL.cotizacion, datos: {} } }

describe('resaltar variables (vista previa)', () => {
  it('con resaltarVariables pinta de amarillo las variables sin completar y las deja en el texto', async () => {
    const pdf = await renderizarCotizacion(armarDocumento(SIN_DATOS), { resaltarVariables: true })
    expect(await textoDelPdf(pdf)).toContain('{{ubicacion}}')
    expect(await coloresDeRelleno(pdf)).toContain(AMARILLO)
  }, 20_000)

  it('sin la opción (el PDF que se envía o se aprueba) no pinta nada', async () => {
    const pdf = await renderizarCotizacion(armarDocumento(SIN_DATOS))
    expect(await textoDelPdf(pdf)).toContain('{{ubicacion}}')
    expect(await coloresDeRelleno(pdf)).not.toContain(AMARILLO)
  }, 20_000)

  it('un documento completo no tiene nada que resaltar y el texto sale corrido', async () => {
    const pdf = await renderizarCotizacion(armarDocumento(EJEMPLO_JORNADA), { resaltarVariables: true })
    expect(await coloresDeRelleno(pdf)).not.toContain(AMARILLO)
    expect(await textoDelPdf(pdf)).toContain(
      'Cotización N° 112711 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.',
    )
  }, 20_000)

  it('sin número (una cotización sin guardar) muestra {{numero}} resaltado', async () => {
    const sinNumero = { ...EJEMPLO_MENSUAL, cotizacion: { ...EJEMPLO_MENSUAL.cotizacion, numero: null } }
    const pdf = await renderizarCotizacion(armarDocumento(sinNumero), { resaltarVariables: true })
    expect(await textoDelPdf(pdf)).toContain('Cotización N° {{numero}}')
    expect(await coloresDeRelleno(pdf)).toContain(AMARILLO)
  }, 20_000)
})
