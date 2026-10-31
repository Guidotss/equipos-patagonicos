// tests/integration/base.test.ts
import { afterAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, removeUser, crearUser, sql } from './helpers'

const creados: string[] = []

afterAll(async () => {
  for (const id of creados) await removeUser(id)
})

describe('base de seguridad', () => {
  it('todas las tablas de public tienen RLS activado', async () => {
    const rows = await sql<{ relname: string }>(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    `)
    expect(rows.map((f) => f.relname)).toEqual([])
  })

  it('anon no tiene privilegios sobre tablas de public', async () => {
    const rows = await sql(`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
    `)
    expect(rows).toEqual([])
  })

  it('el registro público está deshabilitado', async () => {
    const { error } = await anonClient().auth.signUp({
      email: `intruso-${crypto.randomUUID()}@equipos.test`,
      password: 'Intruso-1234-segura',
    })
    expect(error).not.toBeNull()
  })

  it('un usuario nuevo nace inactivo y con el nombre de los metadatos', async () => {
    const { data, error } = await adminClient().auth.admin.createUser({
      email: `nuevo-${crypto.randomUUID()}@equipos.test`,
      password: 'Nuevo-1234-segura',
      email_confirm: true,
      user_metadata: { nombre: 'Thomas Cravero' },
    })
    if (error) throw error
    creados.push(data.user.id)

    const [perfil] = await sql<{ nombre: string; activo: boolean; rol: string }>(
      'select nombre, activo, rol from public.profiles where id = $1',
      [data.user.id],
    )
    expect(perfil).toEqual({ nombre: 'Thomas Cravero', activo: false, rol: 'operador' })
  })

  it('anon no puede leer perfiles', async () => {
    const { error } = await anonClient().from('profiles').select('id')
    expect(error).not.toBeNull()
  })

  it('un usuario inactivo no ve ningún perfil, ni el propio', async () => {
    const user = await crearUser({ activo: false })
    creados.push(user.id)

    const { data, error } = await user.client.from('profiles').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('un usuario activo ve los perfiles', async () => {
    const user = await crearUser({ activo: true })
    creados.push(user.id)

    const { data, error } = await user.client.from('profiles').select('id')
    expect(error).toBeNull()
    expect(data?.map((p) => p.id)).toContain(user.id)
  })

  it('un operador no puede ascenderse a admin', async () => {
    const user = await crearUser({ activo: true, rol: 'operador' })
    creados.push(user.id)

    const { data } = await user.client.from('profiles').update({ rol: 'admin' }).eq('id', user.id).select()
    expect(data ?? []).toEqual([])

    const [perfil] = await sql<{ rol: string }>('select rol from public.profiles where id = $1', [user.id])
    expect(perfil.rol).toBe('operador')
  })

  it('un admin puede activar a otro usuario', async () => {
    const admin = await crearUser({ activo: true, rol: 'admin' })
    const otro = await crearUser({ activo: false })
    creados.push(admin.id, otro.id)

    const { error } = await admin.client.from('profiles').update({ activo: true }).eq('id', otro.id)
    expect(error).toBeNull()

    const [perfil] = await sql<{ activo: boolean }>('select activo from public.profiles where id = $1', [otro.id])
    expect(perfil.activo).toBe(true)
  })
})
