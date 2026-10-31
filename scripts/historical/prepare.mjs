import { createHash } from "node:crypto";

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const require = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function cents(value, field = "importe") {
  require(
    typeof value === "string" && /^\d+(?:\.\d{1,2})?$/.test(value),
    `${field}: decimal inválido`,
  );
  const [integer, decimals = ""] = value.split(".");
  return BigInt(integer) * 100n + BigInt(decimals.padEnd(2, "0"));
}

export function decimal(value) {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

export function uuidEstable(texto) {
  const namespace = Buffer.from("028667250ba34f7c9f1f63d4fb58e190", "hex");
  const bytes = createHash("sha1")
    .update(namespace)
    .update(texto)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function keyInvoice(emisor, numero) {
  return `${emisor}:FA:${numero}`;
}

const nameNormalized = (nombre) =>
  nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function planificarClients(prepared, existing) {
  return prepared.map((datos) => {
    const found = existing.find(
      (cliente) => cliente.cuit === datos.cuit,
    );
    require(
      found ||
        !existing.some(
          (cliente) =>
            !cliente.cuit &&
            nameNormalized(cliente.razon_social) ===
              nameNormalized(datos.razon_social),
        ),
      `Hay un cliente sin CUIT que podría ser ${datos.razon_social}; revisalo antes de importar`,
    );
    return {
      id: found?.id ?? uuidEstable(`cliente:${datos.cuit}`),
      datos,
      existente: !!found,
    };
  });
}

export function completeInvoice(invoice, clientes) {
  const cliente = clientes.find(
    (cliente) => cliente.datos.cuit === invoice.cuit,
  );
  require(cliente, `No se encontró el cliente ${invoice.cuit}`);
  const datos = {
    ...invoice.datos,
    cliente_id: cliente.id,
    archivo: {
      ...invoice.datos.archivo,
      path: `documentos/${cliente.id}/${uuidEstable(`${cliente.id}:${invoice.datos.sha256}`)}.pdf`,
    },
  };
  return { ...invoice, datos };
}

function dateValid(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const fecha = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(fecha.valueOf()) && fecha.toISOString().slice(0, 10) === value
  );
}

function prepareItem(item, numero) {
  const cantidad = cents(item.cantidad, "cantidad");
  const price = cents(item.precio_unitario, "precio unitario");
  const bonificacion = cents(item.bonificacion_pct, "bonificación");
  require(
    cantidad > 0n && cantidad <= 999999999999n && bonificacion <= 10000n,
    `Cantidad o bonificación inválida en ${numero}`,
  );
  const netOriginal =
    (cantidad * price * (10000n - bonificacion) + 500000n) / 1000000n;
  require(
    netOriginal === cents(item.neto),
    `El importe original del ítem no concilia en ${numero}`,
  );
  const priceNet = (price * (10000n - bonificacion) + 5000n) / 10000n;
  require(
    priceNet > 0n && priceNet <= 99999999999999n,
    `Precio bonificado fuera de rango en ${numero}`,
  );
  const net = (cantidad * priceNet + 50n) / 100n;
  require(
    net === cents(item.neto),
    `El precio bonificado no concilia en ${numero}`,
  );
  const descripcion = item.description_for_carga ?? item.descripcion;
  require(
    typeof descripcion === "string" && descripcion.trim() !== "",
    `Falta descripción en ${numero}`,
  );
  return {
    descripcion,
    cantidad: decimal(cantidad),
    precio_unitario: decimal(priceNet),
    unidad: "UNIDAD",
  };
}

function prepareClient(cliente) {
  require(typeof cliente.cuit === "string", "El CUIT debe ser texto");
  require(
    typeof cliente.razon_social === "string" && cliente.razon_social.trim(),
    "Falta razón social",
  );
  require(
    [
      "responsable_inscripto",
      "monotributo",
      "exento",
      "consumidor_final",
    ].includes(cliente.condicion_iva),
    `IVA inválido en ${cliente.cuit}`,
  );
  return {
    cuit: cliente.cuit,
    razon_social: cliente.razon_social,
    condicion_iva: cliente.condicion_iva,
    direccion: cliente.direccion ?? "",
    localidad: cliente.localidad ?? "",
    provincia: cliente.provincia ?? "",
    email: cliente.email ?? "",
    telefono: cliente.telefono ?? "",
    condicion_pago: cliente.condicion_pago ?? "",
    notas: `Datos fiscales tomados de factura 00002-${cliente.last_invoice} del ${cliente.date_last_invoice}. Contactos y condiciones de pago a completar.`,
  };
}

const FIELDS_SOURCE = [
  "archivo",
  "sha256",
  "numero",
  "punto_venta",
  "tipo_comprobante",
  "moneda",
  "fecha",
  "fecha_vencimiento",
  "cuit",
  "razon_social",
  "condicion_iva_original",
  "domicilio_original",
  "condicion_venta",
  "periodo_desde_original",
  "periodo_hasta_original",
  "periodo_desde",
  "periodo_hasta",
  "neto",
  "iva",
  "otros_tributos",
  "total",
  "estado_cobro",
  "fuente_estado_cobro",
  "anio_historico",
  "criterio_fecha_servicio",
  "ajustes_anio_confirmados",
  "observaciones_fechas_resueltas",
  "referencias_oc",
  "otras_referencias",
  "internos_mencionados",
  "items",
  "detalle_completo",
  "detalle_para_carga",
];

function prepareInvoice(invoice, archivos, lote) {
  const archivo = archivos.get(invoice.path);
  require(
    Buffer.isBuffer(archivo) &&
      archivo.length > 5 &&
      archivo.length <= 10485760,
    `PDF ausente o tamaño inválido: ${invoice.archivo}`,
  );
  require(
    archivo.subarray(0, 5).toString() === "%PDF-",
    `El archivo no es PDF: ${invoice.archivo}`,
  );
  require(
    hash(archivo) === invoice.sha256,
    `El hash no coincide: ${invoice.archivo}`,
  );
  const identity = /^(\d{11})_001_(\d{5})_(\d{8})\.pdf$/.exec(invoice.archivo);
  require(
    identity,
    `Nombre de comprobante inválido: ${invoice.archivo}`,
  );
  require(
    identity[2] === invoice.punto_venta && identity[3] === invoice.numero,
    `El número no coincide con el PDF: ${invoice.archivo}`,
  );
  require(
    invoice.tipo_comprobante === "FA" && invoice.moneda === "ARS",
    `Comprobante no compatible: ${invoice.archivo}`,
  );
  require(
    invoice.estado_cobro === "Cobrada",
    `Cobro sin confirmar: ${invoice.archivo}`,
  );
  require(dateValid(invoice.fecha), `Fecha inválida en ${invoice.numero}`);
  require(
    !invoice.fecha_vencimiento || dateValid(invoice.fecha_vencimiento),
    `Vencimiento inválido en ${invoice.numero}`,
  );
  require(
    dateValid(invoice.periodo_desde) &&
      dateValid(invoice.periodo_hasta) &&
      invoice.periodo_desde <= invoice.periodo_hasta,
    `Período inválido en ${invoice.numero}`,
  );
  const net = cents(invoice.neto);
  const iva = cents(invoice.iva);
  const tributos = cents(invoice.otros_tributos);
  const monto = cents(invoice.total);
  require(
    net > 0n &&
      monto > 0n &&
      monto <= 99999999999999n &&
      net + iva + tributos === monto,
    `El total no concilia en ${invoice.numero}`,
  );
  require(
    Array.isArray(invoice.items) &&
      invoice.items.length > 0 &&
      invoice.items.length <= 200,
    `Se requieren entre 1 y 200 ítems en ${invoice.numero}`,
  );
  const items = invoice.items.map((item) => prepareItem(item, invoice.numero));
  require(
    invoice.items.reduce((sum, item) => sum + cents(item.neto), 0n) ===
      net,
    `Los ítems no concilian en ${invoice.numero}`,
  );
  const numero = `${invoice.punto_venta}-${invoice.numero}`;
  const notas = [
    `Histórico ${invoice.anio_historico}: reconstruido desde factura ${numero}.`,
    "Cobrado antes de la carga por confirmación del usuario. Fecha y comprobante de cobro no informados.",
    "Fecha de aprobación interna: emisión de factura como referencia de reconstrucción; aprobación original no informada.",
    `Período de referencia: ${invoice.periodo_desde} a ${invoice.periodo_hasta}.`,
    ...(invoice.ajustes_anio_confirmados ?? []),
    ...(invoice.observaciones_fechas_resueltas ?? []).map(
      (texto) => `Se usa la cabecera. Observación original: ${texto}`,
    ),
  ].join("\n");
  require(notas.length <= 2000, `Notas demasiado largas en ${numero}`);
  return {
    cuit: invoice.cuit,
    ruta_local: invoice.path,
    clave: keyInvoice(identity[1], numero),
    datos: {
      emisor_cuit: identity[1],
      numero,
      fecha: invoice.fecha,
      fecha_vencimiento: invoice.fecha_vencimiento ?? null,
      neto: decimal(net),
      iva: decimal(iva),
      otros_tributos: decimal(tributos),
      monto: decimal(monto),
      periodo_desde: invoice.periodo_desde,
      periodo_hasta: invoice.periodo_hasta,
      items,
      archivo: { nombre_original: invoice.archivo },
      sha256: invoice.sha256,
      lote,
      confirmacion_cobro:
        invoice.fuente_estado_cobro ??
        "El usuario confirmó que todas las facturas históricas están cobradas; fecha de cobro no informada.",
      notas,
      source: Object.fromEntries(
        FIELDS_SOURCE.filter((field) => invoice[field] !== undefined).map(
          (field) => [field, invoice[field]],
        ),
      ),
    },
  };
}

export function prepareReview(review, { archivos, lote }) {
  require(
    typeof lote === "string" && lote.trim().length > 0,
    "Falta el lote de importación",
  );
  require(
    Array.isArray(review.clientes) && Array.isArray(review.facturas),
    "Revisión inválida",
  );
  const clientes = review.clientes.map(prepareClient);
  const cuits = new Set(clientes.map((cliente) => cliente.cuit));
  require(cuits.size === clientes.length, "Hay clientes duplicados por CUIT");
  const facturas = [];
  const excluidas = [];
  for (const invoice of review.facturas) {
    require(
      cuits.has(invoice.cuit),
      `No está el cliente de factura ${invoice.numero}`,
    );
    require(
      Array.isArray(invoice.observaciones),
      `Falta la revisión de factura ${invoice.numero}`,
    );
    if (invoice.observaciones.length || invoice.naturaleza !== "Servicios") {
      excluidas.push({
        numero: invoice.numero,
        cuit: invoice.cuit,
        motivo: invoice.observaciones.join(" / ") || invoice.naturaleza,
      });
      continue;
    }
    facturas.push(prepareInvoice(invoice, archivos, lote));
  }
  require(
    new Set(facturas.map((invoice) => invoice.clave)).size === facturas.length,
    "Hay comprobantes repetidos",
  );
  require(facturas.length > 0, "No hay facturas sin pendientes para cargar");
  const total = facturas.reduce(
    (sum, invoice) => sum + cents(invoice.datos.monto),
    0n,
  );
  return { clientes, facturas, excluidas, total: decimal(total), lote };
}
