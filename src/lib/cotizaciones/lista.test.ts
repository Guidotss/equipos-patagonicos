import { describe, expect, it } from 'vitest'
import {
  ESTADOS_FILTRO,
  POR_PAGINA,
  estadoVisible,
  hrefConFiltros,
  leerFiltros,
  rangoPaginas,
  resumenCotizacion,
  type FiltrosLista,
} from './lista'

const CLIENTE = '0b0f6a43-5d1c-4c1e-9a52-6f1f4f6a2b10'
const VACIOS: FiltrosLista = { q: '', estado: '', cliente: '', desde: '', hasta: '', pagina: 1 }

describe('constantes', () => {
  it('pagina de a 25 y filtra por los cinco estados visibles', () => {
    expect(POR_PAGINA).toBe(25)
    expect(ESTADOS_FILTRO).toEqual(['borrador', 'enviada', 'vencida', 'aprobada', 'rechazada'])
  })
})

describe('leerFiltros', () => {
  it('sin parámetros devuelve todo vacío y la página 1', () => {
    expect(leerFiltros({})).toEqual(VACIOS)
  })

  it('lee todos los filtros válidos', () => {
    const parametros = { q: 'grúa', estado: 'vencida', cliente: CLIENTE, desde: '2026-10-01', hasta: '2026-10-31' }
    expect(leerFiltros({ ...parametros, pagina: '3' })).toEqual({ ...parametros, pagina: 3 })
  })

  it('con parámetros repetidos se queda con el primero', () => {
    const repetidos = { q: ['vertice', 'milicic'], estado: ['enviada', 'borrador'], pagina: ['2', '5'] }
    expect(leerFiltros(repetidos)).toMatchObject({ q: 'vertice', estado: 'enviada', pagina: 2 })
  })

  it('recorta la búsqueda y la limita a 100 caracteres', () => {
    expect(leerFiltros({ q: '   112711  ' }).q).toBe('112711')
    expect(leerFiltros({ q: 'x'.repeat(150) }).q).toHaveLength(100)
  })

  it('un estado desconocido o vacío queda en "todos"', () => {
    expect(leerFiltros({ estado: 'anulada' }).estado).toBe('')
    expect(leerFiltros({ estado: 'ENVIADA' }).estado).toBe('')
    expect(leerFiltros({ estado: '' }).estado).toBe('')
  })

  it('un cliente que no es UUID se ignora', () => {
    expect(leerFiltros({ cliente: 'vertice' }).cliente).toBe('')
    expect(leerFiltros({ cliente: '' }).cliente).toBe('')
  })

  it('las fechas mal formadas o que no existen se ignoran sin tocar las demás', () => {
    expect(leerFiltros({ desde: '01/10/2026', hasta: '2026-10-31' })).toMatchObject({ desde: '', hasta: '2026-10-31' })
    expect(leerFiltros({ desde: '2026-02-30' }).desde).toBe('')
    expect(leerFiltros({ hasta: '2026-13-01' }).hasta).toBe('')
  })

  it('da vuelta un rango invertido', () => {
    expect(leerFiltros({ desde: '2026-10-31', hasta: '2026-10-01' })).toMatchObject({
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
  })

  it.each(['', 'abc', '0', '-2', '2.5', '1e3', '99999999'])('una página inválida (%j) vuelve a la 1', (pagina) => {
    expect(leerFiltros({ pagina }).pagina).toBe(1)
  })

  it('un filtro inválido no arrastra a los demás', () => {
    expect(leerFiltros({ q: 'vertice', estado: 'x', cliente: 'y', pagina: 'z' })).toEqual({ ...VACIOS, q: 'vertice' })
  })
})

describe('hrefConFiltros', () => {
  const filtros: FiltrosLista = { ...VACIOS, q: 'grúa 40', estado: 'enviada', pagina: 3 }

  it('sin filtros es la lista sola', () => {
    expect(hrefConFiltros(VACIOS, {})).toBe('/cotizaciones')
  })

  it('cambiar de página conserva los filtros', () => {
    expect(hrefConFiltros(filtros, { pagina: 4 })).toBe('/cotizaciones?q=gr%C3%BAa+40&estado=enviada&pagina=4')
  })

  it('la página 1 no va en la URL', () => {
    expect(hrefConFiltros(filtros, { pagina: 1 })).toBe('/cotizaciones?q=gr%C3%BAa+40&estado=enviada')
  })

  it('cambiar un filtro vuelve a la página 1', () => {
    expect(hrefConFiltros(filtros, { estado: 'vencida' })).toBe('/cotizaciones?q=gr%C3%BAa+40&estado=vencida')
    expect(hrefConFiltros(filtros, { cliente: CLIENTE })).toBe(
      `/cotizaciones?q=gr%C3%BAa+40&estado=enviada&cliente=${CLIENTE}`,
    )
  })

  it('sin cambios conserva la página', () => {
    expect(hrefConFiltros(filtros, {})).toBe('/cotizaciones?q=gr%C3%BAa+40&estado=enviada&pagina=3')
  })

  it('arma las fechas y saca los filtros vacíos', () => {
    expect(hrefConFiltros(filtros, { q: '', estado: '', desde: '2026-10-01', hasta: '2026-10-31' })).toBe(
      '/cotizaciones?desde=2026-10-01&hasta=2026-10-31',
    )
  })

  it('limpiar todos los filtros deja la lista sola', () => {
    expect(hrefConFiltros(filtros, { q: '', estado: '', cliente: '', desde: '', hasta: '' })).toBe('/cotizaciones')
  })

  it('lo que arma se vuelve a leer igual', () => {
    const completo: FiltrosLista = {
      q: 'Ñandú & hijos',
      estado: 'rechazada',
      cliente: CLIENTE,
      desde: '2026-01-01',
      hasta: '2026-12-31',
      pagina: 2,
    }
    const url = new URL(hrefConFiltros(completo, { pagina: 2 }), 'http://localhost')
    expect(leerFiltros(Object.fromEntries(url.searchParams))).toEqual(completo)
  })
})

describe('estadoVisible', () => {
  it('una enviada vencida se ve como vencida', () => {
    expect(estadoVisible('enviada', true)).toBe('vencida')
  })

  it('una enviada al día (o sin el dato) se ve como enviada', () => {
    expect(estadoVisible('enviada', false)).toBe('enviada')
    expect(estadoVisible('enviada', null)).toBe('enviada')
  })

  it('los demás estados se ven como están, aunque la marca de vencida venga en true', () => {
    expect(estadoVisible('borrador', false)).toBe('borrador')
    expect(estadoVisible('aprobada', true)).toBe('aprobada')
    expect(estadoVisible('rechazada', null)).toBe('rechazada')
  })

  it('un estado desconocido es un error de programación', () => {
    expect(() => estadoVisible('anulada', false)).toThrow('Estado de cotización desconocido: anulada')
  })
})

describe('resumenCotizacion', () => {
  const equipo40 = {
    nombre: 'Grúa telescópica XCMG QY70K-1 40 TN',
    capacidad_tn: 40,
    descripcion: 'Grúa Telescópica marca XCMG modelo QY70K-1 de 40 TN',
  }
  const asuntoJornada =
    'Cotización N° {{numero}} alquiler de 1 (una) Grúa Telescópica capacidad {{capacidad}} TN con operador.'

  it('resuelve número y capacidad en el asunto de la plantilla por jornada', () => {
    expect(resumenCotizacion({ numero: 112711, asunto: asuntoJornada, datos: {}, equipo: equipo40 })).toBe(
      'Cotización N° 112711 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.',
    )
  })

  it('quita las variables que no se pueden resolver y los espacios que quedan', () => {
    expect(resumenCotizacion({ numero: 112712, asunto: asuntoJornada, datos: {}, equipo: null })).toBe(
      'Cotización N° 112712 alquiler de 1 (una) Grúa Telescópica capacidad TN con operador.',
    )
    const conFaltantes = { numero: 1, asunto: 'Izaje en {{ubicacion}} , {{ubicación}} norte', datos: {}, equipo: null }
    expect(resumenCotizacion(conFaltantes)).toBe('Izaje en, norte')
  })

  it('usa los datos de la cotización y la capacidad con coma decimal', () => {
    const fila = {
      numero: 1,
      asunto: 'Grúa de {{capacidad}} TN en {{ubicacion}}, pago {{forma_pago}}.',
      datos: { ubicacion: 'Añelo', forma_pago: 'a 30 días F.F.' },
      equipo: { ...equipo40, capacidad_tn: 60.5 },
    }
    expect(resumenCotizacion(fila)).toBe('Grúa de 60,5 TN en Añelo, pago a 30 días F.F.')
  })

  it('un asunto sin variables (presupuesto directo) se muestra tal cual', () => {
    expect(
      resumenCotizacion({ numero: 5, asunto: '  Montaje de tanque\nen Añelo ', datos: {}, equipo: null }),
    ).toBe('Montaje de tanque en Añelo')
  })

  it('sin asunto, muestra equipo y ubicación con lo que haya', () => {
    const datos = { ubicacion: 'Sargento Vidal Ruta Nacional 151 km 41' }
    expect(resumenCotizacion({ numero: 1, asunto: '', datos, equipo: equipo40 })).toBe(
      'Grúa telescópica XCMG QY70K-1 40 TN · Sargento Vidal Ruta Nacional 151 km 41',
    )
    expect(resumenCotizacion({ numero: 1, asunto: '', datos, equipo: null })).toBe(
      'Sargento Vidal Ruta Nacional 151 km 41',
    )
    expect(resumenCotizacion({ numero: 1, asunto: '', datos: {}, equipo: equipo40 })).toBe(
      'Grúa telescópica XCMG QY70K-1 40 TN',
    )
  })

  it('un asunto que queda solo con signos cuenta como vacío', () => {
    expect(resumenCotizacion({ numero: 1, asunto: '{{ubicacion}}.', datos: {}, equipo: equipo40 })).toBe(
      'Grúa telescópica XCMG QY70K-1 40 TN',
    )
  })

  it('sin nada que mostrar, una raya', () => {
    expect(resumenCotizacion({ numero: 1, asunto: '', datos: null, equipo: null })).toBe('—')
    expect(resumenCotizacion({ numero: 1, asunto: '   ', datos: { ubicacion: '  ' }, equipo: null })).toBe('—')
  })
})

describe('rangoPaginas', () => {
  it('sin páginas no hay nada que mostrar', () => {
    expect(rangoPaginas(1, 0)).toEqual([])
  })

  it('hasta 7 páginas las muestra todas', () => {
    expect(rangoPaginas(1, 1)).toEqual([1])
    expect(rangoPaginas(3, 5)).toEqual([1, 2, 3, 4, 5])
    expect(rangoPaginas(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('cerca del principio muestra las primeras cinco y la última', () => {
    expect(rangoPaginas(1, 12)).toEqual([1, 2, 3, 4, 5, '…', 12])
    expect(rangoPaginas(4, 12)).toEqual([1, 2, 3, 4, 5, '…', 12])
    expect(rangoPaginas(1, 8)).toEqual([1, 2, 3, 4, 5, '…', 8])
  })

  it('en el medio muestra la primera, la actual con sus vecinas y la última', () => {
    expect(rangoPaginas(5, 12)).toEqual([1, '…', 4, 5, 6, '…', 12])
    expect(rangoPaginas(8, 12)).toEqual([1, '…', 7, 8, 9, '…', 12])
  })

  it('cerca del final muestra la primera y las últimas cinco', () => {
    expect(rangoPaginas(9, 12)).toEqual([1, '…', 8, 9, 10, 11, 12])
    expect(rangoPaginas(12, 12)).toEqual([1, '…', 8, 9, 10, 11, 12])
    expect(rangoPaginas(5, 8)).toEqual([1, '…', 4, 5, 6, 7, 8])
  })

  it('una página fuera de rango se acomoda al extremo', () => {
    expect(rangoPaginas(0, 12)).toEqual(rangoPaginas(1, 12))
    expect(rangoPaginas(99, 12)).toEqual(rangoPaginas(12, 12))
  })

  it('nunca pasa de 7 lugares y siempre incluye la actual, la primera y la última', () => {
    for (let total = 1; total <= 30; total++) {
      for (let actual = 1; actual <= total; actual++) {
        const paginas = rangoPaginas(actual, total)
        expect(paginas.length).toBeLessThanOrEqual(7)
        expect(paginas).toContain(actual)
        expect(paginas[0]).toBe(1)
        expect(paginas.at(-1)).toBe(total)
      }
    }
  })
})
