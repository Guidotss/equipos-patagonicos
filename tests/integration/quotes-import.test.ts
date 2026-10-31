// tests/integration/cotizaciones-importar.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ITEMS_DAILY, idsOfExample } from './quotes-helpers'
import { adminClient, removeUser, crearUser, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUser>>
let ids: Awaited<ReturnType<typeof idsOfExample>>
const path = `importadas/${crypto.randomUUID()}.pdf`

beforeAll(async () => {
  activo = await crearUser({ activo: true, rol: 'operador' })
  ids = await idsOfExample()
  const { error } = await activo.client.storage.from('documentos').upload(path, new Blob(['%PDF-1.4 prueba'], { type: 'application/pdf' }), { contentType: 'application/pdf' })
  if (error) throw error
})

afterAll(async () => {
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await adminClient().storage.from('documentos').remove([path])
  await removeUser(activo.id)
})

async function nextNumber() {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', {
    p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', notas: MARCA },
    p_items: [],
  })
  if (error) throw error
  const [row] = await sql<{ numero: string }>('select numero from public.cotizaciones where id = $1', [data])
  return Number(row.numero)
}

function importar(datos: Record<string, unknown>) {
  return activo.client.rpc('importar_cotizacion', {
    p_datos: {
      cliente_id: ids.cliente_id,
      formato: 'jornada',
      fecha: '2026-10-22',
      archivo_original_path: path,
      notas: MARCA,
      ...datos,
    },
  })
}

describe('cargar cotizaciones existentes', () => {
  it('guarda el número original y, si supera la secuencia, la corre', async () => {
    const actual = await nextNumber()
    const importado = actual + 50

    const { data: id, error } = await importar({ numero: importado, estado: 'aprobada', fecha_aprobacion: '2026-10-23' })
    expect(error).toBeNull()
    const [row] = await sql<{ numero: string; origen: string; presupuesto_estado: string }>(
      'select numero, origen, presupuesto_estado from public.cotizaciones where id = $1',
      [id],
    )
    expect(row).toEqual({ numero: String(importado), origen: 'importada', presupuesto_estado: 'en_curso' })

    expect(await nextNumber()).toBe(importado + 1)
  })

  it('un número viejo no mueve la secuencia', async () => {
    const antes = await nextNumber()
    const viejo = 100000 + Math.floor(Math.random() * 9000)
    await sql('delete from public.cotizaciones where numero = $1', [viejo])
    expect((await importar({ numero: viejo, estado: 'enviada' })).error).toBeNull()
    expect(await nextNumber()).toBe(antes + 1)
  })

  it('rechaza un número repetido con un mensaje claro', async () => {
    const numero = (await nextNumber()) + 10
    await importar({ numero, estado: 'enviada' })
    const { error } = await importar({ numero, estado: 'enviada' })
    expect(error?.message).toMatch(new RegExp(`Ya existe una cotización con el número ${numero}`))
  })

  it('rechaza un número muy por encima del próximo sin correr la secuencia', async () => {
    const antes = await nextNumber()
    const errado = antes * 10
    const { error } = await importar({ numero: errado, estado: 'enviada' })
    expect(error?.message).toMatch(new RegExp(`El número ${errado} está muy por encima del próximo \\(${antes + 1}\\)`))
    expect(await nextNumber()).toBe(antes + 1)
  })

  it('rechaza una fecha de aprobación anterior a la cotización', async () => {
    const { error } = await importar({ numero: 3, estado: 'aprobada', fecha_aprobacion: '2026-01-01' })
    expect(error?.message).toMatch(/La fecha de aprobación no puede ser anterior a la cotización/)
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
      p_items: [ITEMS_DAILY[0]],
    })
    expect(error).toBeNull()
    const [row] = await sql<{ estado: string; origen: string; formato: string; presupuesto_estado: string; items: string }>(
      `select estado, origen, formato, presupuesto_estado,
              (select count(*) from public.cotizacion_items where cotizacion_id = $1) as items
       from public.cotizaciones where id = $1`,
      [id],
    )
    expect(row).toEqual({ estado: 'aprobada', origen: 'directa', formato: 'jornada', presupuesto_estado: 'en_curso', items: '1' })
  })

  it('rechaza una fecha de aprobación anterior a la cotización', async () => {
    const { error } = await activo.client.rpc('presupuesto_directo', {
      p_datos: { cliente_id: ids.cliente_id, asunto: 'Izaje acordado', fecha_aprobacion: '2025-01-01', notas: MARCA },
      p_items: [],
    })
    expect(error?.message).toMatch(/La fecha de aprobación no puede ser anterior a la cotización/)
  })

  it('exige describir el trabajo', async () => {
    const { error } = await activo.client.rpc('presupuesto_directo', {
      p_datos: { cliente_id: ids.cliente_id, asunto: '  ', notas: MARCA },
      p_items: [],
    })
    expect(error?.message).toMatch(/Describí el trabajo/)
  })
})
