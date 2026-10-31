import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export function env() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* Producción puede suministrar las variables directamente. */
  }
}
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function storageAdmin() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
    throw new Error("Faltan URL de Supabase o SUPABASE_SECRET_KEY");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).storage.from("documentos");
}
export function baseDestination() {
  if (!process.env.SUPABASE_DB_URL) throw new Error("Falta SUPABASE_DB_URL");
  const url = new URL(process.env.SUPABASE_DB_URL);
  return {
    identity: `${url.hostname}:${url.port || "5432"}${url.pathname}`,
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGSSLMODE:
        url.searchParams.get("sslmode") ??
        (["localhost", "127.0.0.1"].includes(url.hostname)
          ? "disable"
          : "require"),
    },
  };
}
export async function run(binary, args, env, fileOutput) {
  const output = fileOutput ? await open(fileOutput, "wx", 0o600) : null;
  try {
    await new Promise((resolve, reject) => {
      const process = spawn(binary, args, {
        env,
        stdio: ["ignore", output?.fd ?? "inherit", "pipe"],
      });
      let diagnostic = "";
      process.stderr.on("data", (data) => {
        diagnostic += data.toString();
      });
      process.on("error", () =>
        reject(
          new Error(
            `No se pudo ejecutar ${binary}. Instalá las herramientas de PostgreSQL o configurá PG_DUMP_BIN/PSQL_BIN.`,
          ),
        ),
      );
      process.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `${path.basename(binary)} terminó con código ${code}: ${diagnostic.replace(/postgres(?:ql)?:\/\/\S+/g, "[conexión]")}`,
              ),
            ),
      );
    });
  } finally {
    await output?.close();
  }
}
export async function verify(directory) {
  const m = JSON.parse(
    await readFile(path.join(directory, "manifest.json"), "utf8"),
  );
  if (
    m.version !== 2 ||
    m.modo !== "datos-y-migraciones" ||
    !Array.isArray(m.migraciones) ||
    !m.migraciones.length ||
    !Array.isArray(m.archivos) ||
    !/^[a-f0-9]{64}$/.test(m.base_sha256)
  )
    throw new Error("Manifiesto inválido o formato de respaldo no compatible");
  if (hash(await readFile(path.join(directory, "base.sql"))) !== m.base_sha256)
    throw new Error("El dump no coincide con su hash");
  const names = new Set();
  for (const migration of m.migraciones) {
    if (
      !/^\d{14}_[a-z0-9_]+\.sql$/.test(migration.nombre) ||
      names.has(migration.nombre) ||
      !/^[a-f0-9]{64}$/.test(migration.sha256)
    )
      throw new Error("Migración inválida en el manifiesto");
    names.add(migration.nombre);
    if (
      hash(
        await readFile(path.join(directory, "migraciones", migration.nombre)),
      ) !== migration.sha256
    )
      throw new Error(`Migración incompleta: ${migration.nombre}`);
  }
  const paths = new Set();
  for (const a of m.archivos) {
    if (
      typeof a.path !== "string" ||
      paths.has(a.path) ||
      !/^[a-f0-9]{64}$/.test(a.sha256) ||
      !Number.isSafeInteger(a.tamano) ||
      a.tamano <= 0
    )
      throw new Error("Archivo inválido en el manifiesto");
    paths.add(a.path);
    const file = path.join(directory, "archivos", a.sha256);
    if (!(await stat(file)).isFile())
      throw new Error("Falta un archivo del respaldo");
    const bytes = await readFile(file);
    if (bytes.length !== a.tamano || hash(bytes) !== a.sha256)
      throw new Error(`Archivo incompleto: ${a.path}`);
  }
  return m;
}
