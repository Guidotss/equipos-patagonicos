import { describe, expect, it } from 'vitest'
import { phrasesWithVariables } from './phrases'

const plantillas = [
  {
    bloques: [
      { titulo: 'Condiciones', contenido: '- Grúa de **{{capacidad}} TN** en {{ubicacion}}.\nSin variables.\n  - {{equipo_descripcion}}' },
    ],
  },
  { bloques: [{ titulo: '', contenido: '{{equipo_descripcion}}' }] },
]

describe('frasesConVariables', () => {
  it('devuelve las oraciones que usan esas variables, sin viñetas, negritas ni repetidas', () => {
    expect(phrasesWithVariables(plantillas, ['capacidad', 'equipo_descripcion'])).toEqual([
      'Grúa de {{capacidad}} TN en {{ubicacion}}.',
      '{{equipo_descripcion}}',
    ])
  })

  it('devuelve una lista vacía si ninguna plantilla las usa', () => {
    expect(phrasesWithVariables(plantillas, ['indice_base'])).toEqual([])
  })
})
