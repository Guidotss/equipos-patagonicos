import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSessionInvalid } from '@/lib/auth/errors'
import { publicEnv } from '@/lib/env'

const PATHS_PUBLICAS = ['/login']

function isPublic(pathname: string) {
  return PATHS_PUBLICAS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

/** Redirige conservando las cookies de sesión que haya escrito Supabase. */
function redirigir(destination: URL, withCookiesOf: NextResponse) {
  const response = NextResponse.redirect(destination)
  for (const cookie of withCookiesOf.cookies.getAll()) response.cookies.set(cookie)
  return response
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
          for (const [clave, value] of Object.entries(headers ?? {})) response.headers.set(clave, value)
        },
      },
    },
  )

  // No poner código entre createServerClient y getClaims: esta llamada refresca la sesión.
  const { data, error } = await supabase.auth.getClaims()
  // Si Auth no respondió no sabemos si hay sesión: se deja pasar. El layout vuelve a validar y,
  // si Auth sigue caído, se ve src/app/error.tsx con "Reintentar". Mandar al login no ayudaría:
  // tampoco se podría entrar.
  if (error && !isSessionInvalid(error)) return response
  const autenticado = Boolean(data?.claims)
  const { pathname, search } = request.nextUrl

  if (!autenticado && !isPublic(pathname)) {
    const destination = request.nextUrl.clone()
    destination.pathname = '/login'
    destination.search = ''
    if (pathname !== '/') destination.searchParams.set('next', `${pathname}${search}`)
    return redirigir(destination, response)
  }

  if (autenticado && pathname === '/login') {
    const destination = request.nextUrl.clone()
    destination.pathname = '/'
    destination.search = ''
    return redirigir(destination, response)
  }

  return response
}
