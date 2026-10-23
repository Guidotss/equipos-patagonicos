// scripts/crear-usuario.mjs
// Crea un usuario activo. Uso:
//   npm run usuario:crear -- --email guido@ejemplo.com --password 'xxxx' --nombre 'Guido Olguín' [--rol admin|operador]
// Para producción: node --env-file=.env.production.local scripts/crear-usuario.mjs ...
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    nombre: { type: 'string' },
    rol: { type: 'string', default: 'admin' },
  },
})

const { email, password, nombre, rol } = values
if (!email || !password || !nombre) {
  console.error('Faltan datos: --email, --password y --nombre son obligatorios')
  process.exit(1)
}
if (!['admin', 'operador'].includes(rol)) {
  console.error('--rol tiene que ser admin u operador')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
if (!url || !secretKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno')
  process.exit(1)
}

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { nombre },
})
if (error) {
  console.error(`No se pudo crear el usuario: ${error.message}`)
  process.exit(1)
}

const { error: errorPerfil } = await admin.from('profiles').update({ activo: true, rol }).eq('id', data.user.id)
if (errorPerfil) {
  console.error(`Usuario creado pero no se pudo activar: ${errorPerfil.message}`)
  process.exit(1)
}

console.log(`Usuario ${email} creado y activo con rol ${rol}`)
