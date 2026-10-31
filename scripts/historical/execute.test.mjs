import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hash } from "./preparar.mjs";
import { registrarFactura } from "./ejecutar.mjs";
import { createClient } from "@supabase/supabase-js";

async function conFactura(prueba) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "historico-unidad-"));
  const bytes = Buffer.from("%PDF-1.4 archivo sintético");
  const local = path.join(dir, "factura.pdf");
  await writeFile(local, bytes);
  const factura = {
    clave: "prueba:FA:00002-00000001",
    ruta_local: local,
    datos: {
      numero: "00002-00000001",
      sha256: hash(bytes),
      archivo: { path: "documentos/cliente/archivo.pdf" },
    },
  };
  try {
    await prueba(factura, bytes);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

it("conserva ruta y hash del archivo verificado si falla el registro de factura", async () =>
  conFactura(async (factura, bytes) => {
    const informe = { archivos: [], facturas: [] };
    const versiones = [];
    const guardar = async () => {
      versiones.push(structuredClone(informe));
    };
    const bucket = {
      exists: async () => ({ data: false }),
      upload: async () => ({ data: {} }),
      download: async () => ({ data: new Blob([bytes]) }),
    };
    const supabase = {
      storage: { from: () => bucket },
      rpc: async () => {
        assert.equal(versiones.at(-1).archivos[0].estado, "verificado");
        return { error: { message: "Fallo de registro simulado" } };
      },
    };
    await assert.rejects(
      registrarFactura({ supabase, factura, informe, guardar }),
      /Fallo de registro simulado/,
    );
    assert.equal(versiones.at(-1).archivos[0].path, factura.datos.archivo.path);
    assert.equal(versiones.at(-1).archivos[0].sha256, factura.datos.sha256);
    assert.equal(versiones.at(-1).archivos[0].estado, "verificado");
    assert.equal(informe.facturas.length, 0);
  }));

it("no registra una factura si el PDF almacenado tiene otro hash", async () =>
  conFactura(async (factura) => {
    const informe = { archivos: [], facturas: [] };
    let llamadas = 0;
    const bucket = {
      exists: async () => ({ data: true }),
      download: async () => ({ data: new Blob(["otro archivo"]) }),
    };
    const supabase = {
      storage: { from: () => bucket },
      rpc: async () => {
        llamadas++;
        return { data: {} };
      },
    };
    await assert.rejects(
      registrarFactura({ supabase, factura, informe, guardar: async () => {} }),
      /no coincide/,
    );
    assert.equal(llamadas, 0);
    assert.equal(informe.archivos[0].estado, "previsto");
    assert.match(informe.archivos[0].ultimo_error, /no coincide/);
  }));

it("sube un PDF ausente con el contrato 404 del SDK real y verifica antes de registrar", async () =>
  conFactura(async (factura, bytes) => {
    const metodos = [];
    const cliente = createClient(
      "https://ejemplo.supabase.co",
      "clave-sintetica",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (_url, opciones) => {
            const metodo = opciones?.method ?? "GET";
            metodos.push(metodo);
            if (metodo === "HEAD") return new Response(null, { status: 404 });
            if (metodo === "POST")
              return new Response(
                JSON.stringify({
                  Key: factura.datos.archivo.path,
                  Id: "archivo-sintetico",
                }),
                { status: 200 },
              );
            if (metodo === "GET")
              return new Response(bytes, {
                status: 200,
                headers: { "Content-Type": "application/pdf" },
              });
            throw new Error(`Método inesperado: ${metodo}`);
          },
        },
      },
    );
    const informe = { archivos: [], facturas: [] };
    const supabase = {
      storage: cliente.storage,
      rpc: async () => {
        assert.equal(informe.archivos[0].estado, "verificado");
        metodos.push("RPC");
        return {
          data: {
            factura_id: "factura-sintetica",
            presupuesto_id: "presupuesto-sintetico",
            ya_importada: false,
          },
        };
      },
    };
    await registrarFactura({
      supabase,
      factura,
      informe,
      guardar: async () => {},
    });
    assert.deepEqual(metodos, ["HEAD", "POST", "GET", "RPC"]);
    assert.equal(informe.archivos[0].estado, "registrado");
    assert.equal(informe.facturas.length, 1);
  }));

it("mantiene el bloqueo ante errores de autorización al consultar el archivo", async () =>
  conFactura(async (factura) => {
    let subidas = 0;
    const supabase = {
      storage: {
        from: () => ({
          exists: async () => ({
            data: false,
            error: { status: 403, message: "Sin permiso" },
          }),
          upload: async () => {
            subidas++;
            return { data: {} };
          },
        }),
      },
    };
    const informe = { archivos: [], facturas: [] };
    await assert.rejects(
      registrarFactura({ supabase, factura, informe, guardar: async () => {} }),
      /Sin permiso/,
    );
    assert.equal(subidas, 0);
  }));
