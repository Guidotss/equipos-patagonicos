import { describe, expect, it } from 'vitest'
import { resolverVariables, variablesDesconocidas, variablesUsadas } from './variables'

describe('variablesUsadas', () => {
  it('lista cada variable una sola vez, admitiendo espacios dentro de las llaves', () => {
    expect(variablesUsadas('Grúa de {{capacidad}} TN en {{ ubicacion }}; {{capacidad}} TN')).toEqual([
      'capacidad',
      'ubicacion',
    ])
  })
})

describe('variablesDesconocidas', () => {
  it('detecta nombres que no están en el catálogo', () => {
    expect(variablesDesconocidas('{{capacidad}} y {{capasidad}} y {{otra_cosa}}')).toEqual(['capasidad', 'otra_cosa'])
  })
})

describe('resolverVariables', () => {
  it('reemplaza las variables con valor y reporta las faltantes sin tocarlas', () => {
    const resultado = resolverVariables('Grúa de {{capacidad}} TN en {{ubicacion}}. Pago: {{forma_pago}}', {
      capacidad: '70',
      ubicacion: '   ',
    })
    expect(resultado).toEqual({
      texto: 'Grúa de 70 TN en {{ubicacion}}. Pago: {{forma_pago}}',
      faltantes: ['ubicacion', 'forma_pago'],
    })
  })

  it('no interpreta los "$" del valor como patrones de reemplazo', () => {
    expect(resolverVariables('Precio: {{forma_pago}}', { forma_pago: '$ 1.950.000 $&' }).texto).toBe(
      'Precio: $ 1.950.000 $&',
    )
  })

  it('deja intactas las variables desconocidas y no las reporta como faltantes', () => {
    expect(resolverVariables('{{desconocida}}', {})).toEqual({ texto: '{{desconocida}}', faltantes: [] })
  })
})
