import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { isSessionInvalid } from '@/lib/auth/errors'
import { createClient } from '@/lib/supabase/server'

export type Role = 'admin' | 'operador'

export type UserCurrent = {
  id: string
  email: string
  nombre: string
  rol: Role
}

type StatusSession =
  | { estado: 'anonimo' }
  | { estado: 'inactivo'; email: string }
  | { estado: 'activo'; user: UserCurrent }

/** Valida la sesión con getClaims (nunca getSession en el servidor) y lee el perfil. */
export const getStatusSession = cache(async (): Promise<StatusSession> => {
  const supabase = await createClient()
  const { data, error: errorSession } = await supabase.auth.getClaims()
  if (errorSession && !isSessionInvalid(errorSession)) throw errorSession
  const claims = data?.claims
  if (!claims) return { estado: 'anonimo' }

  const email = typeof claims.email === 'string' ? claims.email : ''

  // Por RLS, un usuario inactivo no puede leer ni su propio perfil (la consulta no da error,
  // devuelve null). Un error acá es una falla real y no se puede confundir con "inactivo".
  const { data: perfil, error: errorPerfil } = await supabase
    .from('profiles')
    .select('nombre, rol, activo')
    .eq('id', claims.sub)
    .maybeSingle()
  if (errorPerfil) throw errorPerfil

  if (!perfil?.activo) return { estado: 'inactivo', email }

  return {
    estado: 'activo',
    user: { id: claims.sub, email, nombre: perfil.nombre, rol: perfil.rol as Role },
  }
})

/** Para layouts y páginas protegidas: devuelve el usuario activo o redirige. */
export async function requireUser(): Promise<UserCurrent> {
  const session = await getStatusSession()
  if (session.estado === 'anonimo') redirect('/login')
  if (session.estado === 'inactivo') redirect('/sin-acceso')
  return session.user
}
