import { createHash } from 'node:crypto'

export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const exigir = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje) }

export function centavos(valor, campo = 'importe') {
  exigir(typeof valor === 'string' && /^\d+(?:\.\d{1,2})?$/.test(valor), `${campo}: decimal inválido`)
  const [entero, decimales = ''] = valor.split('.')
  return BigInt(entero) * 100n + BigInt(decimales.padEnd(2, '0'))
}

export function decimal(valor) {
  return `${valor / 100n}.${(valor % 100n).toString().padStart(2, '0')}`
}

export function cuitValido(cuit) {
  if (!/^(20|23|24|25|26|27|30|33|34)\d{9}$/.test(cuit)) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const resto = pesos.reduce((suma, peso, i) => suma + Number(cuit[i]) * peso, 0) % 11
  return resto !== 1 && Number(cuit[10]) === (resto === 0 ? 0 : 11 - resto)
}

export function uuidEstable(texto) {
  const namespace = Buffer.from('028667250ba34f7c9f1f63d4fb58e190', 'hex')
  const bytes = createHash('sha1').update(namespace).update(texto).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 15) | 80
  bytes[8] = (bytes[8] & 63) | 128
  const h = bytes.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function claveFactura(emisor, numero) {
  return `${emisor}:FA:${numero}`
}

const nombreNormalizado = nombre => nombre.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

export function planificarClientes(preparados, existentes) {
  return preparados.map(datos => {
    const encontrado = existentes.find(cliente => cliente.cuit === datos.cuit)
    exigir(encontrado || !existentes.some(cliente => !cliente.cuit && nombreNormalizado(cliente.razon_social) === nombreNormalizado(datos.razon_social)),
      `Hay un cliente sin CUIT que podría ser ${datos.razon_social}; revisalo antes de importar`)
    return { id: encontrado?.id ?? uuidEstable(`cliente:${datos.cuit}`), datos, existente: !!encontrado }
  })
}

export function completarFactura(factura, clientes) {
  const cliente = clientes.find(cliente => cliente.datos.cuit === factura.cuit)
  exigir(cliente, `No se encontró el cliente ${factura.cuit}`)
  const datos = { ...factura.datos, cliente_id: cliente.id,
    archivo: { ...factura.datos.archivo, path: `documentos/${cliente.id}/${uuidEstable(`${cliente.id}:${factura.datos.sha256}`)}.pdf` },
  }
  return { ...factura, datos }
}

function fechaValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(fecha.valueOf()) && fecha.toISOString().slice(0, 10) === valor
}

function prepararItem(item, numero) {
  const cantidad = centavos(item.cantidad, 'cantidad')
  const precio = centavos(item.precio_unitario, 'precio unitario')
  const bonificacion = centavos(item.bonificacion_pct, 'bonificación')
  exigir(cantidad > 0n && bonificacion <= 10000n, `Cantidad o bonificación inválida en ${numero}`)
  const precioNeto = (precio * (10000n - bonificacion) + 5000n) / 10000n
  const neto = (cantidad * precioNeto + 50n) / 100n
  exigir(neto === centavos(item.neto), `El precio bonificado no concilia en ${numero}`)
  const descripcion = item.descripcion_para_carga ?? item.descripcion
  exigir(typeof descripcion === 'string' && descripcion.trim() !== '', `Falta descripción en ${numero}`)
  return { descripcion, cantidad: decimal(cantidad), precio_unitario: decimal(precioNeto), unidad: 'UNIDAD' }
}

function prepararCliente(cliente) {
  exigir(cuitValido(cliente.cuit), `CUIT inválido: ${cliente.cuit}`)
  exigir(typeof cliente.razon_social === 'string' && cliente.razon_social.trim(), 'Falta razón social')
  exigir(['responsable_inscripto', 'monotributo', 'exento', 'consumidor_final'].includes(cliente.condicion_iva), `IVA inválido en ${cliente.cuit}`)
  return {
    cuit: cliente.cuit, razon_social: cliente.razon_social,
    condicion_iva: cliente.condicion_iva, direccion: cliente.direccion ?? '',
    localidad: cliente.localidad ?? '', provincia: cliente.provincia ?? '',
    email: cliente.email ?? '', telefono: cliente.telefono ?? '', condicion_pago: cliente.condicion_pago ?? '',
    notas: `Datos fiscales tomados de factura 00002-${cliente.ultima_factura} del ${cliente.fecha_ultima_factura}. Contactos y condiciones de pago a completar.`,
  }
}

const CAMPOS_FUENTE = [
  'archivo', 'sha256', 'numero', 'punto_venta', 'tipo_comprobante', 'moneda', 'fecha', 'fecha_vencimiento',
  'cuit', 'razon_social', 'condicion_iva_original', 'domicilio_original', 'condicion_venta',
  'periodo_desde_original', 'periodo_hasta_original', 'periodo_desde', 'periodo_hasta',
  'neto', 'iva', 'otros_tributos', 'total', 'estado_cobro', 'fuente_estado_cobro',
  'anio_historico', 'criterio_fecha_servicio', 'ajustes_anio_confirmados', 'observaciones_fechas_resueltas',
  'referencias_oc', 'otras_referencias', 'internos_mencionados', 'items', 'detalle_completo', 'detalle_para_carga',
]

function prepararFactura(factura, archivos, lote) {
  const archivo = archivos.get(factura.path)
  exigir(Buffer.isBuffer(archivo) && archivo.length > 5 && archivo.length <= 10485760, `PDF ausente o tamaño inválido: ${factura.archivo}`)
  exigir(archivo.subarray(0, 5).toString() === '%PDF-', `El archivo no es PDF: ${factura.archivo}`)
  exigir(hash(archivo) === factura.sha256, `El hash no coincide: ${factura.archivo}`)
  const identidad = /^(\d{11})_001_(\d{5})_(\d{8})\.pdf$/.exec(factura.archivo)
  exigir(identidad && cuitValido(identidad[1]), `Nombre de comprobante inválido: ${factura.archivo}`)
  exigir(identidad[2] === factura.punto_venta && identidad[3] === factura.numero, `El número no coincide con el PDF: ${factura.archivo}`)
  exigir(factura.tipo_comprobante === 'FA' && factura.moneda === 'ARS', `Comprobante no compatible: ${factura.archivo}`)
  exigir(factura.estado_cobro === 'Cobrada', `Cobro sin confirmar: ${factura.archivo}`)
  exigir(fechaValida(factura.fecha), `Fecha inválida en ${factura.numero}`)
  exigir(!factura.fecha_vencimiento || fechaValida(factura.fecha_vencimiento), `Vencimiento inválido en ${factura.numero}`)
  exigir(fechaValida(factura.periodo_desde) && fechaValida(factura.periodo_hasta) && factura.periodo_desde <= factura.periodo_hasta, `Período inválido en ${factura.numero}`)
  const neto = centavos(factura.neto)
  const iva = centavos(factura.iva)
  const tributos = centavos(factura.otros_tributos)
  const monto = centavos(factura.total)
  exigir(monto > 0n && monto <= 99999999999999n && neto + iva + tributos === monto, `El total no concilia en ${factura.numero}`)
  exigir(Array.isArray(factura.items) && factura.items.length > 0, `Faltan ítems en ${factura.numero}`)
  const items = factura.items.map(item => prepararItem(item, factura.numero))
  exigir(factura.items.reduce((suma, item) => suma + centavos(item.neto), 0n) === neto, `Los ítems no concilian en ${factura.numero}`)
  const numero = `${factura.punto_venta}-${factura.numero}`
  const notas = [
    `Histórico ${factura.anio_historico}: reconstruido desde factura ${numero}.`,
    'Cobrado antes de la carga por confirmación del usuario. Fecha y comprobante de cobro no informados.',
    'Fecha de aprobación interna: emisión de factura como referencia de reconstrucción; aprobación original no informada.',
    `Período de referencia: ${factura.periodo_desde} a ${factura.periodo_hasta}.`,
    ...(factura.ajustes_anio_confirmados ?? []),
    ...(factura.observaciones_fechas_resueltas ?? []).map(texto => `Se usa la cabecera. Observación original: ${texto}`),
  ].join('\n')
  exigir(notas.length <= 2000, `Notas demasiado largas en ${numero}`)
  return {
    cuit: factura.cuit, ruta_local: factura.path, clave: claveFactura(identidad[1], numero),
    datos: {
      emisor_cuit: identidad[1], numero, fecha: factura.fecha, fecha_vencimiento: factura.fecha_vencimiento ?? null,
      neto: decimal(neto), iva: decimal(iva), otros_tributos: decimal(tributos), monto: decimal(monto),
      periodo_desde: factura.periodo_desde, periodo_hasta: factura.periodo_hasta,
      items, archivo: { nombre_original: factura.archivo }, sha256: factura.sha256, lote,
      confirmacion_cobro: factura.fuente_estado_cobro ?? 'El usuario confirmó que todas las facturas históricas están cobradas; fecha de cobro no informada.',
      notas, fuente: Object.fromEntries(CAMPOS_FUENTE.filter(campo => factura[campo] !== undefined).map(campo => [campo, factura[campo]])),
    },
  }
}

export function prepararRevision(revision, { archivos, lote }) {
  exigir(typeof lote === 'string' && lote.trim().length > 0, 'Falta el lote de importación')
  exigir(Array.isArray(revision.clientes) && Array.isArray(revision.facturas), 'Revisión inválida')
  const clientes = revision.clientes.map(prepararCliente)
  const cuits = new Set(clientes.map(cliente => cliente.cuit))
  exigir(cuits.size === clientes.length, 'Hay clientes duplicados por CUIT')
  const facturas = []
  const excluidas = []
  for (const factura of revision.facturas) {
    exigir(cuits.has(factura.cuit), `No está el cliente de factura ${factura.numero}`)
    exigir(Array.isArray(factura.observaciones), `Falta la revisión de factura ${factura.numero}`)
    if (factura.observaciones.length || factura.naturaleza !== 'Servicios') {
      excluidas.push({ numero: factura.numero, cuit: factura.cuit, motivo: factura.observaciones.join(' / ') || factura.naturaleza })
      continue
    }
    facturas.push(prepararFactura(factura, archivos, lote))
  }
  exigir(new Set(facturas.map(factura => factura.clave)).size === facturas.length, 'Hay comprobantes repetidos')
  exigir(facturas.length > 0, 'No hay facturas sin pendientes para cargar')
  const total = facturas.reduce((suma, factura) => suma + centavos(factura.datos.monto), 0n)
  return { clientes, facturas, excluidas, total: decimal(total), lote }
}
