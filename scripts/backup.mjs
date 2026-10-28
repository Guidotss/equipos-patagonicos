import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { baseDestino, ejecutar, entorno, hash, storageAdmin, verificar } from './respaldo-comun.mjs'

entorno()
const directorio = process.argv[2]
if (!directorio) throw new Error('Uso: npm run db:backup -- /ruta/nueva/del/respaldo')
await mkdir(directorio, { mode: 0o700 })
await mkdir(path.join(directorio, 'archivos'), { mode: 0o700 })
const base = baseDestino()
// La estructura y los permisos se recuperan desde migraciones, sin reemplazar Auth/Storage administrados.
await ejecutar(process.env.PG_DUMP_BIN || 'pg_dump', ['--format=plain', '--data-only', '--table=public.*', '--table=auth.users', '--table=auth.identities'], base.env, path.join(directorio, 'base.sql'))
await mkdir(path.join(directorio, 'migraciones'), { mode: 0o700 })
const migraciones = []
for (const nombre of (await readdir('supabase/migrations')).filter((n) => /^\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort()) {
  const bytes = await readFile(path.join('supabase/migrations', nombre))
  await writeFile(path.join(directorio, 'migraciones', nombre), bytes, { mode: 0o600 })
  migraciones.push({ nombre, sha256: hash(bytes) })
}
const storage = storageAdmin()
const archivos = []
async function copiarCarpeta(prefijo = '') {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await storage.list(prefijo, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw error
    for (const objeto of data) {
      const ruta = prefijo ? `${prefijo}/${objeto.name}` : objeto.name
      if (!objeto.id) { await copiarCarpeta(ruta); continue }
      const descarga = await storage.download(ruta)
      if (descarga.error) throw descarga.error
      const bytes = Buffer.from(await descarga.data.arrayBuffer())
      const sha256 = hash(bytes)
      await writeFile(path.join(directorio, 'archivos', sha256), bytes, { mode: 0o600 })
      archivos.push({ path: ruta, sha256, tamano: bytes.length, mime: objeto.metadata?.mimetype || descarga.data.type || 'application/octet-stream' })
    }
    if (data.length < 1000) break
  }
}
await copiarCarpeta()
const manifest = { version: 2, modo: 'datos-y-migraciones', creado: new Date().toISOString(), base_sha256: hash(await readFile(path.join(directorio, 'base.sql'))), migraciones, archivos }
await writeFile(path.join(directorio, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' })
await verificar(directorio)
console.log(`Respaldo verificado: ${path.resolve(directorio)} (${archivos.length} archivos). Copialo a almacenamiento externo.`)
