// tests/integration/catalogos.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `test-${crypto.randomUUID().slice(0, 8)}`
const creados: string[] = []
let admin: Awaited<ReturnType<typeof crearUsuario>>
let operador: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>

beforeAll(async () => {
  admin = await crearUsuario({ activo: true, rol: 'admin' })
  operador = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  creados.push(admin.id, operador.id, inactivo.id)
})

afterAll(async () => {
  await sql('delete from public.firmantes where nombre like $1', [`%${MARCA}%`])
  await sql('delete from public.equipos where nombre like $1', [`%${MARCA}%`])
  await sql('delete from public.plantillas where nombre like $1', [`%${MARCA}%`])
  for (const id of creados) await borrarUsuario(id)
})

describe('empresa_config', () => {
  it('es una fila única', async () => {
    await expect(sql(`insert into public.empresa_config (id, razon_social) values (false, 'Otra')`)).rejects.toThrow()
  })

  it('la ve un usuario activo, no uno inactivo', async () => {
    const visto = await operador.client.from('empresa_config').select('razon_social')
    expect(visto.error).toBeNull()
    expect(visto.data).toHaveLength(1)

    const oculto = await inactivo.client.from('empresa_config').select('razon_social')
    expect(oculto.data).toEqual([])
  })

  it('solo un admin la modifica', async () => {
    const [{ telefono: original }] = await sql<{ telefono: string }>('select telefono from public.empresa_config')

    const porOperador = await operador.client.from('empresa_config').update({ telefono: '1' }).eq('id', true).select()
    expect(porOperador.data ?? []).toEqual([])

    const porAdmin = await admin.client.from('empresa_config').update({ telefono: '0299 - 1234567' }).eq('id', true).select()
    expect(porAdmin.error).toBeNull()
    expect(porAdmin.data?.[0]?.telefono).toBe('0299 - 1234567')

    await sql('update public.empresa_config set telefono = $1', [original])
  })
})

describe('firmantes, equipos y plantillas', () => {
  it('un usuario activo crea y modifica; uno inactivo no', async () => {
    const creado = await operador.client
      .from('firmantes')
      .insert({ nombre: `Firmante ${MARCA}`, cargo: 'Logística' })
      .select('id')
      .single()
    expect(creado.error).toBeNull()

    const modificado = await operador.client
      .from('firmantes')
      .update({ activo: false })
      .eq('id', creado.data!.id)
      .select('activo')
      .single()
    expect(modificado.data?.activo).toBe(false)

    const rechazado = await inactivo.client.from('firmantes').insert({ nombre: `Intruso ${MARCA}` })
    expect(rechazado.error?.code).toBe('42501')
  })

  it('nadie puede borrar (se desactivan)', async () => {
    const { data } = await operador.client
      .from('equipos')
      .insert({ nombre: `Equipo ${MARCA}`, capacidad_tn: 40 })
      .select('id')
      .single()
    const borrado = await admin.client.from('equipos').delete().eq('id', data!.id)
    expect(borrado.error?.code).toBe('42501')
  })

  it('valida capacidad positiva y nombre de plantilla único', async () => {
    const capacidad = await operador.client.from('equipos').insert({ nombre: `Equipo ${MARCA} 2`, capacidad_tn: 0 })
    expect(capacidad.error?.code).toBe('23514')

    const nombre = `Plantilla ${MARCA}`
    await operador.client.from('plantillas').insert({ nombre, formato: 'mensual' })
    const repetida = await operador.client.from('plantillas').insert({ nombre, formato: 'jornada' })
    expect(repetida.error?.code).toBe('23505')
  })
})
