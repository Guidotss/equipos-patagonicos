import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
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
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) return { estado: 'anonimo' }

  const email = typeof claims.email === 'string' ? claims.email : ''

  // Por RLS, un usuario inactivo no puede leer ni su propio perfil.
  const { data: perfil } = await supabase
    .from('profiles')
    .select('nombre, rol, activo')
    .eq('id', claims.sub)
    .maybeSingle()

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
