import { describe, expect, it } from 'vitest'
import { hrefBudgets, readFiltersBudgets } from './list'

describe('filtros de presupuestos', () => {
  it('valida URLs escritas a mano sin romper los demás filtros', () => {
    expect(
      readFiltersBudgets({
        q: ['  Grúas\u0000 sur  ', 'otro'],
        cliente: 'x',
        estado: 'desconocido',
        pagina: '1e3',
      }),
    ).toEqual({ q: 'Grúas  sur', cliente: '', estado: '', pagina: 1 })
  })
  it('mantiene filtros al paginar y codifica la búsqueda', () => {
    const filters = readFiltersBudgets({ q: 'OC & remitos', estado: 'en_curso', pagina: '2' })
    expect(hrefBudgets(filters, 3)).toBe('/presupuestos?q=OC+%26+remitos&estado=en_curso&pagina=3')
  })
})
