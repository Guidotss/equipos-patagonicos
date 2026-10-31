import { readFile } from "node:fs/promises";
import { hash } from "./preparar.mjs";

function resultado(respuesta, contexto) {
  if (respuesta.error)
    throw new Error(`${contexto}: ${respuesta.error.message}`);
  return respuesta.data;
}

async function existeArchivo(bucket, ruta) {
  const respuesta = await bucket.exists(ruta);
  const status = Number(
    respuesta.error?.status ??
      respuesta.error?.originalError?.status ??
      respuesta.error?.statusCode,
  );
  if (respuesta.data === false && [400, 404].includes(status)) return false;
  return resultado(respuesta, "Verificar PDF existente");
}

async function subirYVerificar(supabase, factura) {
  const bucket = supabase.storage.from("documentos");
  const ruta = factura.datos.archivo.path;
  const bytes = await readFile(factura.ruta_local);
  if (hash(bytes) !== factura.datos.sha256)
    throw new Error(`El PDF cambió antes de subir: ${factura.datos.numero}`);
  const existe = await existeArchivo(bucket, ruta);
  if (!existe) {
    const subida = await bucket.upload(ruta, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (
      subida.error &&
      !["409", "Duplicate"].includes(String(subida.error.statusCode))
    )
      resultado(subida, "Subir PDF");
  }
  const archivo = resultado(
    await bucket.download(ruta),
    "Verificar PDF subido",
  );
  if (hash(Buffer.from(await archivo.arrayBuffer())) !== factura.datos.sha256)
    throw new Error(`El PDF almacenado no coincide: ${factura.datos.numero}`);
}

export async function registrarFactura({
  supabase,
  factura,
  informe,
  guardar,
}) {
  const archivo = {
    numero: factura.datos.numero,
    clave: factura.clave,
    path: factura.datos.archivo.path,
    sha256: factura.datos.sha256,
    estado: "previsto",
  };
  informe.archivos.push(archivo);
  await guardar();
  try {
    await subirYVerificar(supabase, factura);
    archivo.estado = "verificado";
    await guardar();
    const registro = resultado(
      await supabase.rpc("importar_factura_historica", {
        p_datos: factura.datos,
      }),
      `Importar ${factura.datos.numero}`,
    );
    informe.facturas.push({
      numero: factura.datos.numero,
      clave: factura.clave,
      sha256: factura.datos.sha256,
      archivo_path: archivo.path,
      ...registro,
    });
    archivo.estado = "registrado";
    await guardar();
    return registro;
  } catch (error) {
    archivo.ultimo_error = error.message;
    await guardar();
    throw error;
  }
}
