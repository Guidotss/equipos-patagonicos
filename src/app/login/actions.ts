'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { destinoSeguro } from '@/lib/auth/destino'
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
  if (error) return { error: 'Email o contraseña incorrectos' }

  redirect(destinoSeguro(datos.data.next))
}

export async function cerrarSesion() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
