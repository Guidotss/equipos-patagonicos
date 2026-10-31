import { readFile } from "node:fs/promises";
import { hash } from './prepare.mjs';

function result(response, contexto) {
  if (response.error)
    throw new Error(`${contexto}: ${response.error.message}`);
  return response.data;
}

async function existsFile(bucket, path) {
  const response = await bucket.exists(path);
  const status = Number(
    response.error?.status ??
      response.error?.originalError?.status ??
      response.error?.statusCode,
  );
  if (response.data === false && [400, 404].includes(status)) return false;
  return result(response, "Verificar PDF existente");
}

async function uploadYVerify(supabase, invoice) {
  const bucket = supabase.storage.from("documentos");
  const path = invoice.datos.archivo.path;
  const bytes = await readFile(invoice.ruta_local);
  if (hash(bytes) !== invoice.datos.sha256)
    throw new Error(`El PDF cambió antes de subir: ${invoice.datos.numero}`);
  const exists = await existsFile(bucket, path);
  if (!exists) {
    const upload = await bucket.upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (
      upload.error &&
      !["409", "Duplicate"].includes(String(upload.error.statusCode))
    )
      result(upload, "Subir PDF");
  }
  const archivo = result(
    await bucket.download(path),
    "Verificar PDF subido",
  );
  if (hash(Buffer.from(await archivo.arrayBuffer())) !== invoice.datos.sha256)
    throw new Error(`El PDF almacenado no coincide: ${invoice.datos.numero}`);
}

export async function registerInvoice({
  supabase,
  factura: invoice,
  report,
  guardar: save,
}) {
  const archivo = {
    numero: invoice.datos.numero,
    clave: invoice.clave,
    path: invoice.datos.archivo.path,
    sha256: invoice.datos.sha256,
    estado: "previsto",
  };
  report.archivos.push(archivo);
  await save();
  try {
    await uploadYVerify(supabase, invoice);
    archivo.estado = "verificado";
    await save();
    const registro = result(
      await supabase.rpc("importar_factura_historica", {
        p_datos: invoice.datos,
      }),
      `Importar ${invoice.datos.numero}`,
    );
    report.facturas.push({
      numero: invoice.datos.numero,
      clave: invoice.clave,
      sha256: invoice.datos.sha256,
      archivo_path: archivo.path,
      ...registro,
    });
    archivo.estado = "registrado";
    await save();
    return registro;
  } catch (error) {
    archivo.ultimo_error = error.message;
    await save();
    throw error;
  }
}
