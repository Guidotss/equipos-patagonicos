'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { destinationSeguro } from '@/lib/auth/destination'
import { messageErrorLogin } from '@/lib/auth/errors'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  email: z.email('Ingresá un email válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
  next: z.string().optional(),
})

export type StatusLogin = { error: string | null }

export async function iniciarSession(_previous: StatusLogin, formData: FormData): Promise<StatusLogin> {
  const datos = schema.safeParse({
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
  if (error) return { error: messageErrorLogin(error) }

  redirect(destinationSeguro(datos.data.next))
}

export async function cerrarSession() {
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
