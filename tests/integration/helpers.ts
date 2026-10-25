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

/** Abre una conexión directa a la base local (como postgres) y la cierra al terminar. */
export async function conConexion<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** Ejecuta SQL directo contra la base local (como postgres). */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  consulta: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  return conConexion(async (client) => (await client.query<T>(consulta, parametros)).rows)
}

/**
 * Espera a que alguna conexión quede bloqueada por la transacción del backend `pid` y devuelve true.
 * Devuelve false sin esperar más en cuanto `seguir()` da false (por ejemplo, porque la llamada ya terminó).
 */
async function esperarBloqueadaPor(pid: number, seguir: () => boolean = () => true): Promise<boolean> {
  for (let intento = 0; intento < 100; intento++) {
    if (!seguir()) return false
    const [fila] = await sql<{ esperando: number }>(
      'select count(*)::int as esperando from pg_stat_activity where $1 = any(pg_blocking_pids(pid))',
      [pid],
    )
    if (fila.esperando > 0) return true
    await new Promise((resolver) => setTimeout(resolver, 50))
  }
  throw new Error('La llamada nunca quedó esperando a la otra transacción')
}

/**
 * Corre `llamada` mientras otra transacción (con la sesión de `usuarioId`) ejecutó `consulta` sin confirmar
 * y la confirma recién cuando la llamada ya está esperando.
 *
 * Si la llamada termina (bien o mal) antes de quedar esperando, falla en el acto con lo que pasó en la llamada.
 * Su resultado siempre queda manejado, aunque termine después de que el helper falló.
 */
export async function contraTransaccionEnCurso<T>(
  usuarioId: string,
  consulta: string,
  parametros: unknown[],
  llamada: () => PromiseLike<T>,
): Promise<T> {
  return conConexion(async (otra) => {
    await otra.query('begin')
    await otra.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: usuarioId, role: 'authenticated' }),
    ])
    await otra.query('set local role authenticated')
    await otra.query(consulta, parametros)
    const [{ pid }] = (await otra.query<{ pid: number }>('select pg_backend_pid() as pid')).rows

    let fin: { ok: true; valor: T } | { ok: false; error: unknown } | undefined
    const resultado = new Promise<T>((resolver) => resolver(llamada()))
    resultado.then(
      (valor) => (fin = { ok: true, valor }),
      (error: unknown) => (fin = { ok: false, error }),
    )

    if (!(await esperarBloqueadaPor(pid, () => fin === undefined))) {
      if (!fin!.ok) throw fin!.error
      const error = (fin!.valor as { error?: { code?: string; message?: string } | null } | null)?.error
      throw new Error(
        'La llamada terminó sin esperar a la otra transacción: ' + (error ? `${error.code}: ${error.message}` : '(sin error)'),
      )
    }
    await otra.query('commit')
    return resultado
  })
}
