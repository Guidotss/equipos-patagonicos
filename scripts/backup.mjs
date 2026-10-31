import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  baseDestination,
  run,
  env,
  hash,
  storageAdmin,
  verify,
} from './backup-shared.mjs';

env();
const directory = process.argv[2];
if (!directory)
  throw new Error("Uso: npm run db:backup -- /ruta/nueva/del/respaldo");
await mkdir(directory, { mode: 0o700 });
await mkdir(path.join(directory, "archivos"), { mode: 0o700 });
const base = baseDestination();
// La estructura y los permisos se recuperan desde migraciones, sin reemplazar Auth/Storage administrados.
await run(
  process.env.PG_DUMP_BIN || "pg_dump",
  [
    "--format=plain",
    "--data-only",
    "--table=public.*",
    "--table=auth.users",
    "--table=auth.identities",
  ],
  base.env,
  path.join(directory, "base.sql"),
);
await mkdir(path.join(directory, "migraciones"), { mode: 0o700 });
const migraciones = [];
for (const nombre of (await readdir("supabase/migrations"))
  .filter((n) => /^\d{14}_[a-z0-9_]+\.sql$/.test(n))
  .sort()) {
  const bytes = await readFile(path.join("supabase/migrations", nombre));
  await writeFile(path.join(directory, "migraciones", nombre), bytes, {
    mode: 0o600,
  });
  migraciones.push({ nombre, sha256: hash(bytes) });
}
const storage = storageAdmin();
const archivos = [];
async function copyFolder(prefix = "") {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await storage.list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    for (const object of data) {
      const path = prefix ? `${prefix}/${object.name}` : object.name;
      if (!object.id) {
        await copyFolder(path);
        continue;
      }
      const download = await storage.download(path);
      if (download.error) throw download.error;
      const bytes = Buffer.from(await download.data.arrayBuffer());
      const sha256 = hash(bytes);
      await writeFile(path.join(directory, "archivos", sha256), bytes, {
        mode: 0o600,
      });
      archivos.push({
        path: path,
        sha256,
        tamano: bytes.length,
        mime:
          object.metadata?.mimetype ||
          download.data.type ||
          "application/octet-stream",
      });
    }
    if (data.length < 1000) break;
  }
}
await copyFolder();
const manifest = {
  version: 2,
  modo: "datos-y-migraciones",
  creado: new Date().toISOString(),
  base_sha256: hash(await readFile(path.join(directory, "base.sql"))),
  migraciones,
  archivos,
};
await writeFile(
  path.join(directory, "manifest.json"),
  JSON.stringify(manifest, null, 2),
  { mode: 0o600, flag: "wx" },
);
await verify(directory);
console.log(
  `Respaldo verificado: ${path.resolve(directory)} (${archivos.length} archivos). Copialo a almacenamiento externo.`,
);
