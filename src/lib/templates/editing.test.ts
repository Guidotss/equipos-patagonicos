// src/lib/plantillas/edicion.test.ts
import { describe, expect, it } from 'vitest'
import { parsearFormat } from './format'
import {
  alternarNegrita,
  alternarVineta,
  blockOfTemplate,
  extenderAVariables,
  limpiarPegado,
  mismosBlocks,
  nivelOfLine,
  pegar,
  quitarSangria,
  tramoCambiado,
} from './editing'

describe('nivelDeLinea', () => {
  it('usa las mismas marcas que parsearFormato', () => {
    expect(nivelOfLine('texto')).toBe(0)
    expect(nivelOfLine('- texto')).toBe(1)
    expect(nivelOfLine('• texto')).toBe(1)
    expect(nivelOfLine('  - texto')).toBe(2)
    expect(nivelOfLine('\t- texto')).toBe(0)
    expect(nivelOfLine('-30 días')).toBe(0)
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
    expect(parsearFormat(negrita.texto).map((nodo) => nodo.segmentos)).toEqual([
      [{ texto: 'uno', negrita: true }],
      [{ texto: 'dos', negrita: true }],
    ])
    expect(alternarNegrita(negrita.texto, negrita.seleccion).texto).toBe('- uno\n- dos')
  })

  it('una selección con negrita parcial queda toda en negrita, sin asteriscos anidados', () => {
    expect(alternarNegrita('**a** b', { inicio: 0, fin: 7 }).texto).toBe('**a b**')
  })

  it('una selección que empieza dentro de una negrita y termina afuera la extiende, sin ** sueltos', () => {
    const editing = alternarNegrita('**hola** mundo', { inicio: 2, fin: 14 })
    expect(editing).toEqual({ texto: '**hola mundo**', seleccion: { inicio: 0, fin: 14 } })
    expect(parsearFormat(editing.texto)[0].segmentos).toEqual([{ texto: 'hola mundo', negrita: true }])
  })

  it('una selección que empieza afuera y termina dentro de una negrita la extiende, sin ** sueltos', () => {
    const editing = alternarNegrita('hola **mundo**', { inicio: 0, fin: 9 })
    expect(editing).toEqual({ texto: '**hola mundo**', seleccion: { inicio: 0, fin: 14 } })
    expect(parsearFormat(editing.texto)[0].segmentos).toEqual([{ texto: 'hola mundo', negrita: true }])
  })

  it('extender la negrita de la forma de pago de la plantilla por jornada hasta el final', () => {
    const texto = '**Forma de pago:** {{forma_pago}}.'
    const editing = alternarNegrita(texto, { inicio: texto.indexOf('pago:'), fin: texto.length })
    expect(editing.texto).toBe('**Forma de pago: {{forma_pago}}.**')
    expect(parsearFormat(editing.texto)[0].segmentos).toEqual([
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
    const editing = alternarNegrita('**x**y**', { inicio: 5, fin: 6 })
    expect(parsearFormat(editing.texto)[0].segmentos).toEqual([
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

  it('varias líneas con los dos bordes dentro de negritas: extiende las dos, sin ** sueltos', () => {
    const editing = alternarNegrita('**uno** x\ny **dos**', { inicio: 3, fin: 16 })
    expect(editing).toEqual({ texto: '**uno x**\n**y dos**', seleccion: { inicio: 0, fin: 19 } })
    expect(parsearFormat(editing.texto).map((nodo) => nodo.segmentos)).toEqual([
      [{ texto: 'uno x', negrita: true }],
      [{ texto: 'y dos', negrita: true }],
    ])
  })

  it('un borde entre los dos * de una marca cuenta como dentro de la negrita', () => {
    expect(alternarNegrita('**hola** mundo', { inicio: 1, fin: 5 })).toEqual({
      texto: 'hola mundo',
      seleccion: { inicio: 0, fin: 4 },
    })
  })

  it('nunca corta una variable: la selección dentro de {{…}} toma la variable entera', () => {
    expect(alternarNegrita('{{equipo_descripcion}}', { inicio: 4, fin: 10 })).toEqual({
      texto: '**{{equipo_descripcion}}**',
      seleccion: { inicio: 0, fin: 26 },
    })
    // Con el cursor adentro, también: insertar **** ahí rompería la variable.
    expect(alternarNegrita('Equipo: {{capacidad}} TN', { inicio: 12, fin: 12 }).texto).toBe(
      'Equipo: **{{capacidad}}** TN',
    )
  })
})

describe('extenderAVariables', () => {
  it('lleva cada borde que cae dentro de {{…}} al borde de la variable', () => {
    expect(extenderAVariables('{{equipo_descripcion}}', { inicio: 4, fin: 10 })).toEqual({ inicio: 0, fin: 22 })
    expect(extenderAVariables('Grúa de {{capacidad}} TN', { inicio: 0, fin: 12 })).toEqual({ inicio: 0, fin: 21 })
    expect(extenderAVariables('Grúa de {{capacidad}} TN', { inicio: 9, fin: 24 })).toEqual({ inicio: 8, fin: 24 })
    // Entre las dos llaves también es adentro.
    expect(extenderAVariables('a {{x}} b', { inicio: 3, fin: 3 })).toEqual({ inicio: 2, fin: 7 })
  })

  it('no toca una selección que ya está afuera o que abarca la variable entera', () => {
    expect(extenderAVariables('a {{x}} b', { inicio: 2, fin: 7 })).toEqual({ inicio: 2, fin: 7 })
    expect(extenderAVariables('a {{x}} b', { inicio: 0, fin: 1 })).toEqual({ inicio: 0, fin: 1 })
    expect(extenderAVariables('a {{x}} b', { inicio: 7, fin: 7 })).toEqual({ inicio: 7, fin: 7 })
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

  it('una sola línea sin viñeta conserva el espacio del final; varias líneas se recortan', () => {
    expect(limpiarPegado('palabra ')).toBe('palabra ')
    expect(limpiarPegado('palabra\u00a0')).toBe('palabra ')
    expect(limpiarPegado('uno \r\ndos\t')).toBe('uno\ndos')
    expect(limpiarPegado('•\tsola viñeta ')).toBe('- sola viñeta')
  })

  it('§ es viñeta solo en un pegado de varias líneas, y debajo de una subviñeta sigue en nivel 2', () => {
    expect(limpiarPegado('§ 5 del contrato')).toBe('§ 5 del contrato')
    expect(limpiarPegado('§\tUno\r\n§\tDos')).toBe('- Uno\n- Dos')
    expect(limpiarPegado('•\tUno\r\no\tDos\r\n§\tTres\r\n§\tCuatro')).toBe('- Uno\n  - Dos\n  - Tres\n  - Cuatro')
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

describe('tramoCambiado', () => {
  it('lo que cambia entre el texto viejo y el nuevo, sin el principio y el final en común', () => {
    expect(tramoCambiado('hola mundo', '**hola** mundo')).toEqual({ inicio: 0, fin: 4, reemplazo: '**hola**' })
    expect(tramoCambiado('**hola** mundo', 'hola mundo')).toEqual({ inicio: 0, fin: 8, reemplazo: 'hola' })
    expect(tramoCambiado('uno\ndos', '- uno\n- dos')).toEqual({ inicio: 0, fin: 4, reemplazo: '- uno\n- ' })
  })

  it('el principio y el final en común no se pisan cuando el texto se repite', () => {
    // "aa" → "aaa": se agrega una "a"; el tramo no puede empezar después de donde termina.
    expect(tramoCambiado('aa', 'aaa')).toEqual({ inicio: 2, fin: 2, reemplazo: 'a' })
    expect(tramoCambiado('a****b', 'ab')).toEqual({ inicio: 1, fin: 5, reemplazo: '' })
    expect(tramoCambiado('igual', 'igual')).toEqual({ inicio: 5, fin: 5, reemplazo: '' })
  })
})

describe('bloques de la plantilla', () => {
  const template = [
    { titulo: 'Equipo ofrecido', contenido: '{{equipo_descripcion}}', hidden: false },
    { titulo: 'Alcance', contenido: 'Horario de {{horario}}.', hidden: false },
    { titulo: '', contenido: '**Forma de pago:** {{forma_pago}}.', hidden: false },
  ]

  it('bloqueDePlantilla busca por título (también el bloque sin título)', () => {
    const bloques = [{ titulo: 'Otro' }, { titulo: ' Alcance ' }, { titulo: '' }]
    expect(blockOfTemplate(template, bloques, 1)).toEqual(template[1])
    expect(blockOfTemplate(template, bloques, 2)).toEqual(template[2])
    expect(blockOfTemplate(template, bloques, 0)).toBeNull()
  })

  it('bloqueDePlantilla empareja los títulos repetidos por orden de aparición', () => {
    const withRepetidos = [
      { titulo: '', contenido: 'Primero sin título', hidden: false },
      { titulo: 'Alcance', contenido: 'Alcance', hidden: false },
      { titulo: '', contenido: 'Segundo sin título', hidden: false },
    ]
    const bloques = [{ titulo: '' }, { titulo: '' }, { titulo: 'Alcance' }, { titulo: '' }]
    expect(blockOfTemplate(withRepetidos, bloques, 0)).toEqual(withRepetidos[0])
    expect(blockOfTemplate(withRepetidos, bloques, 1)).toEqual(withRepetidos[2])
    expect(blockOfTemplate(withRepetidos, bloques, 2)).toEqual(withRepetidos[1])
    // La plantilla tiene dos sin título: el tercero no tiene con qué restaurarse.
    expect(blockOfTemplate(withRepetidos, bloques, 3)).toBeNull()
  })

  it('mismosBloques: no hay nada que restaurar si son los mismos, en orden y visibles', () => {
    expect(mismosBlocks(template, template)).toBe(true)
    expect(mismosBlocks([template[1], template[0], template[2]], template)).toBe(false)
    expect(mismosBlocks([{ ...template[0], hidden: true }, template[1], template[2]], template)).toBe(false)
    expect(mismosBlocks(template.slice(1), template)).toBe(false)
  })
})
