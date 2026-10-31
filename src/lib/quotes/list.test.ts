import { describe, expect, it } from 'vitest'
import {
  STATUSES_FILTER,
  PER_PAGE,
  statusVisible,
  hrefWithFilters,
  readFilters,
  rangoPages,
  resumenQuote,
  type FiltersList,
} from './list'

const CLIENTE = '0b0f6a43-5d1c-4c1e-9a52-6f1f4f6a2b10'
const VACIOS: FiltersList = { q: '', estado: '', cliente: '', desde: '', hasta: '', pagina: 1 }

describe('constantes', () => {
  it('pagina de a 25 y filtra por los cinco estados visibles', () => {
    expect(PER_PAGE).toBe(25)
    expect(STATUSES_FILTER).toEqual(['borrador', 'enviada', 'vencida', 'aprobada', 'rechazada'])
  })
})

describe('leerFiltros', () => {
  it('sin parámetros devuelve todo vacío y la página 1', () => {
    expect(readFilters({})).toEqual(VACIOS)
  })

  it('lee todos los filtros válidos', () => {
    const params = { q: 'grúa', estado: 'vencida', cliente: CLIENTE, desde: '2026-10-01', hasta: '2026-10-31' }
    expect(readFilters({ ...params, pagina: '3' })).toEqual({ ...params, pagina: 3 })
  })

  it('con parámetros repetidos se queda con el primero', () => {
    const repetidos = { q: ['vertice', 'milicic'], estado: ['enviada', 'borrador'], pagina: ['2', '5'] }
    expect(readFilters(repetidos)).toMatchObject({ q: 'vertice', estado: 'enviada', pagina: 2 })
  })

  it('recorta la búsqueda y la limita a 100 caracteres', () => {
    expect(readFilters({ q: '   112711  ' }).q).toBe('112711')
    expect(readFilters({ q: 'x'.repeat(150) }).q).toHaveLength(100)
  })

  // La búsqueda va a la RPC como JSON: la lista no puede romperse por la URL.
  it('cambia los caracteres de control por espacios (Postgres rechaza \\u0000)', () => {
    expect(readFilters({ q: 'a\u0000b' }).q).toBe('a b')
    expect(readFilters({ q: '\u0000\u001f' }).q).toBe('')
  })

  it('el límite de 100 no corta un emoji a la mitad', () => {
    const q = readFilters({ q: 'x'.repeat(99) + '🏗' }).q
    expect(q.isWellFormed()).toBe(true)
    expect(q).toBe('x'.repeat(99) + '🏗')
    expect(readFilters({ q: '🏗'.repeat(150) }).q).toBe('🏗'.repeat(100))
  })

  it('un estado desconocido o vacío queda en "todos"', () => {
    expect(readFilters({ estado: 'anulada' }).estado).toBe('')
    expect(readFilters({ estado: 'ENVIADA' }).estado).toBe('')
    expect(readFilters({ estado: '' }).estado).toBe('')
  })

  it('un cliente que no es UUID se ignora', () => {
    expect(readFilters({ cliente: 'vertice' }).cliente).toBe('')
    expect(readFilters({ cliente: '' }).cliente).toBe('')
  })

  it('las fechas mal formadas o que no existen se ignoran sin tocar las demás', () => {
    expect(readFilters({ desde: '01/10/2026', hasta: '2026-10-31' })).toMatchObject({ desde: '', hasta: '2026-10-31' })
    expect(readFilters({ desde: '2026-02-30' }).desde).toBe('')
    expect(readFilters({ hasta: '2026-13-01' }).hasta).toBe('')
    // Postgres no acepta el año 0000 (22008): la lista no puede romperse por la URL.
    expect(readFilters({ desde: '0000-01-01', hasta: '0000-02-29' })).toMatchObject({ desde: '', hasta: '' })
  })

  it('da vuelta un rango invertido', () => {
    expect(readFilters({ desde: '2026-10-31', hasta: '2026-10-01' })).toMatchObject({
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
  })

  it.each(['', 'abc', '0', '-2', '2.5', '1e3', '99999999'])('una página inválida (%j) vuelve a la 1', (pagina) => {
    expect(readFilters({ pagina }).pagina).toBe(1)
  })

  it('un filtro inválido no arrastra a los demás', () => {
    expect(readFilters({ q: 'vertice', estado: 'x', cliente: 'y', pagina: 'z' })).toEqual({ ...VACIOS, q: 'vertice' })
  })
})

describe('hrefConFiltros', () => {
  const filters: FiltersList = { ...VACIOS, q: 'grúa 40', estado: 'enviada', pagina: 3 }

  it('sin filtros es la lista sola', () => {
    expect(hrefWithFilters(VACIOS, {})).toBe('/cotizaciones')
  })

  it('cambiar de página conserva los filtros', () => {
    expect(hrefWithFilters(filters, { pagina: 4 })).toBe('/cotizaciones?q=gr%C3%BAa+40&estado=enviada&pagina=4')
  })

  it('la página 1 no va en la URL', () => {
    expect(hrefWithFilters(filters, { pagina: 1 })).toBe('/cotizaciones?q=gr%C3%BAa+40&estado=enviada')
  })

  it('cambiar un filtro vuelve a la página 1', () => {
    expect(hrefWithFilters(filters, { estado: 'vencida' })).toBe('/cotizaciones?q=gr%C3%BAa+40&estado=vencida')
    expect(hrefWithFilters(filters, { cliente: CLIENTE })).toBe(
      `/cotizaciones?q=gr%C3%BAa+40&estado=enviada&cliente=${CLIENTE}`,
    )
  })

  it('sin cambios conserva la página', () => {
    expect(hrefWithFilters(filters, {})).toBe('/cotizaciones?q=gr%C3%BAa+40&estado=enviada&pagina=3')
  })

  it('arma las fechas y saca los filtros vacíos', () => {
    expect(hrefWithFilters(filters, { q: '', estado: '', desde: '2026-10-01', hasta: '2026-10-31' })).toBe(
      '/cotizaciones?desde=2026-10-01&hasta=2026-10-31',
    )
  })

  it('limpiar todos los filtros deja la lista sola', () => {
    expect(hrefWithFilters(filters, { q: '', estado: '', cliente: '', desde: '', hasta: '' })).toBe('/cotizaciones')
  })

  it('lo que arma se vuelve a leer igual', () => {
    const complete: FiltersList = {
      q: 'Ñandú & hijos',
      estado: 'rechazada',
      cliente: CLIENTE,
      desde: '2026-01-01',
      hasta: '2026-12-31',
      pagina: 2,
    }
    const url = new URL(hrefWithFilters(complete, { pagina: 2 }), 'http://localhost')
    expect(readFilters(Object.fromEntries(url.searchParams))).toEqual(complete)
  })
})

describe('estadoVisible', () => {
  it('una enviada vencida se ve como vencida', () => {
    expect(statusVisible('enviada', true)).toBe('vencida')
  })

  it('una enviada al día (o sin el dato) se ve como enviada', () => {
    expect(statusVisible('enviada', false)).toBe('enviada')
    expect(statusVisible('enviada', null)).toBe('enviada')
  })

  it('los demás estados se ven como están, aunque la marca de vencida venga en true', () => {
    expect(statusVisible('borrador', false)).toBe('borrador')
    expect(statusVisible('aprobada', true)).toBe('aprobada')
    expect(statusVisible('rechazada', null)).toBe('rechazada')
  })

  it('un estado desconocido es un error de programación', () => {
    expect(() => statusVisible('anulada', false)).toThrow('Estado de cotización desconocido: anulada')
  })
})

describe('resumenCotizacion', () => {
  const equipo40 = { nombre: 'Grúa telescópica XCMG QY70K-1 40 TN' }
  const subjectDaily =
    'Cotización N° {{numero}} alquiler de 1 (una) Grúa Telescópica capacidad {{capacidad}} TN con operador.'
  /** Una armada en la app, sin equipo ni ubicación salvo que se pidan. */
  const app = (changes: Partial<Parameters<typeof resumenQuote>[0]> = {}) =>
    resumenQuote({ numero: 112711, origen: 'app', asunto: '', datos: {}, equipo: null, ...changes })

  describe('armada en la app', () => {
    it('muestra primero el equipo y la ubicación, aunque tenga asunto', () => {
      const datos = { ubicacion: 'Sargento Vidal Ruta Nacional 151 km 41' }
      expect(app({ asunto: subjectDaily, datos, equipo: equipo40 })).toBe(
        'Grúa telescópica XCMG QY70K-1 40 TN · Sargento Vidal Ruta Nacional 151 km 41',
      )
    })

    it('con solo el equipo o solo la ubicación, muestra lo que haya', () => {
      expect(app({ asunto: subjectDaily, equipo: equipo40 })).toBe('Grúa telescópica XCMG QY70K-1 40 TN')
      expect(app({ asunto: subjectDaily, datos: { ubicacion: 'Añelo' } })).toBe('Añelo')
    })

    it('junta los espacios y los saltos de línea del equipo y la ubicación', () => {
      const equipo = { ...equipo40, nombre: '  Grúa   XCMG 70 TN ' }
      expect(app({ datos: { ubicacion: 'Loma Campana\nYPF' }, equipo })).toBe('Grúa XCMG 70 TN · Loma Campana YPF')
    })

    it('sin equipo ni ubicación, el asunto resuelto sin el prefijo "Cotización N° …" y con mayúscula', () => {
      expect(app({ asunto: subjectDaily })).toBe('Alquiler de 1 (una) Grúa Telescópica capacidad TN con operador.')
    })

    it.each([
      ['con tilde', 'Cotización N° {{numero}} alquiler de grúa'],
      ['sin tilde', 'Cotizacion N° {{numero}} alquiler de grúa'],
      ['en mayúsculas', 'COTIZACIÓN N° {{numero}} alquiler de grúa'],
      ['con Nº (ordinal)', 'Cotización Nº {{numero}} alquiler de grúa'],
      ['con Nro.', 'cotizacion Nro. {{numero}} alquiler de grúa'],
      ['con N.º', 'Cotización N.º {{numero}} alquiler de grúa'],
      ['con el número escrito', 'Cotización N° 112500 alquiler de grúa'],
      ['con un guion después', 'Cotización N° {{numero}} - alquiler de grúa'],
      ['con dos puntos después', 'Cotización N°{{numero}}: alquiler de grúa'],
    ])('quita el prefijo %s', (_caso, asunto) => {
      expect(app({ asunto })).toBe('Alquiler de grúa')
    })

    it('solo quita el prefijo al comienzo', () => {
      expect(app({ asunto: 'Alquiler de grúa (Cotización N° {{numero}})' })).toBe(
        'Alquiler de grúa (Cotización N° 112711)',
      )
      expect(app({ asunto: 'Cotizaciones varias' })).toBe('Cotizaciones varias')
      // Sin "N°" el número es parte del trabajo.
      expect(app({ asunto: 'Cotización 2 grúas para Añelo' })).toBe('Cotización 2 grúas para Añelo')
    })

    it('quita las variables que no se pueden resolver y los espacios que quedan', () => {
      expect(app({ asunto: 'Izaje en {{ubicacion}} , {{ubicación}} norte' })).toBe('Izaje en, norte')
    })

    it('resuelve las variables con los datos de la cotización; la capacidad, sin equipo, queda vacía', () => {
      const asunto = 'Grúa de {{capacidad}} TN, pago {{forma_pago}}.'
      expect(app({ asunto, datos: { forma_pago: 'a 30 días F.F.' } })).toBe('Grúa de TN, pago a 30 días F.F.')
    })

    it('un asunto que solo era el prefijo, o que queda solo con signos, es una raya', () => {
      expect(app({ asunto: 'Cotización N° {{numero}}' })).toBe('—')
      expect(app({ asunto: 'Cotización N° {{numero}}.' })).toBe('—')
      expect(app({ asunto: '{{ubicacion}}.' })).toBe('—')
    })

    it('sin nada que mostrar, una raya', () => {
      expect(app({ datos: null })).toBe('—')
      expect(app({ asunto: '   ', datos: { ubicacion: '  ' }, equipo: { ...equipo40, nombre: ' ' } })).toBe('—')
    })
  })

  describe('cargada o directa', () => {
    it('muestra el asunto que escribió el usuario, aunque tenga equipo y ubicación', () => {
      const asunto = '  Montaje de tanque\nen Añelo '
      const row = { numero: 5, asunto, datos: { ubicacion: 'Añelo' }, equipo: equipo40 }
      expect(resumenQuote({ ...row, origen: 'directa' })).toBe('Montaje de tanque en Añelo')
      expect(resumenQuote({ ...row, origen: 'importada' })).toBe('Montaje de tanque en Añelo')
    })

    it('no le quita el prefijo "Cotización N°" (lo escribió así)', () => {
      const row = { numero: 5, origen: 'importada', asunto: 'Cotización N° 5 montaje', datos: {}, equipo: null }
      expect(resumenQuote(row)).toBe('Cotización N° 5 montaje')
    })

    it('sin asunto, una raya (no cae al equipo ni a la ubicación)', () => {
      const row = { numero: 5, origen: 'directa', asunto: '  ', datos: { ubicacion: 'Añelo' }, equipo: equipo40 }
      expect(resumenQuote(row)).toBe('—')
    })
  })
})

describe('rangoPaginas', () => {
  it('sin páginas no hay nada que mostrar', () => {
    expect(rangoPages(1, 0)).toEqual([])
  })

  it('hasta 7 páginas las muestra todas', () => {
    expect(rangoPages(1, 1)).toEqual([1])
    expect(rangoPages(3, 5)).toEqual([1, 2, 3, 4, 5])
    expect(rangoPages(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('cerca del principio muestra las primeras cinco y la última', () => {
    expect(rangoPages(1, 12)).toEqual([1, 2, 3, 4, 5, '…', 12])
    expect(rangoPages(4, 12)).toEqual([1, 2, 3, 4, 5, '…', 12])
    expect(rangoPages(1, 8)).toEqual([1, 2, 3, 4, 5, '…', 8])
  })

  it('en el medio muestra la primera, la actual con sus vecinas y la última', () => {
    expect(rangoPages(5, 12)).toEqual([1, '…', 4, 5, 6, '…', 12])
    expect(rangoPages(8, 12)).toEqual([1, '…', 7, 8, 9, '…', 12])
  })

  it('cerca del final muestra la primera y las últimas cinco', () => {
    expect(rangoPages(9, 12)).toEqual([1, '…', 8, 9, 10, 11, 12])
    expect(rangoPages(12, 12)).toEqual([1, '…', 8, 9, 10, 11, 12])
    expect(rangoPages(5, 8)).toEqual([1, '…', 4, 5, 6, 7, 8])
  })

  it('una página fuera de rango se acomoda al extremo', () => {
    expect(rangoPages(0, 12)).toEqual(rangoPages(1, 12))
    expect(rangoPages(99, 12)).toEqual(rangoPages(12, 12))
  })

  it('nunca pasa de 7 lugares y siempre incluye la actual, la primera y la última', () => {
    for (let total = 1; total <= 30; total++) {
      for (let actual = 1; actual <= total; actual++) {
        const pages = rangoPages(actual, total)
        expect(pages.length).toBeLessThanOrEqual(7)
        expect(pages).toContain(actual)
        expect(pages[0]).toBe(1)
        expect(pages.at(-1)).toBe(total)
      }
    }
  })
})
