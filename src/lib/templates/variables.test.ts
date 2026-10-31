import { describe, expect, it } from 'vitest'
import { partirVariables, resolverVariables, variablesDesconocidas, usedVariables } from './variables'

describe('partirVariables', () => {
  it('deja los nombres recortados en las posiciones impares', () => {
    expect(partirVariables('con base en {{ indice_base }}. Próxima: {{proxima_actualizacion}}')).toEqual([
      'con base en ',
      'indice_base',
      '. Próxima: ',
      'proxima_actualizacion',
      '',
    ])
  })

  it('devuelve el texto entero si no hay variables', () => {
    expect(partirVariables('sin variables')).toEqual(['sin variables'])
  })
})

describe('variablesUsadas', () => {
  it('lista cada variable una sola vez, admitiendo espacios dentro de las llaves', () => {
    expect(usedVariables('Grúa de {{capacidad}} TN en {{ ubicacion }}; {{capacidad}} TN')).toEqual([
      'capacidad',
      'ubicacion',
    ])
  })
})

describe('variablesDesconocidas', () => {
  it('detecta nombres que no están en el catálogo', () => {
    expect(variablesDesconocidas('{{capacidad}} y {{capasidad}} y {{otra_cosa}}')).toEqual(['capasidad', 'otra_cosa'])
  })

  it('detecta nombres mal tipeados con acentos, mayúsculas, espacios o dígitos', () => {
    expect(
      variablesDesconocidas('En {{ubicación}} con {{Capacidad}} TN, {{plazo entrega}}, {{ validez_dias2 }} y {{ubicacion}}'),
    ).toEqual(['ubicación', 'Capacidad', 'plazo entrega', 'validez_dias2'])
  })
})

describe('resolverVariables', () => {
  it('reemplaza las variables con valor y reporta las faltantes sin tocarlas', () => {
    const result = resolverVariables('Grúa de {{capacidad}} TN en {{ubicacion}}. Pago: {{forma_pago}}', {
      capacidad: '70',
      ubicacion: '   ',
    })
    expect(result).toEqual({
      texto: 'Grúa de 70 TN en {{ubicacion}}. Pago: {{forma_pago}}',
      faltantes: ['ubicacion', 'forma_pago'],
    })
  })

  it('reemplaza las variables con espacios dentro de las llaves', () => {
    expect(resolverVariables('Grúa de {{ capacidad }} TN', { capacidad: '70' })).toEqual({
      texto: 'Grúa de 70 TN',
      faltantes: [],
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
