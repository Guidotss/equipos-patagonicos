import { describe, expect, it } from 'vitest'
import { readAllPages } from '.././queries'

describe('lectura completa de distribuciones', () => {
  it('lee todas las páginas incluso al superar el límite normal de PostgREST', async () => {
    const all = Array.from({ length: 1201 }, (_, id) => ({ id }))
    const ranges: number[][] = []
    const result = await readAllPages((from, to) => {
      ranges.push([from, to])
      return Promise.resolve({ data: all.slice(from, to + 1), error: null })
    })
    expect(result).toEqual(all)
    expect(ranges).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ])
  })
  it('propaga un error intermedio en lugar de devolver una colección parcial', async () => {
    await expect(
      readAllPages((from) =>
        Promise.resolve(
          from === 0
            ? { data: Array(500).fill(1), error: null }
            : { data: null, error: new Error('Lectura interrumpida') },
        ),
      ),
    ).rejects.toThrow('Lectura interrumpida')
  })
})
