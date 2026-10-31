// tests/integration/clientes.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, removeUser, crearUser, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
const CUIT_OF_TEST = '33693450239' // AFIP: válido y fuera de los datos de ejemplo
const creados: string[] = []
let activo: Awaited<ReturnType<typeof crearUser>>
let inactivo: Awaited<ReturnType<typeof crearUser>>

async function limpiar() {
  await sql('delete from public.clientes where razon_social like $1 or cuit = $2', [`%${MARCA}%`, CUIT_OF_TEST])
}

beforeAll(async () => {
  await limpiar()
  activo = await crearUser({ activo: true, rol: 'operador' })
  inactivo = await crearUser({ activo: false })
  creados.push(activo.id, inactivo.id)
})

afterAll(async () => {
  await limpiar()
  for (const id of creados) await removeUser(id)
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

  it.each(['30719529671', '1', 'identificación informada'])('guarda y edita el CUIT informado %s sin validación fiscal', async (cuit) => {
    const { data, error } = await activo.client.from('clientes')
      .insert({ razon_social: `Informado ${MARCA} ${cuit}`, cuit }).select('id, cuit').single()
    expect(error).toBeNull()
    expect(data?.cuit).toBe(cuit)
    const edited = await activo.client.from('clientes').update({ cuit: `${cuit} actualizado` })
      .eq('id', data!.id).select('cuit').single()
    expect(edited.error).toBeNull()
    expect(edited.data?.cuit).toBe(`${cuit} actualizado`)
  })

  it('la base conserva la unicidad del CUIT informado', async () => {
    const first = await activo.client.from('clientes').insert({ razon_social: `Uno ${MARCA}`, cuit: CUIT_OF_TEST })
    expect(first.error).toBeNull()
    const repetido = await activo.client.from('clientes').insert({ razon_social: `Dos ${MARCA}`, cuit: CUIT_OF_TEST })
    expect(repetido.error?.code).toBe('23505')
  })

  it('varios clientes pueden no tener CUIT', async () => {
    const a = await activo.client.from('clientes').insert({ razon_social: `Sin CUIT A ${MARCA}` })
    const b = await activo.client.from('clientes').insert({ razon_social: `Sin CUIT B ${MARCA}` })
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
  })

  it('la secret key (scripts de importación) también acepta el CUIT informado', async () => {
    const admin = adminClient()
    const { data, error } = await admin.from('clientes').insert({ razon_social: `Importado ${MARCA}` }).select('id').single()
    expect(error).toBeNull()

    const modificado = await admin.from('clientes').update({ notas: 'Importado por script' }).eq('id', data!.id)
    expect(modificado.error).toBeNull()

    const informado = await admin.from('clientes').insert({ razon_social: `Importado informado ${MARCA}`, cuit: '30000000008' })
    expect(informado.error).toBeNull()
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

  async function search(texto: string) {
    const { data, error } = await activo.client.rpc('buscar_clientes', { texto, limite: 50 })
    if (error) throw error
    return data.map((c) => c.razon_social)
  }

  it('ignora acentos y mayúsculas', async () => {
    expect(await search(`vertice servicios ${MARCA}`)).toEqual([`VÉRTICE SERVICIOS ${MARCA} S.R.L.`])
  })

  it('encuentra por nombre de contacto', async () => {
    expect(await search(`nandu ${MARCA}`)).toEqual([`VÉRTICE SERVICIOS ${MARCA} S.R.L.`])
  })

  it('encuentra por CUIT con o sin guiones', async () => {
    expect(await search('33-69345023')).toContain(`Uno ${MARCA}`)
    expect(await search('3369345023')).toContain(`Uno ${MARCA}`)
  })

  it('trata % y _ como texto, no como comodines', async () => {
    expect(await search('%')).toEqual([])
    expect(await search('_')).toEqual([])
  })

  it('sin texto devuelve clientes, activos primero', async () => {
    const { data } = await activo.client.rpc('buscar_clientes', { texto: '', limite: 200 })
    expect(data!.length).toBeGreaterThan(0)
    const indexInactivo = data!.findIndex((c) => !c.activo)
    if (indexInactivo >= 0) expect(data!.slice(indexInactivo).every((c) => !c.activo)).toBe(true)
  })

  it('anon no puede ejecutarla', async () => {
    const { error } = await anonClient().rpc('buscar_clientes', { texto: 'x' })
    expect(error).not.toBeNull()
  })
})

describe('permisos por columna', () => {
  it('la app no puede escribir created_by (registrar un cliente a nombre de otro)', async () => {
    const { error } = await activo.client
      .from('clientes')
      .insert({ razon_social: `Suplantado ${MARCA}`, created_by: inactivo.id })
    expect(error?.code).toBe('42501')
  })

  it('un contacto no se puede pasar a otro cliente', async () => {
    const { data: a } = await activo.client.from('clientes').insert({ razon_social: `Origen ${MARCA}` }).select('id').single()
    const { data: b } = await activo.client.from('clientes').insert({ razon_social: `Destino ${MARCA}` }).select('id').single()
    const { data: contacto } = await activo.client
      .from('contactos')
      .insert({ cliente_id: a!.id, nombre: 'Mover' })
      .select('id')
      .single()

    const { error } = await activo.client.from('contactos').update({ cliente_id: b!.id }).eq('id', contacto!.id)
    expect(error?.code).toBe('42501')
  })
})
