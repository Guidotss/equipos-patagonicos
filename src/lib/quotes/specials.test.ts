import { describe, expect, it } from 'vitest'
import { schemaSpecial, templateFromEditor } from './specials'
import { statusNew } from './editor'

const base = { cliente_id: 'c89e2415-08af-4aa4-a819-8841854eb0c1', fecha: '2026-10-28', fecha_aprobacion: '', asunto: 'Izaje', notas: '', formato: 'jornada', estado: 'enviada', numero: '112700' }

describe('cotizaciones cargadas y presupuestos directos', () => {
  it('conserva número, fecha y cliente de una cotización existente', () => {
    expect(schemaSpecial('importada').parse(base).numero).toBe(112700)
  })
  it.each(['0', '-1', '1.5', 'abc', '9007199254740992'])('rechaza número inválido %s', (numero) => {
    expect(schemaSpecial('importada').safeParse({ ...base, numero }).success).toBe(false)
  })
  it('no acepta una aprobación anterior ni fechas imposibles', () => {
    expect(schemaSpecial('importada').safeParse({ ...base, estado: 'aprobada', fecha_aprobacion: '2026-10-27' }).success).toBe(false)
    expect(schemaSpecial('directa').safeParse({ ...base, fecha: '2026-02-30' }).success).toBe(false)
  })
  it('un directo exige describir el trabajo y no exige número', () => {
    expect(schemaSpecial('directa').safeParse({ ...base, numero: '' }).success).toBe(true)
    expect(schemaSpecial('directa').safeParse({ ...base, asunto: ' ' }).success).toBe(false)
  })
  it('guardar una plantilla conserva cantidades y textos, sin incluir tarifas ni datos del cliente', () => {
    const estado = statusNew({ plantilla: null, firmanteId: '', today: '2026-10-28' })
    estado.items = [{ clave: '1', seccion: 'Servicios', descripcion: 'Grúa {{capacidad}}', cantidad: '2', precio: '1.500', unidad: 'JORNADA' }]
    const template = templateFromEditor(estado)
    expect(template.items).toEqual([{ seccion: 'Servicios', descripcion: 'Grúa {{capacidad}}', cantidad: 2, unidad: 'JORNADA' }])
    expect(template).not.toHaveProperty('cliente_id')
  })
})
