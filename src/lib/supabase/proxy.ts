import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { esSesionInvalida } from '@/lib/auth/errores'
import { publicEnv } from '@/lib/env'

const RUTAS_PUBLICAS = ['/login']

function esPublica(pathname: string) {
  return RUTAS_PUBLICAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))
}

/** Redirige conservando las cookies de sesión que haya escrito Supabase. */
function redirigir(destino: URL, conCookiesDe: NextResponse) {
  const respuesta = NextResponse.redirect(destino)
  for (const cookie of conCookiesDe.cookies.getAll()) respuesta.cookies.set(cookie)
  return respuesta
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers?: Record<string, string>) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
          for (const [clave, valor] of Object.entries(headers ?? {})) response.headers.set(clave, valor)
        },
      },
    },
  )

  // No poner código entre createServerClient y getClaims: esta llamada refresca la sesión.
  const { data, error } = await supabase.auth.getClaims()
  // Si Auth no respondió no sabemos si hay sesión: se deja pasar. El layout vuelve a validar y,
  // si Auth sigue caído, se ve src/app/error.tsx con "Reintentar". Mandar al login no ayudaría:
  // tampoco se podría entrar.
  if (error && !esSesionInvalida(error)) return response
  const autenticado = Boolean(data?.claims)
  const { pathname, search } = request.nextUrl

  if (!autenticado && !esPublica(pathname)) {
    const destino = request.nextUrl.clone()
    destino.pathname = '/login'
    destino.search = ''
    if (pathname !== '/') destino.searchParams.set('next', `${pathname}${search}`)
    return redirigir(destino, response)
  }

  if (autenticado && pathname === '/login') {
    const destino = request.nextUrl.clone()
    destino.pathname = '/'
    destino.search = ''
    return redirigir(destino, response)
  }

  return response
}
