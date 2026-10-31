import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  baseDestination,
  run,
  env,
  storageAdmin,
  verify,
} from './backup-shared.mjs';

const directory = process.argv[2];
if (!directory)
  throw new Error(
    "Uso: npm run db:restaurar -- /ruta/respaldo [--aplicar --confirmar=host:puerto/base]",
  );
const m = await verify(directory);
console.log(`Integridad correcta: dump y ${m.archivos.length} archivos.`);
if (process.argv.includes("--aplicar")) {
  env();
  const base = baseDestination();
  if (!process.argv.includes(`--confirmar=${base.identity}`))
    throw new Error(
      `Para reemplazar la base destino, agregá --confirmar=${base.identity}`,
    );
  if (!process.argv.includes("--archivos")) {
    const versiones = m.migraciones
      .map((migration) => `'${migration.nombre.slice(0, 14)}'`)
      .join(",");
    const prepare = `DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM auth.users) OR EXISTS (SELECT 1 FROM public.clientes)
        OR EXISTS (SELECT 1 FROM public.cotizaciones) OR EXISTS (SELECT 1 FROM public.documentos)
        OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='documentos') THEN
        RAISE EXCEPTION 'El destino debe ser un Supabase nuevo, sin usuarios, clientes, cotizaciones ni archivos';
      END IF;
      IF EXISTS (SELECT 1 FROM unnest(ARRAY[${versiones}]) v WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations s WHERE s.version=v))
        OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations s WHERE s.version NOT IN (${versiones})) THEN
        RAISE EXCEPTION 'El destino debe tener exactamente las migraciones incluidas en el respaldo';
      END IF;
    END $$;
    SET session_replication_role=replica;
    TRUNCATE public.empresa_config, public.firmantes, public.equipos, public.plantillas, public.clientes,
      public.contactos, public.profiles, public.cotizaciones, public.cotizacion_items, public.cotizacion_envios,
      public.documentos, public.documento_archivos, public.documento_presupuestos, public.op_facturas RESTART IDENTITY CASCADE;`;
    await run(
      process.env.PSQL_BIN || "psql",
      [
        "--single-transaction",
        "--set=ON_ERROR_STOP=1",
        "--command",
        prepare,
        "--file",
        path.resolve(directory, "base.sql"),
        "--dbname",
        base.env.PGDATABASE,
      ],
      base.env,
    );
  }
  const storage = storageAdmin();
  for (const a of m.archivos) {
    const { error } = await storage.upload(
      a.path,
      await readFile(path.join(directory, "archivos", a.sha256)),
      { contentType: a.mime, upsert: true },
    );
    if (error) throw error;
  }
  console.log(
    "Base y archivos restaurados. Verificá el ingreso, un PDF y el saldo de una factura antes de habilitar usuarios.",
  );
} else
  console.log(
    "Sólo se verificó el respaldo. Para restaurar, indicá --aplicar y confirmá explícitamente el destino.",
  );
