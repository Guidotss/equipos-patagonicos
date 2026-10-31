import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export function entorno() {
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
export function baseDestino() {
  if (!process.env.SUPABASE_DB_URL) throw new Error("Falta SUPABASE_DB_URL");
  const url = new URL(process.env.SUPABASE_DB_URL);
  return {
    identidad: `${url.hostname}:${url.port || "5432"}${url.pathname}`,
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
export async function ejecutar(binario, argumentos, env, archivoSalida) {
  const salida = archivoSalida ? await open(archivoSalida, "wx", 0o600) : null;
  try {
    await new Promise((resolve, reject) => {
      const proceso = spawn(binario, argumentos, {
        env,
        stdio: ["ignore", salida?.fd ?? "inherit", "pipe"],
      });
      let diagnostico = "";
      proceso.stderr.on("data", (data) => {
        diagnostico += data.toString();
      });
      proceso.on("error", () =>
        reject(
          new Error(
            `No se pudo ejecutar ${binario}. Instalá las herramientas de PostgreSQL o configurá PG_DUMP_BIN/PSQL_BIN.`,
          ),
        ),
      );
      proceso.on("exit", (codigo) =>
        codigo === 0
          ? resolve()
          : reject(
              new Error(
                `${path.basename(binario)} terminó con código ${codigo}: ${diagnostico.replace(/postgres(?:ql)?:\/\/\S+/g, "[conexión]")}`,
              ),
            ),
      );
    });
  } finally {
    await salida?.close();
  }
}
export async function verificar(directorio) {
  const m = JSON.parse(
    await readFile(path.join(directorio, "manifest.json"), "utf8"),
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
  if (hash(await readFile(path.join(directorio, "base.sql"))) !== m.base_sha256)
    throw new Error("El dump no coincide con su hash");
  const nombres = new Set();
  for (const migracion of m.migraciones) {
    if (
      !/^\d{14}_[a-z0-9_]+\.sql$/.test(migracion.nombre) ||
      nombres.has(migracion.nombre) ||
      !/^[a-f0-9]{64}$/.test(migracion.sha256)
    )
      throw new Error("Migración inválida en el manifiesto");
    nombres.add(migracion.nombre);
    if (
      hash(
        await readFile(path.join(directorio, "migraciones", migracion.nombre)),
      ) !== migracion.sha256
    )
      throw new Error(`Migración incompleta: ${migracion.nombre}`);
  }
  const rutas = new Set();
  for (const a of m.archivos) {
    if (
      typeof a.path !== "string" ||
      rutas.has(a.path) ||
      !/^[a-f0-9]{64}$/.test(a.sha256) ||
      !Number.isSafeInteger(a.tamano) ||
      a.tamano <= 0
    )
      throw new Error("Archivo inválido en el manifiesto");
    rutas.add(a.path);
    const fichero = path.join(directorio, "archivos", a.sha256);
    if (!(await stat(fichero)).isFile())
      throw new Error("Falta un archivo del respaldo");
    const bytes = await readFile(fichero);
    if (bytes.length !== a.tamano || hash(bytes) !== a.sha256)
      throw new Error(`Archivo incompleto: ${a.path}`);
  }
  return m;
}
