import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cents,
  completeInvoice,
  decimal,
  hash,
  planificarClients,
  prepareReview,
  uuidEstable,
} from './prepare.mjs';

const pdf = Buffer.from("%PDF-1.4 documento sintético para prueba unitaria");
const cliente = {
  cuit: "30000000007",
  razon_social: "Cliente de ejemplo",
  condicion_iva: "responsable_inscripto",
  last_invoice: "00000001",
  date_last_invoice: "2026-10-01",
};
function invoice(changes = {}) {
  return {
    archivo: "30709154083_001_00002_00000001.pdf",
    path: "/tmp/factura-ejemplo.pdf",
    sha256: hash(pdf),
    numero: "00000001",
    punto_venta: "00002",
    tipo_comprobante: "FA",
    moneda: "ARS",
    fecha: "2026-10-01",
    fecha_vencimiento: "2026-11-01",
    periodo_desde: "2026-09-01",
    periodo_hasta: "2026-09-30",
    cuit: cliente.cuit,
    anio_historico: 2026,
    neto: "2820000.00",
    iva: "592200.00",
    otros_tributos: "0.00",
    total: "3412200.00",
    estado_cobro: "Cobrada",
    naturaleza: "Servicios",
    observaciones: [],
    items: [
      {
        cantidad: "3.00",
        precio_unitario: "1000000.00",
        bonificacion_pct: "6.00",
        neto: "2820000.00",
        descripcion: "Servicio de ejemplo",
      },
    ],
    ...changes,
  };
}
function prepare(facturas = [invoice()], clientes = [cliente]) {
  return prepareReview(
    { clientes, facturas },
    {
      archivos: new Map([["/tmp/factura-ejemplo.pdf", pdf]]),
      lote: "prueba-unitaria",
    },
  );
}

describe("preparación de carga histórica", () => {
  it("usa aritmética exacta en centavos y aplica la bonificación sin perder el total", () => {
    const result = prepare();
    assert.equal(result.total, "3412200.00");
    assert.deepEqual(result.facturas[0].datos.items, [
      {
        descripcion: "Servicio de ejemplo",
        cantidad: "3.00",
        precio_unitario: "940000.00",
        unidad: "UNIDAD",
      },
    ]);
    assert.equal(result.facturas[0].clave, "30709154083:FA:00002-00000001");
    assert.equal(
      result.facturas[0].datos.source.items[0].precio_unitario,
      "1000000.00",
    );
    assert.equal(cents("999999999999.99"), 99999999999999n);
    assert.equal(decimal(1n), "0.01");
  });
  it("excluye refacturaciones e intereses conservando sus razones", () => {
    const result = prepare([
      invoice(),
      invoice({ numero: "00000002", observaciones: ["Posible refacturación"] }),
      invoice({ numero: "00000003", naturaleza: "Intereses" }),
    ]);
    assert.equal(result.facturas.length, 1);
    assert.deepEqual(
      result.excluidas.map((f) => f.numero),
      ["00000002", "00000003"],
    );
  });
  it("no confunde una fecha resuelta con un pendiente y conserva su evidencia", () => {
    const result = prepare([
      invoice({
        observaciones_fechas_resueltas: ["El detalle tenía otra fecha."],
      }),
    ]);
    assert.match(result.facturas[0].datos.notas, /Se usa la cabecera/);
    assert.equal(
      result.facturas[0].datos.source.observaciones_fechas_resueltas[0],
      "El detalle tenía otra fecha.",
    );
  });
  it("rechaza un archivo cambiado, un número distinto y un cobro no confirmado", () => {
    assert.throws(
      () => prepare([invoice({ sha256: "0".repeat(64) })]),
      /hash/,
    );
    assert.throws(
      () => prepare([invoice({ numero: "00000099" })]),
      /número no coincide/,
    );
    assert.throws(
      () => prepare([invoice({ estado_cobro: "Pendiente" })]),
      /Cobro sin confirmar/,
    );
  });
  it("conserva el CUIT informado sin validar contenido ni verificador", () => {
    for (const cuit of ["30000000008", "1", "identificación informada"]) {
      const result = prepare([invoice({ cuit })], [{ ...cliente, cuit }]);
      assert.equal(result.clientes[0].cuit, cuit);
      assert.equal(result.facturas[0].cuit, cuit);
    }
    const result = prepare([invoice({ archivo: "30000000008_001_00002_00000001.pdf" })]);
    assert.equal(result.facturas[0].datos.emisor_cuit, "30000000008");
  });
  it("rechaza clientes duplicados y comprobantes repetidos", () => {
    assert.throws(
      () => prepare([invoice()], [cliente, cliente]),
      /clientes duplicados/,
    );
    assert.throws(
      () => prepare([invoice(), invoice()]),
      /comprobantes repetidos/,
    );
  });
  it("rechaza importes que no concilian y valores con más de dos decimales", () => {
    assert.throws(
      () => prepare([invoice({ total: "3412201.00" })]),
      /total no concilia/,
    );
    assert.throws(() => cents("1.001"), /decimal inválido/);
    assert.throws(
      () =>
        prepare([
          invoice({ items: [{ ...invoice().items[0], neto: "2819999.99" }] }),
        ]),
      /importe original del ítem no concilia/,
    );
  });
  it("rechaza límites que la base no admite antes de subir archivos o crear clientes", () => {
    const item = invoice().items[0];
    assert.throws(
      () =>
        prepare([
          invoice({
            neto: "100000000.00",
            iva: "21000000.00",
            total: "121000000.00",
            items: [
              {
                ...item,
                cantidad: "10000000000.00",
                precio_unitario: "0.01",
                bonificacion_pct: "0.00",
                neto: "100000000.00",
              },
            ],
          }),
        ]),
      /Cantidad/,
    );
    assert.throws(
      () =>
        prepare([
          invoice({
            neto: "0.00",
            iva: "1.00",
            total: "1.00",
            items: [{ ...item, precio_unitario: "0.00", neto: "0.00" }],
          }),
        ]),
      /total no concilia/,
    );
    assert.throws(
      () =>
        prepare([
          invoice({
            neto: "2.01",
            iva: "0.00",
            total: "2.01",
            items: Array.from({ length: 201 }, () => ({
              ...item,
              cantidad: "1.00",
              precio_unitario: "0.01",
              bonificacion_pct: "0.00",
              neto: "0.01",
            })),
          }),
        ]),
      /200 ítems/,
    );
    assert.throws(
      () =>
        prepare([
          invoice({
            neto: "10000000000.00",
            iva: "0.00",
            total: "10000000000.00",
            items: [
              {
                ...item,
                cantidad: "0.01",
                precio_unitario: "1000000000000.00",
                bonificacion_pct: "0.00",
                neto: "10000000000.00",
              },
            ],
          }),
        ]),
      /Precio bonificado fuera/,
    );
  });
  it("redondea medio centavo al alza y rechaza cambios por redondear un precio bonificado", () => {
    const result = prepare([
      invoice({
        neto: "0.02",
        iva: "0.00",
        total: "0.02",
        items: [
          {
            cantidad: "0.50",
            precio_unitario: "0.03",
            bonificacion_pct: "0.00",
            neto: "0.02",
            descripcion: "Fracción de servicio",
          },
        ],
      }),
    ]);
    assert.equal(result.facturas[0].datos.items[0].precio_unitario, "0.03");
    assert.equal(result.facturas[0].datos.items[0].cantidad, "0.50");
    const bonificado = prepare([
      invoice({
        neto: "0.51",
        iva: "0.00",
        total: "0.51",
        items: [
          {
            cantidad: "1.00",
            precio_unitario: "1.01",
            bonificacion_pct: "50.00",
            neto: "0.51",
            descripcion: "Servicio bonificado",
          },
        ],
      }),
    ]);
    assert.equal(bonificado.facturas[0].datos.items[0].precio_unitario, "0.51");
    assert.throws(
      () =>
        prepare([
          invoice({
            neto: "0.05",
            iva: "0.00",
            total: "0.05",
            items: [
              {
                cantidad: "2.00",
                precio_unitario: "0.05",
                bonificacion_pct: "50.00",
                neto: "0.05",
                descripcion: "No representable",
              },
            ],
          }),
        ]),
      /precio bonificado no concilia/,
    );
  });
  it("crea identificadores estables sin depender del orden ni la ejecución", () => {
    assert.equal(
      uuidEstable("cliente:30000000007"),
      uuidEstable("cliente:30000000007"),
    );
    assert.notEqual(
      uuidEstable("cliente:30000000007"),
      uuidEstable("cliente:30000000015"),
    );
    assert.match(
      uuidEstable("cliente:30000000007"),
      /^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    );
  });
  it("reutiliza por CUIT sin sobrescribir razón social ni datos existentes", () => {
    const existing = {
      id: "4f62704d-6cbf-47bc-9a2b-229a23f81d08",
      cuit: cliente.cuit,
      razon_social: "Nombre conservado",
      email: "contacto@ejemplo.test",
    };
    const copy = structuredClone(existing);
    const plan = planificarClients([cliente], [existing]);
    assert.equal(plan[0].id, existing.id);
    assert.equal(plan[0].existente, true);
    assert.deepEqual(existing, copy);
  });
  it("detiene una coincidencia ambigua con un cliente sin CUIT", () => {
    assert.throws(
      () =>
        planificarClients(
          [cliente],
          [{ id: "otro", cuit: null, razon_social: "  CLIENTE DE EJEMPLO " }],
        ),
      /cliente sin CUIT/,
    );
  });
  it("construye una ruta UUID estable dentro de la carpeta del cliente sin alterar la factura", () => {
    const prepared = prepare();
    const clientes = planificarClients(prepared.clientes, []);
    const origen = structuredClone(prepared.facturas[0]);
    const complete = completeInvoice(origen, clientes);
    assert.equal(complete.datos.cliente_id, clientes[0].id);
    assert.equal(
      complete.datos.archivo.path,
      completeInvoice(origen, clientes).datos.archivo.path,
    );
    assert.match(
      complete.datos.archivo.path,
      /^documentos\/[\da-f-]{36}\/[\da-f-]{36}\.pdf$/,
    );
    assert.equal(origen.datos.archivo.path, undefined);
  });
});
