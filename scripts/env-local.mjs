// scripts/env-local.mjs
// Genera .env.local con los datos del Supabase local (`npx supabase start` tiene que estar corriendo).
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const status = JSON.parse(
  execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
)

const primero = (...claves) => claves.map((c) => status[c]).find(Boolean)

const env = {
  NEXT_PUBLIC_SUPABASE_URL: primero('API_URL'),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: primero('PUBLISHABLE_KEY', 'ANON_KEY'),
  SUPABASE_SECRET_KEY: primero('SECRET_KEY', 'SERVICE_ROLE_KEY'),
  SUPABASE_DB_URL: primero('DB_URL'),
}

for (const [clave, valor] of Object.entries(env)) {
  if (!valor) throw new Error(`No encontré ${clave} en "supabase status"`)
}

writeFileSync(
  '.env.local',
  Object.entries(env)
    .map(([clave, valor]) => `${clave}=${valor}`)
    .join('\n') + '\n',
)
console.log('.env.local actualizado')
