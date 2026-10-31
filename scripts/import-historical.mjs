import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
  keyInvoice,
  completeInvoice,
  hash,
  planificarClients,
  prepareReview,
} from './historical/prepare.mjs';
import { registerInvoice } from './historical/execute.mjs';

const { values: options } = parseArgs({
  options: {
    review: { type: "string" },
    "project-ref": { type: "string" },
    report: { type: "string" },
    lote: { type: "string" },
    apply: { type: "boolean", default: false },
    expected: { type: "string" },
  },
});
const verify = (condition, message) => {
  if (!condition) throw new Error(message);
};
const result = (response, contexto) => {
  if (response.error)
    throw new Error(`${contexto}: ${response.error.message}`);
  return response.data;
};

function conectar() {
  verify(
    options.review &&
      options["project-ref"] &&
      options.report &&
      options.lote,
    "Uso: node --env-file=<archivo> scripts/import-historical.mjs --revision <json> --project-ref <ref> --lote <lote> --informe <json> [--apply]",
  );
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  verify(
    url.origin === `https://${options["project-ref"]}.supabase.co`,
    "La URL no corresponde al proyecto esperado",
  );
  verify(process.env.SUPABASE_SECRET_KEY, "Falta SUPABASE_SECRET_KEY");
  return createClient(url.origin, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readClients(supabase) {
  const clientes = [];
  for (let desde = 0; ; desde += 1000) {
    const tanda = result(
      await supabase
        .from("clientes")
        .select("id,cuit,razon_social,activo")
        .order("id")
        .range(desde, desde + 999),
      "Leer clientes",
    );
    clientes.push(...tanda);
    if (tanda.length < 1000) return clientes;
  }
}

async function saveReport(path, report) {
  await mkdir(path.dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.tmp`;
  await writeFile(temp, JSON.stringify(report, null, 2), { mode: 0o600 });
  await rename(temp, path);
}

async function validateConflicts(supabase, facturas) {
  const response = await supabase
    .from("facturas_historicas")
    .select("factura_id,clave_origen,entrada")
    .in(
      "clave_origen",
      facturas.map((f) => f.clave),
    );
  if (
    response.error &&
    ["PGRST205", "42P01"].includes(response.error.code) &&
    !options.apply
  )
    return { migration_pending: true };
  const history = result(
    response,
    "Leer importaciones históricas; verificá que la migración esté aplicada",
  );
  const normalizeNumber = (numero) =>
    numero
      .replace(/[^a-z0-9]/gi, "")
      .replace(/^0+/, "")
      .toLowerCase();
  const documentos = result(
    await supabase
      .from("documentos")
      .select("id,numero,numero_normalizado,tipo_comprobante")
      .eq("tipo", "factura")
      .in(
        "numero_normalizado",
        facturas.map((f) => normalizeNumber(f.datos.numero)),
      ),
    "Buscar facturas existentes",
  );
  for (const invoice of facturas) {
    const previous = history.find(
      (registro) =>
        registro.clave_origen ===
        keyInvoice(invoice.datos.emisor_cuit, invoice.datos.numero),
    );
    verify(
      !previous || isDeepStrictEqual(previous.entrada, invoice.datos),
      `La factura ${invoice.datos.numero} ya se importó con otros datos`,
    );
    verify(
      !documentos.some(
        (document) =>
          document.numero_normalizado ===
            normalizeNumber(invoice.datos.numero) &&
          document.tipo_comprobante === "FA" &&
          document.id !== previous?.factura_id,
      ),
      `La factura ${invoice.datos.numero} ya existe fuera de esta importación`,
    );
  }
  return { migration_pending: false, ya_importadas: history.length };
}

async function crearClient(supabase, cliente) {
  if (cliente.existente) return cliente;
  const response = await supabase
    .from("clientes")
    .insert({ id: cliente.id, ...cliente.datos })
    .select("id")
    .single();
  if (response.error?.code === "23505") {
    const existing = result(
      await supabase
        .from("clientes")
        .select("id")
        .eq("cuit", cliente.datos.cuit)
        .single(),
      "Releer cliente concurrente",
    );
    return { ...cliente, id: existing.id, existente: true };
  }
  result(response, "Crear cliente");
  return cliente;
}

async function run() {
  const supabase = conectar();
  const pathReview = path.resolve(options.review);
  const bytesReview = await readFile(pathReview);
  const review = JSON.parse(bytesReview);
  verify(
    Array.isArray(review.facturas),
    "La revisión no contiene facturas",
  );
  const eligible = review.facturas.filter(
    (invoice) =>
      invoice.observaciones?.length === 0 && invoice.naturaleza === "Servicios",
  );
  const archivos = new Map(
    await Promise.all(
      eligible.map(async (invoice) => [
        invoice.path,
        await readFile(invoice.path),
      ]),
    ),
  );
  const prepared = prepareReview(review, {
    archivos,
    lote: options.lote,
  });
  const quantities = `${prepared.clientes.length},${prepared.facturas.length},${prepared.excluidas.length}`;
  verify(
    !options.apply || options.expected,
    "Para aplicar, indicá --esperados <clientes,facturas,excluidas> según la simulación revisada",
  );
  verify(
    !options.expected || options.expected === quantities,
    `Las cantidades cambiaron: ${quantities}; revisá nuevamente la simulación`,
  );
  const planned = planificarClients(
    prepared.clientes,
    await readClients(supabase),
  );
  let facturas = prepared.facturas.map((invoice) =>
    completeInvoice(invoice, planned),
  );
  const conflicts = await validateConflicts(supabase, facturas);
  const pathReport = path.resolve(options.report);
  verify(
    pathReport !== pathReview && path.extname(pathReport) === ".json",
    "El informe debe ser otro archivo JSON, distinto de la revisión original",
  );
  const report = {
    modo: options.apply ? "aplicar" : "simulacion",
    project: options["project-ref"],
    lote: options.lote,
    review_sha256: hash(bytesReview),
    iniciado_at: new Date().toISOString(),
    control: {
      clientes: preparedQuantity(planned),
      facturas: facturas.length,
      excluidas: prepared.excluidas.length,
      total_ars: prepared.total,
      ...conflicts,
    },
    clientes: planned.map((cliente) => ({
      id: cliente.id,
      cuit: cliente.datos.cuit,
      estado: cliente.existente ? "existente" : "previsto",
    })),
    excluidas: prepared.excluidas,
    archivos: [],
    facturas: [],
    estado: "preparado",
  };
  await saveReport(pathReport, report);
  console.log(JSON.stringify(report.control));
  if (!options.apply) {
    console.log(`Simulación guardada: ${pathReport}`);
    return;
  }
  try {
    const clientes = [];
    for (const cliente of planned) {
      const creado = await crearClient(supabase, cliente);
      clientes.push(creado);
      report.clientes.find((row) => row.cuit === cliente.datos.cuit).estado =
        creado.existente ? "reutilizado" : "creado";
      report.clientes.find((row) => row.cuit === cliente.datos.cuit).id =
        creado.id;
      await saveReport(pathReport, report);
    }
    facturas = prepared.facturas.map((invoice) =>
      completeInvoice(invoice, clientes),
    );
    await validateConflicts(supabase, facturas);
    for (const [index, invoice] of facturas.entries()) {
      const registro = await registerInvoice({
        supabase,
        factura: invoice,
        report,
        guardar: () => saveReport(pathReport, report),
      });
      console.log(
        `${index + 1}/${facturas.length}: ${invoice.datos.numero} ${registro.ya_imported ? "reutilizada" : "importada"}`,
      );
    }
    report.estado = "completo";
    report.finished_at = new Date().toISOString();
    await saveReport(pathReport, report);
  } catch (error) {
    report.estado = "interrumpido";
    report.error = error.message;
    await saveReport(pathReport, report);
    throw error;
  }
  console.log(`Carga completa. Informe: ${pathReport}`);
}

function preparedQuantity(clientes) {
  return {
    total: clientes.length,
    existing: clientes.filter((cliente) => cliente.existente).length,
    nuevos: clientes.filter((cliente) => !cliente.existente).length,
  };
}

run().catch((error) => {
  console.error(`Carga detenida: ${error.message}`);
  process.exitCode = 1;
});
