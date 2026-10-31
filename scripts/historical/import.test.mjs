import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { hash } from "./prepare.mjs";

const exec = promisify(execFile);
const script = fileURLToPath(new URL("../import-historical.mjs", import.meta.url));

async function runImport({ apply, spanishFlags }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "historical-cli-"));
  try {
    const pdf = Buffer.from("%PDF-1.4 comprobante sintético");
    const pdfPath = path.join(dir, "factura.pdf");
    const reviewPath = path.join(dir, "review.json");
    const reportPath = path.join(dir, "reports", "report.json");
    const requestsPath = path.join(dir, "requests.json");
    const preloadPath = path.join(dir, "fetch.mjs");
    const client = {
      id: "38ac7c76-8ea5-4a6e-9cd2-c7668df0f534",
      cuit: "30000000007",
      razon_social: "Cliente sintético",
      condicion_iva: "responsable_inscripto",
      ultima_factura: "00000001",
      fecha_ultima_factura: "2026-10-01",
      activo: true,
    };
    await writeFile(pdfPath, pdf);
    await writeFile(reviewPath, JSON.stringify({
      clientes: [client],
      facturas: [{
        archivo: "30709154083_001_00002_00000001.pdf",
        path: pdfPath,
        sha256: hash(pdf),
        numero: "00000001",
        punto_venta: "00002",
        tipo_comprobante: "FA",
        moneda: "ARS",
        fecha: "2026-10-01",
        periodo_desde: "2026-09-01",
        periodo_hasta: "2026-09-30",
        cuit: client.cuit,
        anio_historico: 2026,
        neto: "100.00",
        iva: "21.00",
        otros_tributos: "0.00",
        total: "121.00",
        estado_cobro: "Cobrada",
        naturaleza: "Servicios",
        observaciones: [],
        items: [{ cantidad: "1.00", precio_unitario: "100.00", bonificacion_pct: "0.00",
          neto: "100.00", descripcion: "Original", descripcion_para_carga: "Revisada" }],
      }],
    }));
    await writeFile(preloadPath, `
      import assert from "node:assert/strict";
      import { writeFileSync } from "node:fs";
      const requests = [];
      const json = (body) => new Response(JSON.stringify(body), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
      globalThis.fetch = async (input, options) => {
        const url = new URL(typeof input === "string" ? input : input.url);
        const method = options?.method ?? input.method ?? "GET";
        assert.equal(url.origin, "https://historical-cli-test.supabase.co");
        requests.push({ method, path: url.pathname });
        writeFileSync(${JSON.stringify(requestsPath)}, JSON.stringify(requests));
        if (method === "GET" && url.pathname === "/rest/v1/clientes") return json([${JSON.stringify(client)}]);
        if (method === "GET" && ["/rest/v1/facturas_historicas", "/rest/v1/documentos"].includes(url.pathname)) return json([]);
        if (method === "HEAD" && url.pathname.startsWith("/storage/v1/object/")) return new Response(null, { status: 200 });
        if (method === "GET" && url.pathname.startsWith("/storage/v1/object/")) return new Response(Buffer.from(${JSON.stringify(pdf.toString('base64'))}, "base64"));
        if (method === "POST" && url.pathname === "/rest/v1/rpc/importar_factura_historica") {
          const { p_datos: data } = JSON.parse(options.body);
          assert.equal(data.cliente_id, ${JSON.stringify(client.id)});
          assert.equal(data.items[0].descripcion, "Revisada");
          assert.equal(data.fuente.items[0].descripcion, "Original");
          assert.equal(data.fuente.items[0].descripcion_para_carga, "Revisada");
          assert.equal(Object.hasOwn(data, "source"), false);
          return json({ factura_id: "factura-sintetica", presupuesto_id: "presupuesto-sintetico",
            numero_presupuesto: 123, ya_importada: true });
        }
        throw new Error("Solicitud inesperada: " + method + " " + url.pathname);
      };
    `);
    const args = [
      "--import", preloadPath, script,
      spanishFlags ? "--revision" : "--review", reviewPath,
      "--project-ref", "historical-cli-test",
      "--lote", "prueba-cli",
      spanishFlags ? "--informe" : "--report", reportPath,
    ];
    if (apply) args.push(spanishFlags ? "--esperados" : "--expected", "1,1,0", "--apply");
    const { stdout } = await exec(process.execPath, args, {
      env: { ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "https://historical-cli-test.supabase.co",
        SUPABASE_SECRET_KEY: "clave-sintetica",
      },
      timeout: 10000,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const requests = JSON.parse(await readFile(requestsPath, "utf8"));
    assert.equal(report.proyecto, "historical-cli-test");
    assert.equal(report.revision_sha256, hash(await readFile(reviewPath)));
    assert.deepEqual(report.control.clientes, { total: 1, existentes: 1, nuevos: 0 });
    assert.equal(report.control.migracion_pendiente, false);
    if (apply) {
      assert.equal(report.estado, "completo");
      assert.match(report.finalizado_at, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(report.facturas[0].numero_presupuesto, 123);
      assert.equal(report.facturas[0].ya_importada, true);
      assert.equal(report.facturas[0].archivo_path, report.archivos[0].path);
      assert.match(stdout, /00002-00000001 reutilizada/);
    } else {
      assert.equal(report.estado, "preparado");
      assert.ok(requests.every(({ method }) => method === "GET"));
      assert.deepEqual(report.facturas, []);
      assert.match(stdout, /Simulación guardada/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

it("la CLI simula con flags ingleses y guarda un informe compatible sin escrituras remotas", () =>
  runImport({ apply: false, spanishFlags: false }));

it("la CLI acepta flags documentados en español y conserva el contrato RPC y de informe", () =>
  runImport({ apply: true, spanishFlags: true }));
