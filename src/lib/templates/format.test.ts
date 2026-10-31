import { describe, expect, it } from 'vitest'
import { parsearFormat, parsearNegritas } from './format'

describe('parsearNegritas', () => {
  it('separa los tramos en negrita', () => {
    expect(parsearNegritas('a **b** c')).toEqual([
      { texto: 'a ', negrita: false },
      { texto: 'b', negrita: true },
      { texto: ' c', negrita: false },
    ])
  })

  it('un ** sin cerrar queda literal', () => {
    expect(parsearNegritas('a **b')).toEqual([{ texto: 'a **b', negrita: false }])
    expect(parsearNegritas('**x** y **z')).toEqual([
      { texto: 'x', negrita: true },
      { texto: ' y **z', negrita: false },
    ])
  })

  it('descarta tramos vacíos', () => {
    expect(parsearNegritas('**Forma de pago:**')).toEqual([{ texto: 'Forma de pago:', negrita: true }])
  })
})

describe('parsearFormato', () => {
  it('reconoce párrafos y viñetas de dos niveles, e ignora líneas vacías', () => {
    const texto = 'Intro\n\n- Primero\n  - Detalle\n• Segundo\n    - Detalle con más sangría'
    expect(parsearFormat(texto)).toEqual([
      { tipo: 'parrafo', segmentos: [{ texto: 'Intro', negrita: false }] },
      { tipo: 'vineta', nivel: 1, segmentos: [{ texto: 'Primero', negrita: false }] },
      { tipo: 'vineta', nivel: 2, segmentos: [{ texto: 'Detalle', negrita: false }] },
      { tipo: 'vineta', nivel: 1, segmentos: [{ texto: 'Segundo', negrita: false }] },
      { tipo: 'vineta', nivel: 2, segmentos: [{ texto: 'Detalle con más sangría', negrita: false }] },
    ])
  })

  it('aplica negritas dentro de viñetas y acepta saltos \\r\\n', () => {
    expect(parsearFormat('- **Documentación:** el Cliente…\r\nFin')).toEqual([
      {
        tipo: 'vineta',
        nivel: 1,
        segmentos: [
          { texto: 'Documentación:', negrita: true },
          { texto: ' el Cliente…', negrita: false },
        ],
      },
      { tipo: 'parrafo', segmentos: [{ texto: 'Fin', negrita: false }] },
    ])
  })

  it('un guion sin espacio no es viñeta', () => {
    expect(parsearFormat('-30 días')).toEqual([{ tipo: 'parrafo', segmentos: [{ texto: '-30 días', negrita: false }] }])
  })
})
