import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
  claveFactura,
  completarFactura,
  hash,
  planificarClientes,
  prepararRevision,
} from "./historicos/preparar.mjs";
import { registrarFactura } from "./historicos/ejecutar.mjs";

const { values: opciones } = parseArgs({
  options: {
    revision: { type: "string" },
    "project-ref": { type: "string" },
    informe: { type: "string" },
    lote: { type: "string" },
    apply: { type: "boolean", default: false },
    esperados: { type: "string" },
  },
});
const verificar = (condicion, mensaje) => {
  if (!condicion) throw new Error(mensaje);
};
const resultado = (respuesta, contexto) => {
  if (respuesta.error)
    throw new Error(`${contexto}: ${respuesta.error.message}`);
  return respuesta.data;
};

function conectar() {
  verificar(
    opciones.revision &&
      opciones["project-ref"] &&
      opciones.informe &&
      opciones.lote,
    "Uso: node --env-file=<archivo> scripts/importar-historicos.mjs --revision <json> --project-ref <ref> --lote <lote> --informe <json> [--apply]",
  );
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  verificar(
    url.origin === `https://${opciones["project-ref"]}.supabase.co`,
    "La URL no corresponde al proyecto esperado",
  );
  verificar(process.env.SUPABASE_SECRET_KEY, "Falta SUPABASE_SECRET_KEY");
  return createClient(url.origin, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function leerClientes(supabase) {
  const clientes = [];
  for (let desde = 0; ; desde += 1000) {
    const tanda = resultado(
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

async function guardarInforme(ruta, informe) {
  await mkdir(path.dirname(ruta), { recursive: true, mode: 0o700 });
  const temporal = `${ruta}.tmp`;
  await writeFile(temporal, JSON.stringify(informe, null, 2), { mode: 0o600 });
  await rename(temporal, ruta);
}

async function validarConflictos(supabase, facturas) {
  const respuesta = await supabase
    .from("facturas_historicas")
    .select("factura_id,clave_origen,entrada")
    .in(
      "clave_origen",
      facturas.map((f) => f.clave),
    );
  if (
    respuesta.error &&
    ["PGRST205", "42P01"].includes(respuesta.error.code) &&
    !opciones.apply
  )
    return { migracion_pendiente: true };
  const historial = resultado(
    respuesta,
    "Leer importaciones históricas; verificá que la migración esté aplicada",
  );
  const normalizarNumero = (numero) =>
    numero
      .replace(/[^a-z0-9]/gi, "")
      .replace(/^0+/, "")
      .toLowerCase();
  const documentos = resultado(
    await supabase
      .from("documentos")
      .select("id,numero,numero_normalizado,tipo_comprobante")
      .eq("tipo", "factura")
      .in(
        "numero_normalizado",
        facturas.map((f) => normalizarNumero(f.datos.numero)),
      ),
    "Buscar facturas existentes",
  );
  for (const factura of facturas) {
    const anterior = historial.find(
      (registro) =>
        registro.clave_origen ===
        claveFactura(factura.datos.emisor_cuit, factura.datos.numero),
    );
    verificar(
      !anterior || isDeepStrictEqual(anterior.entrada, factura.datos),
      `La factura ${factura.datos.numero} ya se importó con otros datos`,
    );
    verificar(
      !documentos.some(
        (documento) =>
          documento.numero_normalizado ===
            normalizarNumero(factura.datos.numero) &&
          documento.tipo_comprobante === "FA" &&
          documento.id !== anterior?.factura_id,
      ),
      `La factura ${factura.datos.numero} ya existe fuera de esta importación`,
    );
  }
  return { migracion_pendiente: false, ya_importadas: historial.length };
}

async function crearCliente(supabase, cliente) {
  if (cliente.existente) return cliente;
  const respuesta = await supabase
    .from("clientes")
    .insert({ id: cliente.id, ...cliente.datos })
    .select("id")
    .single();
  if (respuesta.error?.code === "23505") {
    const existente = resultado(
      await supabase
        .from("clientes")
        .select("id")
        .eq("cuit", cliente.datos.cuit)
        .single(),
      "Releer cliente concurrente",
    );
    return { ...cliente, id: existente.id, existente: true };
  }
  resultado(respuesta, "Crear cliente");
  return cliente;
}

async function ejecutar() {
  const supabase = conectar();
  const rutaRevision = path.resolve(opciones.revision);
  const bytesRevision = await readFile(rutaRevision);
  const revision = JSON.parse(bytesRevision);
  verificar(
    Array.isArray(revision.facturas),
    "La revisión no contiene facturas",
  );
  const elegibles = revision.facturas.filter(
    (factura) =>
      factura.observaciones?.length === 0 && factura.naturaleza === "Servicios",
  );
  const archivos = new Map(
    await Promise.all(
      elegibles.map(async (factura) => [
        factura.path,
        await readFile(factura.path),
      ]),
    ),
  );
  const preparado = prepararRevision(revision, {
    archivos,
    lote: opciones.lote,
  });
  const cantidades = `${preparado.clientes.length},${preparado.facturas.length},${preparado.excluidas.length}`;
  verificar(
    !opciones.apply || opciones.esperados,
    "Para aplicar, indicá --esperados <clientes,facturas,excluidas> según la simulación revisada",
  );
  verificar(
    !opciones.esperados || opciones.esperados === cantidades,
    `Las cantidades cambiaron: ${cantidades}; revisá nuevamente la simulación`,
  );
  const previstos = planificarClientes(
    preparado.clientes,
    await leerClientes(supabase),
  );
  let facturas = preparado.facturas.map((factura) =>
    completarFactura(factura, previstos),
  );
  const conflictos = await validarConflictos(supabase, facturas);
  const rutaInforme = path.resolve(opciones.informe);
  verificar(
    rutaInforme !== rutaRevision && path.extname(rutaInforme) === ".json",
    "El informe debe ser otro archivo JSON, distinto de la revisión original",
  );
  const informe = {
    modo: opciones.apply ? "aplicar" : "simulacion",
    proyecto: opciones["project-ref"],
    lote: opciones.lote,
    revision_sha256: hash(bytesRevision),
    iniciado_at: new Date().toISOString(),
    control: {
      clientes: preparadosCantidad(previstos),
      facturas: facturas.length,
      excluidas: preparado.excluidas.length,
      total_ars: preparado.total,
      ...conflictos,
    },
    clientes: previstos.map((cliente) => ({
      id: cliente.id,
      cuit: cliente.datos.cuit,
      estado: cliente.existente ? "existente" : "previsto",
    })),
    excluidas: preparado.excluidas,
    archivos: [],
    facturas: [],
    estado: "preparado",
  };
  await guardarInforme(rutaInforme, informe);
  console.log(JSON.stringify(informe.control));
  if (!opciones.apply) {
    console.log(`Simulación guardada: ${rutaInforme}`);
    return;
  }
  try {
    const clientes = [];
    for (const cliente of previstos) {
      const creado = await crearCliente(supabase, cliente);
      clientes.push(creado);
      informe.clientes.find((fila) => fila.cuit === cliente.datos.cuit).estado =
        creado.existente ? "reutilizado" : "creado";
      informe.clientes.find((fila) => fila.cuit === cliente.datos.cuit).id =
        creado.id;
      await guardarInforme(rutaInforme, informe);
    }
    facturas = preparado.facturas.map((factura) =>
      completarFactura(factura, clientes),
    );
    await validarConflictos(supabase, facturas);
    for (const [indice, factura] of facturas.entries()) {
      const registro = await registrarFactura({
        supabase,
        factura,
        informe,
        guardar: () => guardarInforme(rutaInforme, informe),
      });
      console.log(
        `${indice + 1}/${facturas.length}: ${factura.datos.numero} ${registro.ya_importada ? "reutilizada" : "importada"}`,
      );
    }
    informe.estado = "completo";
    informe.finalizado_at = new Date().toISOString();
    await guardarInforme(rutaInforme, informe);
  } catch (error) {
    informe.estado = "interrumpido";
    informe.error = error.message;
    await guardarInforme(rutaInforme, informe);
    throw error;
  }
  console.log(`Carga completa. Informe: ${rutaInforme}`);
}

function preparadosCantidad(clientes) {
  return {
    total: clientes.length,
    existentes: clientes.filter((cliente) => cliente.existente).length,
    nuevos: clientes.filter((cliente) => !cliente.existente).length,
  };
}

ejecutar().catch((error) => {
  console.error(`Carga detenida: ${error.message}`);
  process.exitCode = 1;
});
