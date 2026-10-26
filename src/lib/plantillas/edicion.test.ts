// src/lib/plantillas/edicion.test.ts
import { describe, expect, it } from 'vitest'
import { parsearFormato } from './formato'
import {
  alternarNegrita,
  alternarVineta,
  bloqueDePlantilla,
  limpiarPegado,
  mismosBloques,
  nivelDeLinea,
  pegar,
  quitarSangria,
} from './edicion'

describe('nivelDeLinea', () => {
  it('usa las mismas marcas que parsearFormato', () => {
    expect(nivelDeLinea('texto')).toBe(0)
    expect(nivelDeLinea('- texto')).toBe(1)
    expect(nivelDeLinea('• texto')).toBe(1)
    expect(nivelDeLinea('  - texto')).toBe(2)
    expect(nivelDeLinea('\t- texto')).toBe(0)
    expect(nivelDeLinea('-30 días')).toBe(0)
  })
})

describe('alternarNegrita', () => {
  it('envuelve la selección en ** y la deja marcada', () => {
    expect(alternarNegrita('hola mundo', { inicio: 0, fin: 4 })).toEqual({
      texto: '**hola** mundo',
      seleccion: { inicio: 0, fin: 8 },
    })
  })

  it('los espacios de los bordes de la selección quedan afuera', () => {
    expect(alternarNegrita('hola mundo', { inicio: 0, fin: 5 }).texto).toBe('**hola** mundo')
  })

  it('si ya está en negrita, la quita (con o sin los asteriscos seleccionados)', () => {
    expect(alternarNegrita('**hola** mundo', { inicio: 0, fin: 8 })).toEqual({
      texto: 'hola mundo',
      seleccion: { inicio: 0, fin: 4 },
    })
    expect(alternarNegrita('**hola** mundo', { inicio: 2, fin: 6 })).toEqual({
      texto: 'hola mundo',
      seleccion: { inicio: 0, fin: 4 },
    })
  })

  it('línea por línea, dejando afuera la marca de viñeta (el formato no cruza saltos)', () => {
    const negrita = alternarNegrita('- uno\n- dos', { inicio: 0, fin: 11 })
    expect(negrita).toEqual({ texto: '- **uno**\n- **dos**', seleccion: { inicio: 0, fin: 19 } })
    expect(parsearFormato(negrita.texto).map((nodo) => nodo.segmentos)).toEqual([
      [{ texto: 'uno', negrita: true }],
      [{ texto: 'dos', negrita: true }],
    ])
    expect(alternarNegrita(negrita.texto, negrita.seleccion).texto).toBe('- uno\n- dos')
  })

  it('una selección con negrita parcial queda toda en negrita, sin asteriscos anidados', () => {
    expect(alternarNegrita('**a** b', { inicio: 0, fin: 7 }).texto).toBe('**a b**')
  })

  it('una selección que empieza dentro de una negrita y termina afuera la extiende, sin ** sueltos', () => {
    const edicion = alternarNegrita('**hola** mundo', { inicio: 2, fin: 14 })
    expect(edicion).toEqual({ texto: '**hola mundo**', seleccion: { inicio: 0, fin: 14 } })
    expect(parsearFormato(edicion.texto)[0].segmentos).toEqual([{ texto: 'hola mundo', negrita: true }])
  })

  it('una selección que empieza afuera y termina dentro de una negrita la extiende, sin ** sueltos', () => {
    const edicion = alternarNegrita('hola **mundo**', { inicio: 0, fin: 9 })
    expect(edicion).toEqual({ texto: '**hola mundo**', seleccion: { inicio: 0, fin: 14 } })
    expect(parsearFormato(edicion.texto)[0].segmentos).toEqual([{ texto: 'hola mundo', negrita: true }])
  })

  it('extender la negrita de la forma de pago de la plantilla por jornada hasta el final', () => {
    const texto = '**Forma de pago:** {{forma_pago}}.'
    const edicion = alternarNegrita(texto, { inicio: texto.indexOf('pago:'), fin: texto.length })
    expect(edicion.texto).toBe('**Forma de pago: {{forma_pago}}.**')
    expect(parsearFormato(edicion.texto)[0].segmentos).toEqual([
      { texto: 'Forma de pago: {{forma_pago}}.', negrita: true },
    ])
  })

  it('una selección dentro de una negrita la quita entera (no deja ** sueltos)', () => {
    expect(alternarNegrita('**hola mundo** chau', { inicio: 7, fin: 12 })).toEqual({
      texto: 'hola mundo chau',
      seleccion: { inicio: 0, fin: 10 },
    })
  })

  it('entre dos negritas, pone en negrita lo elegido sin desparejar los ** de al lado', () => {
    // El "**" del final ya era texto suelto y sigue siéndolo.
    const edicion = alternarNegrita('**x**y**', { inicio: 5, fin: 6 })
    expect(parsearFormato(edicion.texto)[0].segmentos).toEqual([
      { texto: 'x', negrita: true },
      { texto: 'y', negrita: true },
      { texto: '**', negrita: false },
    ])
  })

  it('sin selección inserta **** con el cursor en el medio, y lo saca si se repite', () => {
    expect(alternarNegrita('ab', { inicio: 1, fin: 1 })).toEqual({ texto: 'a****b', seleccion: { inicio: 3, fin: 3 } })
    expect(alternarNegrita('a****b', { inicio: 3, fin: 3 })).toEqual({ texto: 'ab', seleccion: { inicio: 1, fin: 1 } })
  })

  it('una selección de solo espacios no cambia nada', () => {
    expect(alternarNegrita('a  b', { inicio: 1, fin: 3 })).toEqual({ texto: 'a  b', seleccion: { inicio: 1, fin: 3 } })
  })
})

describe('alternarVineta', () => {
  it('pone viñeta a cada línea tocada y marca las líneas enteras', () => {
    expect(alternarVineta('uno\ndos', { inicio: 1, fin: 6 }, 1)).toEqual({
      texto: '- uno\n- dos',
      seleccion: { inicio: 0, fin: 11 },
    })
  })

  it('si ya son todas viñetas de ese nivel, las vuelve párrafo', () => {
    expect(alternarVineta('- uno\n- dos', { inicio: 0, fin: 11 }, 1)).toEqual({
      texto: 'uno\ndos',
      seleccion: { inicio: 0, fin: 7 },
    })
  })

  it('cambia de nivel y respeta las líneas vacías', () => {
    expect(alternarVineta('- uno\n\ndos', { inicio: 0, fin: 10 }, 2).texto).toBe('  - uno\n\n  - dos')
    expect(alternarVineta('- uno\ndos', { inicio: 0, fin: 9 }, 1).texto).toBe('- uno\n- dos')
  })

  it('una selección que termina al principio de una línea no la toca', () => {
    expect(alternarVineta('uno\ndos', { inicio: 0, fin: 4 }, 1).texto).toBe('- uno\ndos')
  })

  it('con el cursor, el cursor sigue en el mismo lugar del texto', () => {
    expect(alternarVineta('- uno', { inicio: 2, fin: 2 }, 2)).toEqual({
      texto: '  - uno',
      seleccion: { inicio: 4, fin: 4 },
    })
    expect(alternarVineta('uno', { inicio: 3, fin: 3 }, 1).seleccion).toEqual({ inicio: 5, fin: 5 })
  })

  it('en una línea vacía pone la marca para empezar a escribir', () => {
    expect(alternarVineta('', { inicio: 0, fin: 0 }, 1)).toEqual({ texto: '- ', seleccion: { inicio: 2, fin: 2 } })
    expect(alternarVineta('uno\n', { inicio: 4, fin: 4 }, 2)).toEqual({
      texto: 'uno\n  - ',
      seleccion: { inicio: 8, fin: 8 },
    })
  })
})

describe('quitarSangria', () => {
  it('subviñeta → viñeta → párrafo', () => {
    expect(quitarSangria('  - uno\n- dos\ntres', { inicio: 0, fin: 18 })).toEqual({
      texto: '- uno\ndos\ntres',
      seleccion: { inicio: 0, fin: 14 },
    })
    expect(quitarSangria('- dos', { inicio: 5, fin: 5 })).toEqual({ texto: 'dos', seleccion: { inicio: 3, fin: 3 } })
  })
})

describe('limpiarPegado', () => {
  it('lleva las viñetas de Word al formato mínimo y limpia saltos, tabs y espacios duros', () => {
    expect(limpiarPegado('•\tPrimera\r\no\tSegunda\r\nTexto\tcon tab ')).toBe('- Primera\n  - Segunda\nTexto con tab')
    expect(limpiarPegado('·  Ítem con punto medio')).toBe('- Ítem con punto medio')
    expect(limpiarPegado('precio final')).toBe('precio final')
  })

  it('no toca lo que ya está en el formato ni un número negativo', () => {
    expect(limpiarPegado('- ya era viñeta\n  - y subviñeta')).toBe('- ya era viñeta\n  - y subviñeta')
    expect(limpiarPegado('-30 días de plazo')).toBe('-30 días de plazo')
  })
})

describe('pegar', () => {
  it('reemplaza la selección por lo pegado ya limpio y deja el cursor al final', () => {
    expect(pegar('Hola mundo', { inicio: 5, fin: 10 }, '•\tgente\r\n')).toEqual({
      texto: 'Hola - gente\n',
      seleccion: { inicio: 13, fin: 13 },
    })
  })
})

describe('bloques de la plantilla', () => {
  const plantilla = [
    { titulo: 'Equipo ofrecido', contenido: '{{equipo_descripcion}}', oculto: false },
    { titulo: 'Alcance', contenido: 'Horario de {{horario}}.', oculto: false },
    { titulo: '', contenido: '**Forma de pago:** {{forma_pago}}.', oculto: false },
  ]

  it('bloqueDePlantilla busca por título (también el bloque sin título)', () => {
    expect(bloqueDePlantilla(plantilla, ' Alcance ')).toEqual(plantilla[1])
    expect(bloqueDePlantilla(plantilla, '')).toEqual(plantilla[2])
    expect(bloqueDePlantilla(plantilla, 'Otro')).toBeNull()
  })

  it('mismosBloques: no hay nada que restaurar si son los mismos, en orden y visibles', () => {
    expect(mismosBloques(plantilla, plantilla)).toBe(true)
    expect(mismosBloques([plantilla[1], plantilla[0], plantilla[2]], plantilla)).toBe(false)
    expect(mismosBloques([{ ...plantilla[0], oculto: true }, plantilla[1], plantilla[2]], plantilla)).toBe(false)
    expect(mismosBloques(plantilla.slice(1), plantilla)).toBe(false)
  })
})
