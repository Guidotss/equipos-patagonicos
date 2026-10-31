// tests/integration/catalogos.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readBlocks, readItemsTemplate } from '@/lib/templates/content'
import { variablesDesconocidas } from '@/lib/templates/variables'
import { removeUser, crearUser, sql } from './helpers'

const MARCA = `test-${crypto.randomUUID().slice(0, 8)}`
const creados: string[] = []
let admin: Awaited<ReturnType<typeof crearUser>>
let operador: Awaited<ReturnType<typeof crearUser>>
let inactivo: Awaited<ReturnType<typeof crearUser>>

beforeAll(async () => {
  admin = await crearUser({ activo: true, rol: 'admin' })
  operador = await crearUser({ activo: true, rol: 'operador' })
  inactivo = await crearUser({ activo: false })
  creados.push(admin.id, operador.id, inactivo.id)
})

afterAll(async () => {
  await sql('delete from public.firmantes where nombre like $1', [`%${MARCA}%`])
  await sql('delete from public.equipos where nombre like $1', [`%${MARCA}%`])
  await sql('delete from public.plantillas where nombre like $1', [`%${MARCA}%`])
  for (const id of creados) await removeUser(id)
})

describe('empresa_config', () => {
  it('es una fila única', async () => {
    await expect(sql(`insert into public.empresa_config (id, razon_social) values (false, 'Otra')`)).rejects.toThrow()
  })

  it('la ve un usuario activo, no uno inactivo', async () => {
    const visto = await operador.client.from('empresa_config').select('razon_social')
    expect(visto.error).toBeNull()
    expect(visto.data).toHaveLength(1)

    const hidden = await inactivo.client.from('empresa_config').select('razon_social')
    expect(hidden.data).toEqual([])
  })

  it('solo un admin la modifica', async () => {
    const [{ telefono: original }] = await sql<{ telefono: string }>('select telefono from public.empresa_config')

    const byOperador = await operador.client.from('empresa_config').update({ telefono: '1' }).eq('id', true).select()
    expect(byOperador.data ?? []).toEqual([])

    const byAdmin = await admin.client.from('empresa_config').update({ telefono: '0299 - 1234567' }).eq('id', true).select()
    expect(byAdmin.error).toBeNull()
    expect(byAdmin.data?.[0]?.telefono).toBe('0299 - 1234567')

    await sql('update public.empresa_config set telefono = $1', [original])
  })

  it('acepta un CUIT informado sin restringir contenido o longitud', async () => {
    const [{ cuit: original }] = await sql<{ cuit: string | null }>('select cuit from public.empresa_config')
    try {
      for (const cuit of ['30719529671', '1', 'identificación informada por la empresa']) {
        const { data, error } = await admin.client.from('empresa_config').update({ cuit }).eq('id', true).select('cuit').single()
        expect(error).toBeNull()
        expect(data?.cuit).toBe(cuit)
      }
    } finally {
      await sql('update public.empresa_config set cuit = $1', [original])
    }
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

    const rejected = await inactivo.client.from('firmantes').insert({ nombre: `Intruso ${MARCA}` })
    expect(rejected.error?.code).toBe('42501')
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
    const capacity = await operador.client.from('equipos').insert({ nombre: `Equipo ${MARCA} 2`, capacidad_tn: 0 })
    expect(capacity.error?.code).toBe('23514')

    const nombre = `Plantilla ${MARCA}`
    await operador.client.from('plantillas').insert({ nombre, formato: 'mensual' })
    const repetida = await operador.client.from('plantillas').insert({ nombre, formato: 'jornada' })
    expect(repetida.error?.code).toBe('23505')
  })
})

describe('datos iniciales', () => {
  it('cargan la empresa, los dos firmantes y los dos equipos', async () => {
    const [company] = await sql<{ razon_social: string; ciudad: string }>(
      'select razon_social, ciudad from public.empresa_config',
    )
    expect(company).toEqual({ razon_social: 'Equipos Patagónicos', ciudad: 'Neuquén' })

    const firmantes = await sql<{ nombre: string }>(
      `select nombre from public.firmantes where nombre in ('Julio Rojas', 'Thomas Cravero') order by nombre`,
    )
    expect(firmantes.map((f) => f.nombre)).toEqual(['Julio Rojas', 'Thomas Cravero'])

    const equipos = await sql<{ capacidad_tn: string }>(
      `select capacidad_tn from public.equipos where nombre like 'Grúa telescópica XCMG%' order by capacidad_tn`,
    )
    expect(equipos.map((e) => Number(e.capacidad_tn))).toEqual([40, 70])
  })

  it('las dos plantillas tienen contenido válido y solo usan variables conocidas', async () => {
    const plantillas = await sql<{ nombre: string; formato: string; asunto: string; intro: string; bloques: unknown; items: unknown }>(
      `select nombre, formato, asunto, intro, bloques, items from public.plantillas
       where nombre in ('Mensual - Grúa con operador', 'Por jornada - Grúa con operador') order by formato`,
    )
    expect(plantillas.map((p) => p.formato)).toEqual(['jornada', 'mensual'])

    for (const template of plantillas) {
      const bloques = readBlocks(template.bloques)
      const items = readItemsTemplate(template.items)
      const texts = [template.asunto, template.intro, ...bloques.flatMap((b) => [b.titulo, b.contenido]), ...items.map((i) => i.descripcion)]
      expect(variablesDesconocidas(texts.join('\n'))).toEqual([])
    }
  })
})
