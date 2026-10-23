import { createClient } from '@supabase/supabase-js'
import { E2E_EMAIL, E2E_NOMBRE, E2E_PASSWORD } from './credenciales'

/** Deja un usuario admin activo con contraseña conocida (idempotente). */
export default async function globalSetup() {
  process.loadEnvFile('.env.local')
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: lista, error: errorLista } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (errorLista) throw errorLista

  let id = lista.users.find((u) => u.email === E2E_EMAIL)?.id
  if (id) {
    const { error } = await admin.auth.admin.updateUserById(id, { password: E2E_PASSWORD })
    if (error) throw error
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { nombre: E2E_NOMBRE },
    })
    if (error) throw error
    id = data.user.id
  }

  const { error } = await admin.from('profiles').update({ activo: true, rol: 'admin', nombre: E2E_NOMBRE }).eq('id', id)
  if (error) throw error
}
