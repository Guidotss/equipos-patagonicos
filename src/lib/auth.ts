import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { esSesionInvalida } from '@/lib/auth/errores'
import { createClient } from '@/lib/supabase/server'

export type Rol = 'admin' | 'operador'

export type UsuarioActual = {
  id: string
  email: string
  nombre: string
  rol: Rol
}

type EstadoSesion =
  | { estado: 'anonimo' }
  | { estado: 'inactivo'; email: string }
  | { estado: 'activo'; usuario: UsuarioActual }

/** Valida la sesión con getClaims (nunca getSession en el servidor) y lee el perfil. */
export const getEstadoSesion = cache(async (): Promise<EstadoSesion> => {
  const supabase = await createClient()
  const { data, error: errorSesion } = await supabase.auth.getClaims()
  if (errorSesion && !esSesionInvalida(errorSesion)) throw errorSesion
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
    usuario: { id: claims.sub, email, nombre: perfil.nombre, rol: perfil.rol as Rol },
  }
})

/** Para layouts y páginas protegidas: devuelve el usuario activo o redirige. */
export async function requireUsuario(): Promise<UsuarioActual> {
  const sesion = await getEstadoSesion()
  if (sesion.estado === 'anonimo') redirect('/login')
  if (sesion.estado === 'inactivo') redirect('/sin-acceso')
  return sesion.usuario
}
