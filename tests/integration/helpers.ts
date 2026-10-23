// tests/integration/helpers.ts
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import type { Database } from '@/lib/supabase/database.types'

const opcionesSinSesion = { auth: { persistSession: false, autoRefreshToken: false } }

function url(): string {
  const valor = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!valor) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL')
  return valor
}

/** Cliente con la secret key: saltea RLS. Solo para preparar datos en los tests. */
export function adminClient() {
  return createClient<Database>(url(), process.env.SUPABASE_SECRET_KEY!, opcionesSinSesion)
}

/** Cliente con la publishable key, sin sesión (rol anon). */
export function anonClient() {
  return createClient<Database>(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, opcionesSinSesion)
}

export const PASSWORD_DE_PRUEBA = 'Prueba-1234-segura'

/** Crea un usuario de Auth, le fija activo/rol y devuelve un cliente con su sesión iniciada. */
export async function crearUsuario(opciones: { activo: boolean; rol?: 'admin' | 'operador' }) {
  const admin = adminClient()
  const email = `test-${crypto.randomUUID()}@equipos.test`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD_DE_PRUEBA,
    email_confirm: true,
    user_metadata: { nombre: 'Usuario de prueba' },
  })
  if (error) throw error

  const { error: errorPerfil } = await admin
    .from('profiles')
    .update({ activo: opciones.activo, rol: opciones.rol ?? 'admin' })
    .eq('id', data.user.id)
  if (errorPerfil) throw errorPerfil

  const client = anonClient()
  const { error: errorLogin } = await client.auth.signInWithPassword({ email, password: PASSWORD_DE_PRUEBA })
  if (errorLogin) throw errorLogin

  return { id: data.user.id, email, client }
}

export async function borrarUsuario(id: string) {
  const { error } = await adminClient().auth.admin.deleteUser(id)
  if (error) throw error
}

/** Ejecuta SQL directo contra la base local (como postgres). */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  consulta: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await client.connect()
  try {
    const resultado = await client.query<T>(consulta, parametros)
    return resultado.rows
  } finally {
    await client.end()
  }
}
