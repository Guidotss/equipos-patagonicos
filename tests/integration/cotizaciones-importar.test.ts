// tests/integration/cotizaciones-importar.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await borrarUsuario(activo.id)
})

async function proximoNumero() {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', {
    p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', notas: MARCA },
    p_items: [],
  })
  if (error) throw error
  const [fila] = await sql<{ numero: string }>('select numero from public.cotizaciones where id = $1', [data])
  return Number(fila.numero)
}

function importar(datos: Record<string, unknown>) {
  return activo.client.rpc('importar_cotizacion', {
    p_datos: {
      cliente_id: ids.cliente_id,
      formato: 'jornada',
      fecha: '2026-10-22',
      archivo_original_path: `importadas/${crypto.randomUUID()}.pdf`,
      notas: MARCA,
      ...datos,
    },
  })
}

describe('cargar cotizaciones existentes', () => {
  it('guarda el número original y, si supera la secuencia, la corre', async () => {
    const actual = await proximoNumero()
    const importado = actual + 50

    const { data: id, error } = await importar({ numero: importado, estado: 'aprobada', fecha_aprobacion: '2026-10-23' })
    expect(error).toBeNull()
    const [fila] = await sql<{ numero: string; origen: string; presupuesto_estado: string }>(
      'select numero, origen, presupuesto_estado from public.cotizaciones where id = $1',
      [id],
    )
    expect(fila).toEqual({ numero: String(importado), origen: 'importada', presupuesto_estado: 'en_curso' })

    expect(await proximoNumero()).toBe(importado + 1)
  })

  it('un número viejo no mueve la secuencia', async () => {
    const antes = await proximoNumero()
    const viejo = 100000 + Math.floor(Math.random() * 9000)
    await sql('delete from public.cotizaciones where numero = $1', [viejo])
    expect((await importar({ numero: viejo, estado: 'enviada' })).error).toBeNull()
    expect(await proximoNumero()).toBe(antes + 1)
  })

  it('rechaza un número repetido con un mensaje claro', async () => {
    const numero = (await proximoNumero()) + 10
    await importar({ numero, estado: 'enviada' })
    const { error } = await importar({ numero, estado: 'enviada' })
    expect(error?.message).toMatch(new RegExp(`Ya existe una cotización con el número ${numero}`))
  })

  it('exige número, archivo y estado enviada o aprobada', async () => {
    expect((await importar({ estado: 'enviada' })).error?.message).toMatch(/número/)
    expect((await importar({ numero: 1, estado: 'borrador' })).error?.message).toMatch(/enviada o aprobada/)
    expect((await importar({ numero: 2, estado: 'enviada', archivo_original_path: null })).error?.message).toMatch(/Falta el PDF/)
  })
})

describe('presupuesto directo', () => {
  it('crea una cotización ya aprobada con sus ítems, sin PDF', async () => {
    const { data: id, error } = await activo.client.rpc('presupuesto_directo', {
      p_datos: { cliente_id: ids.cliente_id, asunto: 'Izaje urgente acordado por teléfono', notas: MARCA },
      p_items: [ITEMS_JORNADA[0]],
    })
    expect(error).toBeNull()
    const [fila] = await sql<{ estado: string; origen: string; formato: string; presupuesto_estado: string; items: string }>(
      `select estado, origen, formato, presupuesto_estado,
              (select count(*) from public.cotizacion_items where cotizacion_id = $1) as items
       from public.cotizaciones where id = $1`,
      [id],
    )
    expect(fila).toEqual({ estado: 'aprobada', origen: 'directa', formato: 'jornada', presupuesto_estado: 'en_curso', items: '1' })
  })

  it('exige describir el trabajo', async () => {
    const { error } = await activo.client.rpc('presupuesto_directo', {
      p_datos: { cliente_id: ids.cliente_id, asunto: '  ', notas: MARCA },
      p_items: [],
    })
    expect(error?.message).toMatch(/Describí el trabajo/)
  })
})
