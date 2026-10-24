'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { destinoSeguro } from '@/lib/auth/destino'
import { mensajeErrorLogin } from '@/lib/auth/errores'
import { createClient } from '@/lib/supabase/server'

const esquema = z.object({
  email: z.email('Ingresá un email válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
  next: z.string().optional(),
})

export type EstadoLogin = { error: string | null }

export async function iniciarSesion(_previo: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const datos = esquema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  })
  if (!datos.success) return { error: datos.error.issues[0]?.message ?? 'Revisá los datos' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: datos.data.email,
    password: datos.data.password,
  })
  if (error) return { error: mensajeErrorLogin(error) }

  redirect(destinoSeguro(datos.data.next))
}

export async function cerrarSesion() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) {
    // Auth no respondió: igual se borran las cookies de sesión de este navegador,
    // para que en una PC compartida el próximo usuario no entre con esta cuenta.
    const cookieStore = await cookies()
    for (const cookie of cookieStore.getAll()) {
      if (cookie.name.startsWith('sb-')) cookieStore.delete(cookie.name)
    }
  }
  redirect('/login')
}
