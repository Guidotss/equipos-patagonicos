import { describe, expect, it } from 'vitest'
import { frasesConVariables } from './frases'

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
    expect(frasesConVariables(plantillas, ['capacidad', 'equipo_descripcion'])).toEqual([
      'Grúa de {{capacidad}} TN en {{ubicacion}}.',
      '{{equipo_descripcion}}',
    ])
  })

  it('devuelve una lista vacía si ninguna plantilla las usa', () => {
    expect(frasesConVariables(plantillas, ['indice_base'])).toEqual([])
  })
})
