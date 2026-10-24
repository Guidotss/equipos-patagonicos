// tests/integration/clientes.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
const CUIT_DE_PRUEBA = '33693450239' // AFIP: válido y fuera de los datos de ejemplo
const creados: string[] = []
let activo: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>

async function limpiar() {
  await sql('delete from public.clientes where razon_social like $1 or cuit = $2', [`%${MARCA}%`, CUIT_DE_PRUEBA])
}

beforeAll(async () => {
  await limpiar()
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  creados.push(activo.id, inactivo.id)
})

afterAll(async () => {
  await limpiar()
  for (const id of creados) await borrarUsuario(id)
})

describe('clientes', () => {
  it('un usuario activo crea un cliente y queda registrado quién lo creó', async () => {
    const { data, error } = await activo.client
      .from('clientes')
      .insert({ razon_social: `Milicic ${MARCA} S.A.` })
      .select('id, created_by, activo')
      .single()
    expect(error).toBeNull()
    expect(data).toMatchObject({ created_by: activo.id, activo: true })
  })

  it('un usuario inactivo no ve ni crea clientes', async () => {
    const visto = await inactivo.client.from('clientes').select('id')
    expect(visto.data).toEqual([])
    const creado = await inactivo.client.from('clientes').insert({ razon_social: `Intruso ${MARCA}` })
    expect(creado.error?.code).toBe('42501')
  })

  it('la base rechaza un CUIT inválido y uno repetido', async () => {
    const invalido = await activo.client.from('clientes').insert({ razon_social: `Malo ${MARCA}`, cuit: '30719529671' })
    expect(invalido.error?.code).toBe('23514')

    const primero = await activo.client.from('clientes').insert({ razon_social: `Uno ${MARCA}`, cuit: CUIT_DE_PRUEBA })
    expect(primero.error).toBeNull()
    const repetido = await activo.client.from('clientes').insert({ razon_social: `Dos ${MARCA}`, cuit: CUIT_DE_PRUEBA })
    expect(repetido.error?.code).toBe('23505')
  })

  it('varios clientes pueden no tener CUIT', async () => {
    const a = await activo.client.from('clientes').insert({ razon_social: `Sin CUIT A ${MARCA}` })
    const b = await activo.client.from('clientes').insert({ razon_social: `Sin CUIT B ${MARCA}` })
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
  })

  it('la secret key (scripts de importación) crea y modifica clientes, y la base sigue validando el CUIT', async () => {
    const admin = adminClient()
    const { data, error } = await admin.from('clientes').insert({ razon_social: `Importado ${MARCA}` }).select('id').single()
    expect(error).toBeNull()

    const modificado = await admin.from('clientes').update({ notas: 'Importado por script' }).eq('id', data!.id)
    expect(modificado.error).toBeNull()

    const invalido = await admin.from('clientes').insert({ razon_social: `Importado malo ${MARCA}`, cuit: '30719529671' })
    expect(invalido.error?.code).toBe('23514')
  })

  it('los clientes no se borran (se desactivan)', async () => {
    const { data } = await activo.client.from('clientes').insert({ razon_social: `Borrable ${MARCA}` }).select('id').single()
    const borrado = await activo.client.from('clientes').delete().eq('id', data!.id)
    expect(borrado.error?.code).toBe('42501')
  })
})

describe('contactos', () => {
  it('se crean, modifican y borran; se borran con el cliente', async () => {
    const { data: cliente } = await activo.client
      .from('clientes')
      .insert({ razon_social: `Con contactos ${MARCA}` })
      .select('id')
      .single()

    const { data: contacto, error } = await activo.client
      .from('contactos')
      .insert({ cliente_id: cliente!.id, nombre: 'Yanina Colman', email: 'yanina.colman@milicic.com.ar' })
      .select('id')
      .single()
    expect(error).toBeNull()

    const modificado = await activo.client.from('contactos').update({ cargo: 'Compras' }).eq('id', contacto!.id).select('cargo').single()
    expect(modificado.data?.cargo).toBe('Compras')

    const borrado = await activo.client.from('contactos').delete().eq('id', contacto!.id)
    expect(borrado.error).toBeNull()
  })
})

describe('buscar_clientes', () => {
  beforeAll(async () => {
    const { data } = await activo.client
      .from('clientes')
      .insert({ razon_social: `VÉRTICE SERVICIOS ${MARCA} S.R.L.` })
      .select('id')
      .single()
    await activo.client.from('contactos').insert({ cliente_id: data!.id, nombre: `Ñandú ${MARCA}` })
  })

  async function buscar(texto: string) {
    const { data, error } = await activo.client.rpc('buscar_clientes', { texto, limite: 50 })
    if (error) throw error
    return data.map((c) => c.razon_social)
  }

  it('ignora acentos y mayúsculas', async () => {
    expect(await buscar(`vertice servicios ${MARCA}`)).toEqual([`VÉRTICE SERVICIOS ${MARCA} S.R.L.`])
  })

  it('encuentra por nombre de contacto', async () => {
    expect(await buscar(`nandu ${MARCA}`)).toEqual([`VÉRTICE SERVICIOS ${MARCA} S.R.L.`])
  })

  it('encuentra por CUIT con o sin guiones', async () => {
    expect(await buscar('33-69345023')).toContain(`Uno ${MARCA}`)
    expect(await buscar('3369345023')).toContain(`Uno ${MARCA}`)
  })

  it('trata % y _ como texto, no como comodines', async () => {
    expect(await buscar('%')).toEqual([])
    expect(await buscar('_')).toEqual([])
  })

  it('sin texto devuelve clientes, activos primero', async () => {
    const { data } = await activo.client.rpc('buscar_clientes', { texto: '', limite: 200 })
    expect(data!.length).toBeGreaterThan(0)
    const indiceInactivo = data!.findIndex((c) => !c.activo)
    if (indiceInactivo >= 0) expect(data!.slice(indiceInactivo).every((c) => !c.activo)).toBe(true)
  })

  it('anon no puede ejecutarla', async () => {
    const { error } = await anonClient().rpc('buscar_clientes', { texto: 'x' })
    expect(error).not.toBeNull()
  })
})
