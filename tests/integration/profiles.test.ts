// tests/integration/profiles.test.ts
import { afterAll, describe, expect, it } from 'vitest'
import { adminClient, removeUser, withConexion, crearUser, sql } from './helpers'

const creados: string[] = []

afterAll(async () => {
  for (const id of creados) await removeUser(id)
})

describe('perfiles', () => {
  it('un admin no puede tocar columnas que no sean nombre, rol o activo', async () => {
    const admin = await crearUser({ activo: true, rol: 'admin' })
    creados.push(admin.id)

    const { error } = await admin.client
      .from('profiles')
      .update({ created_at: '2000-01-01T00:00:00Z' })
      .eq('id', admin.id)
    expect(error?.code).toBe('42501')
  })

  it('un admin no puede desactivarse ni quitarse el rol a sí mismo', async () => {
    const admin = await crearUser({ activo: true, rol: 'admin' })
    creados.push(admin.id)

    const desactivar = await admin.client.from('profiles').update({ activo: false }).eq('id', admin.id)
    expect(desactivar.error?.message).toMatch(/No podés desactivarte/)

    const degradar = await admin.client.from('profiles').update({ rol: 'operador' }).eq('id', admin.id)
    expect(degradar.error?.message).toMatch(/No podés desactivarte/)

    const [perfil] = await sql<{ activo: boolean; rol: string }>(
      'select activo, rol from public.profiles where id = $1',
      [admin.id],
    )
    expect(perfil).toEqual({ activo: true, rol: 'admin' })
  })

  it('un admin sí puede cambiar su propio nombre', async () => {
    const admin = await crearUser({ activo: true, rol: 'admin' })
    creados.push(admin.id)

    const { error } = await admin.client.from('profiles').update({ nombre: 'Nombre nuevo' }).eq('id', admin.id)
    expect(error).toBeNull()
  })

  it('un usuario creado sin email ni nombre igual tiene nombre', async () => {
    const { data, error } = await adminClient().auth.admin.createUser({
      phone: `+54911${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      phone_confirm: true,
    })
    if (error) throw error
    creados.push(data.user.id)

    const [perfil] = await sql<{ nombre: string }>('select nombre from public.profiles where id = $1', [data.user.id])
    expect(perfil.nombre).toBe('Usuario sin nombre')
  })

  it('una función nueva en public o private no la ejecutan anon ni authenticated sin GRANT', async () => {
    const permisos = await withConexion(async (client) => {
      await client.query('begin')
      try {
        await client.query(`create function public.tmp_regresion() returns int language sql as 'select 1'`)
        await client.query(`create function private.tmp_regresion() returns int language sql as 'select 1'`)
        const { rows } = await client.query<{ rol: string; schema: string; can: boolean }>(`
          select r.rol, e.esquema, has_function_privilege(r.rol, e.esquema || '.tmp_regresion()', 'execute') as puede
          from (values ('anon'), ('authenticated')) as r(rol)
          cross join (values ('public'), ('private')) as e(esquema)
        `)
        return rows
      } finally {
        await client.query('rollback')
      }
    })
    expect(permisos.filter((p) => p.can)).toEqual([])
  })
})
