// tests/integration/cotizaciones-editor.test.ts
// Lo que agrega el editor de cotizaciones (plan 3B): guardar con versión y la búsqueda de la lista.
// La Task 4 suma acá los tests del servicio.
import { extractText, getDocumentProxy, getResolvedPDFJS } from 'unpdf'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { payloadGuardar, type EstadoEditor, type PayloadGuardar } from '@/lib/cotizaciones/editor'
import {
  ErrorCotizacion,
  aprobarCotizacion,
  borrarCotizacion,
  duplicarCotizacion,
  enviarCotizacion,
  finalizarPresupuesto,
  guardarCotizacion,
  pdfParaMostrar,
  reabrirCotizacion,
  rechazarCotizacion,
  revertirAprobacion,
  vistaPrevia,
} from '@/lib/cotizaciones/servicio'
import { hoyArgentina, sumarDias } from '@/lib/format/fechas'
import { AMARILLO_VARIABLE } from '@/lib/pdf/estilos'
import { ITEMS_JORNADA, idsDeEjemplo, versionDe } from './cotizaciones-helpers'
import { adminClient, borrarUsuario, contraTransaccionEnCurso, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
/** Letras al azar para buscar por texto: un dígito en la búsqueda también busca por número. */
const CLAVE = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => String.fromCharCode(97 + (b % 26))).join('')
const CAMBIO = 'La cotización cambió desde que la abriste; volvé a intentarlo'

let activo: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  try {
    // Los PDF que suben enviar y aprobar (tests del servicio): Storage no se limpia con SQL.
    const archivos = await sql<{ name: string }>(
      `select o.name from storage.objects o
       where o.bucket_id = 'documentos' and exists (
         select 1 from public.cotizaciones c where c.notas = $1 and o.name like 'cotizaciones/' || c.id || '/%')`,
      [MARCA],
    )
    if (archivos.length) await adminClient().storage.from('documentos').remove(archivos.map((a) => a.name))
    await sql('delete from public.cotizaciones where notas = $1', [MARCA])
    await sql('delete from public.clientes where notas = $1', [MARCA])
  } finally {
    for (const u of [activo, inactivo]) await borrarUsuario(u.id)
  }
})

function datosBase(extra: Record<string, unknown> = {}) {
  return {
    cliente_id: ids.cliente_id,
    formato: 'jornada',
    fecha: '2026-10-22',
    asunto: 'Primera versión',
    notas: MARCA,
    ...extra,
  }
}

async function nueva(): Promise<string> {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: ITEMS_JORNADA })
  if (error) throw new Error('No se pudo guardar la cotización: ' + error.message)
  return data
}

/** Actualiza la cotización con otro asunto mandando `version` como la versión leída (undefined: sin versión). */
function guardar(id: string, version: string | undefined, asunto: string, extra: Record<string, unknown> = {}) {
  return activo.client.rpc('guardar_cotizacion', {
    p_id: id,
    p_updated_at: version,
    p_datos: datosBase({ asunto, ...extra }),
    p_items: ITEMS_JORNADA,
  })
}

async function fila(id: string) {
  const [resultado] = await sql<{ asunto: string; estado: string; fecha: string }>(
    `select asunto, estado, to_char(fecha, 'YYYY-MM-DD') as fecha from public.cotizaciones where id = $1`,
    [id],
  )
  return resultado
}

describe('guardar_cotizacion con versión', () => {
  it('crear no pide versión; actualizar exige la que se leyó y la cambia', async () => {
    const id = await nueva()
    const sinVersion = await guardar(id, undefined, 'Sin versión')
    expect(sinVersion.error).toMatchObject({ code: 'P0001', message: 'Falta la versión de la cotización' })
    expect((await fila(id)).asunto).toBe('Primera versión')

    const leida = await versionDe(activo.client, id)
    expect((await guardar(id, leida, 'Segunda versión')).error).toBeNull()
    expect((await fila(id)).asunto).toBe('Segunda versión')
    expect(await versionDe(activo.client, id)).not.toBe(leida)
  })

  it('con una versión vieja no pisa lo que guardó otro', async () => {
    const id = await nueva()
    const leida = await versionDe(activo.client, id)
    expect((await guardar(id, leida, 'Guardado en otra pestaña')).error).toBeNull()

    const { error } = await guardar(id, leida, 'Guardado con la versión vieja')
    expect(error).toMatchObject({ code: 'P0001', message: CAMBIO })
    expect((await fila(id)).asunto).toBe('Guardado en otra pestaña')

    expect((await guardar(id, await versionDe(activo.client, id), 'Después de recargar')).error).toBeNull()
    expect((await fila(id)).asunto).toBe('Después de recargar')
  })

  it('compara la versión al milisegundo: pasarla por un Date de JS no la invalida', async () => {
    const id = await nueva()
    const enMilisegundos = new Date(await versionDe(activo.client, id)).toISOString()
    expect((await guardar(id, enMilisegundos, 'Con la versión de un Date')).error).toBeNull()
  })

  it('dos guardados a la vez con la misma versión: el segundo espera y no pisa al primero', async () => {
    const id = await nueva()
    const leida = await versionDe(activo.client, id)
    const { error } = await contraTransaccionEnCurso(
      activo.id,
      'select public.guardar_cotizacion($1::jsonb, $2::jsonb, $3::uuid, $4::timestamptz)',
      [JSON.stringify(datosBase({ asunto: 'El que guardó primero' })), JSON.stringify(ITEMS_JORNADA), id, leida],
      () => guardar(id, leida, 'El que guardó segundo'),
    )
    expect(error).toMatchObject({ code: 'P0001', message: CAMBIO })
    expect((await fila(id)).asunto).toBe('El que guardó primero')
  })

  it('conserva lo de antes: una enviada editada sigue enviada y sin fecha conserva la suya', async () => {
    const id = await nueva()
    const enviada = await activo.client.rpc('marcar_enviada', {
      p_id: id,
      p_pdf_path: `cotizaciones/${id}/enviada.pdf`,
      p_updated_at: await versionDe(activo.client, id),
    })
    expect(enviada.error).toBeNull()

    const { error } = await guardar(id, await versionDe(activo.client, id), 'Editada después de enviar', { fecha: null })
    expect(error).toBeNull()
    expect(await fila(id)).toEqual({ asunto: 'Editada después de enviar', estado: 'enviada', fecha: '2026-10-22' })
  })

  it('una aprobada o una que no existe no se editan, aunque manden una versión', async () => {
    const id = await nueva()
    const aprobada = await activo.client.rpc('aprobar_cotizacion', {
      p_id: id,
      p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
      p_updated_at: await versionDe(activo.client, id),
    })
    expect(aprobada.error).toBeNull()

    const { error } = await guardar(id, await versionDe(activo.client, id), 'No debería guardarse')
    expect(error).toMatchObject({ code: 'P0001', message: 'La cotización no existe o ya no se puede editar' })
    const inexistente = await guardar(crypto.randomUUID(), new Date().toISOString(), 'No debería guardarse')
    expect(inexistente.error?.message).toBe('La cotización no existe o ya no se puede editar')
  })

  it('sin la clave notas conserva las notas (el editor no las manda)', async () => {
    const id = await nueva()
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_updated_at: await versionDe(activo.client, id),
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', asunto: 'Sin notas en el payload' },
      p_items: ITEMS_JORNADA,
    })
    expect(error).toBeNull()
    const [guardada] = await sql<{ asunto: string; notas: string }>(
      'select asunto, notas from public.cotizaciones where id = $1',
      [id],
    )
    expect(guardada).toEqual({ asunto: 'Sin notas en el payload', notas: MARCA })
  })

  it('un usuario inactivo no puede actualizar', async () => {
    const id = await nueva()
    const { error } = await inactivo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_updated_at: await versionDe(activo.client, id),
      p_datos: datosBase({ asunto: 'Usuario inactivo' }),
      p_items: ITEMS_JORNADA,
    })
    expect(error?.code).toBe('42501')
    expect((await fila(id)).asunto).toBe('Primera versión')
  })
})

describe('buscar_cotizaciones', () => {
  type Insertada = { id: string; numero: number }
  const hoy = hoyArgentina()
  let cliente: string
  let filas: Record<'borrador' | 'aprobada' | 'rechazada' | 'vencida' | 'enviada' | 'otroCliente', Insertada>

  type Campos = {
    estado: string
    fecha: string
    asunto?: string
    cliente?: string
    /** null: sin equipo (si no viene, la grúa de 40 TN de la semilla). */
    equipo?: string | null
    datos?: Record<string, string>
  }

  async function insertar(campos: Campos): Promise<Insertada> {
    const aprobada = campos.estado === 'aprobada'
    const [insertada] = await sql<{ id: string; numero: string }>(
      `insert into public.cotizaciones
         (cliente_id, formato, equipo_id, notas, estado, fecha, validez_dias, asunto, fecha_aprobacion,
          presupuesto_estado, datos)
       values ($1, 'jornada', $2, $3, $4, $5, 30, $6, $7, $8, $9)
       returning id, numero`,
      [
        campos.cliente ?? cliente,
        campos.equipo === undefined ? ids.equipo_id : campos.equipo,
        MARCA,
        campos.estado,
        campos.fecha,
        campos.asunto ?? '',
        aprobada ? campos.fecha : null,
        aprobada ? 'en_curso' : null,
        campos.datos ?? {},
      ],
    )
    return { id: insertada.id, numero: Number(insertada.numero) }
  }

  beforeAll(async () => {
    const [nuevo] = await sql<{ id: string }>(
      'insert into public.clientes (razon_social, notas) values ($1, $2) returning id',
      [`Grúas Ñandú ${CLAVE} S.A.`, MARCA],
    )
    cliente = nuevo.id
    // En orden de número. Las fechas fijas quedan lejos de hoy y de hoy - 40 para que el filtro de fechas no las mezcle.
    filas = {
      borrador: await insertar({ estado: 'borrador', fecha: '2025-03-01' }),
      aprobada: await insertar({ estado: 'aprobada', fecha: '2025-03-05' }),
      rechazada: await insertar({ estado: 'rechazada', fecha: '2025-03-10' }),
      vencida: await insertar({ estado: 'enviada', fecha: sumarDias(hoy, -40) }),
      enviada: await insertar({ estado: 'enviada', fecha: hoy }),
      otroCliente: await insertar({
        estado: 'borrador',
        fecha: '2025-03-01',
        cliente: ids.cliente_id,
        asunto: `Montaje ${CLAVE} en Añelo`,
      }),
    }
  })

  async function buscar(args: { texto?: string; estado?: string; cliente?: string; desde?: string; hasta?: string }) {
    const { data, error } = await activo.client.rpc('buscar_cotizaciones', args)
    if (error) throw error
    return data.map((encontrada) => encontrada.numero)
  }

  const numeros = (...nombres: (keyof typeof filas)[]) => nombres.map((nombre) => filas[nombre].numero)

  it('sin texto ni estado devuelve todas, de la más nueva a la más vieja por número', async () => {
    expect(await buscar({ cliente })).toEqual(numeros('enviada', 'vencida', 'rechazada', 'aprobada', 'borrador'))
  })

  it('busca sin acentos ni mayúsculas en la razón social y en el asunto', async () => {
    const todas = numeros('enviada', 'vencida', 'rechazada', 'aprobada', 'borrador')
    expect(await buscar({ texto: `NANDU ${CLAVE.toUpperCase()}` })).toEqual(todas)
    expect(await buscar({ texto: `ñandú ${CLAVE}` })).toEqual(todas)
    expect(await buscar({ texto: `${CLAVE} en ANELO` })).toEqual(numeros('otroCliente'))
  })

  it('busca sin acentos en la ubicación y en el nombre del equipo (lo que muestra la columna Trabajo)', async () => {
    const enAnelo = await insertar({
      estado: 'borrador',
      fecha: '2025-03-01',
      cliente: ids.cliente_id,
      equipo: null,
      datos: { ubicacion: `Locación ${CLAVE}, Añelo` },
    })
    expect(await buscar({ texto: `${CLAVE.toUpperCase()}, anelo` })).toEqual([enAnelo.numero])

    // Todas las del cliente tienen la grúa de 40 TN, y ni su razón social ni su asunto dicen "grúa telescópica".
    const todas = numeros('enviada', 'vencida', 'rechazada', 'aprobada', 'borrador')
    expect(await buscar({ texto: 'GRUA TELESCOPICA xcmg qy70k', cliente })).toEqual(todas)
    // Una sin equipo no aparece buscando el equipo.
    const conEquipo = await buscar({ texto: 'qy70k', cliente: ids.cliente_id })
    expect(conEquipo).toContain(filas.otroCliente.numero)
    expect(conEquipo).not.toContain(enAnelo.numero)
  })

  it('busca por el comienzo del número, no por cualquier parte', async () => {
    const numero = String(filas.borrador.numero)
    expect(await buscar({ texto: `N° ${numero}`, cliente })).toEqual(numeros('borrador'))
    expect(await buscar({ texto: numero.slice(0, -1), cliente })).toContain(filas.borrador.numero)
    expect(await buscar({ texto: numero.slice(1), cliente })).toEqual([])
  })

  it('los dígitos de un texto que no es solo un número no buscan por número', async () => {
    // Todos los números empiezan con 1: si "Montaje … 1" buscara por número, traería todas las cotizaciones.
    const montaje = await insertar({
      estado: 'borrador',
      fecha: '2025-03-01',
      cliente: ids.cliente_id,
      asunto: `Montaje ${CLAVE} 1`,
    })
    expect(await buscar({ texto: `Montaje ${CLAVE} 1` })).toEqual([montaje.numero])
  })

  it('filtra por estado como la lista: "enviada" son las que están al día y "vencida" las otras', async () => {
    expect(await buscar({ cliente, estado: 'borrador' })).toEqual(numeros('borrador'))
    expect(await buscar({ cliente, estado: 'enviada' })).toEqual(numeros('enviada'))
    expect(await buscar({ cliente, estado: 'vencida' })).toEqual(numeros('vencida'))
    expect(await buscar({ cliente, estado: 'aprobada' })).toEqual(numeros('aprobada'))
    expect(await buscar({ cliente, estado: 'rechazada' })).toEqual(numeros('rechazada'))
  })

  it('filtra por rango de fechas, con los dos extremos incluidos', async () => {
    expect(await buscar({ cliente, desde: '2025-03-05', hasta: '2025-03-10' })).toEqual(numeros('rechazada', 'aprobada'))
    expect(await buscar({ cliente, hasta: '2025-03-01' })).toEqual(numeros('borrador'))
    expect(await buscar({ cliente, desde: hoy })).toEqual(numeros('enviada'))
  })

  it('pagina y cuenta como la lista (PostgREST) y deja embeber el equipo', async () => {
    const { data, count, error } = await activo.client
      .rpc('buscar_cotizaciones', { cliente }, { count: 'exact' })
      .select('id, numero, estado, vencida, cliente_razon_social, equipo:equipos(nombre, capacidad_tn, descripcion)')
      .range(2, 3)
    expect(error).toBeNull()
    expect(count).toBe(5)
    expect(data!.map((encontrada) => encontrada.numero)).toEqual(numeros('rechazada', 'aprobada'))
    expect(data![0]).toMatchObject({
      cliente_razon_social: `Grúas Ñandú ${CLAVE} S.A.`,
      equipo: { nombre: 'Grúa telescópica XCMG QY70K-1 40 TN' },
    })
  })

  it('un usuario inactivo no ve nada', async () => {
    const { data, error } = await inactivo.client.rpc('buscar_cotizaciones', { cliente })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

// --- Servicio (Task 4) ---

const VERSION_VIEJA = '2020-01-01T00:00:00.000Z'

/** El estado del editor de una cotización por jornada completa (sin guardar), con lo que cambie cada test. */
function estadoEditor(cambios: Partial<EstadoEditor> = {}): EstadoEditor {
  return {
    id: null,
    version: null,
    numero: null,
    estado: 'borrador',
    origen: 'app',
    cliente: { id: ids.cliente_id, razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.', cuit: null },
    contactoId: '',
    plantillaId: ids.plantilla_jornada_id,
    formato: 'jornada',
    equipoId: ids.equipo_id,
    firmanteId: ids.firmante_id,
    fecha: '2026-10-22',
    validezDias: '30',
    mostrarTotal: false,
    proximaActualizacion: '',
    asunto: 'Cotización N° {{numero}} capacidad {{capacidad}} TN',
    intro: 'Servicios de izaje en {{ubicacion}}.',
    datos: {
      ubicacion: 'Ruta 7 y Ruta 5, Neuquén',
      horario: '',
      plazo_entrega: '',
      duracion_estimada: '',
      forma_pago: '',
      disponibilidad: '',
      indice_base: '',
      proxima_actualizacion: '',
    },
    items: [
      {
        clave: 'a',
        seccion: 'Precios Jornada',
        descripcion: 'Alquiler jornada de Grúa Telescópica de {{capacidad}} TN',
        cantidad: '1',
        precio: '1.950.000',
        unidad: 'JORNADA',
      },
      {
        clave: 'b',
        seccion: 'Precios Jornada',
        descripcion: 'Movilización',
        cantidad: '1',
        precio: '2.800.000',
        unidad: 'VIAJE',
      },
    ],
    bloques: [{ clave: 'c', titulo: 'Alcance', contenido: '- Horario de 8 a 17 hs.', oculto: false }],
    reemplazaA: null,
    ...cambios,
  }
}

/**
 * El payload del editor con la marca de los tests en `notas`: el editor no manda notas (una cotización que crea
 * queda sin notas) y la limpieza de este archivo borra por notas.
 */
function payload(estado: EstadoEditor = estadoEditor()): PayloadGuardar {
  const armado = payloadGuardar(estado)
  if (!armado.ok) throw new Error('El estado del test no es válido: ' + JSON.stringify(armado.errores))
  return { ...armado.payload, p_datos: { ...armado.payload.p_datos, notas: MARCA } }
}

/** Exige que la operación se rechace con un ErrorCotizacion (mensaje para el usuario) con ese texto. */
async function rechazaCon(operacion: Promise<unknown>, mensaje: string) {
  const error = await operacion.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ErrorCotizacion)
  expect((error as Error).message).toBe(mensaje)
}

async function subidos(id: string) {
  return sql<{ name: string }>('select name from storage.objects where name like $1 order by name', [
    `cotizaciones/${id}/%`,
  ])
}

async function estadoDe(id: string) {
  const [encontrada] = await sql<{ estado: string; presupuesto_estado: string | null }>(
    'select estado, presupuesto_estado from public.cotizaciones where id = $1',
    [id],
  )
  return encontrada
}

/** Marca con MARCA una copia hecha por duplicar_cotizacion (no copia las notas) y devuelve su versión. */
async function marcarCopia(id: string): Promise<string> {
  await sql('update public.cotizaciones set notas = $1 where id = $2', [MARCA, id])
  return versionDe(activo.client, id)
}

async function textoDelPdf(pdf: Buffer): Promise<string> {
  const documento = await getDocumentProxy(new Uint8Array(pdf))
  const { text } = await extractText(documento, { mergePages: true })
  return text.replace(/\s+/g, ' ')
}

/** Los colores de relleno que usa el PDF ('#rrggbb'), leídos de las operaciones de dibujo de cada página. */
async function coloresDeRelleno(pdf: Buffer): Promise<Set<string>> {
  const { OPS } = await getResolvedPDFJS()
  const documento = await getDocumentProxy(new Uint8Array(pdf))
  const colores = new Set<string>()
  for (let numero = 1; numero <= documento.numPages; numero++) {
    const { fnArray, argsArray } = await (await documento.getPage(numero)).getOperatorList()
    fnArray.forEach((operacion, indice) => {
      if (operacion === OPS.setFillRGBColor) colores.add(String(argsArray[indice][0]).toLowerCase())
    })
  }
  return colores
}

describe('servicio: guardar', () => {
  it('crea con el payload del editor, devuelve número y versión, y actualiza solo con la versión vigente', async () => {
    const creada = await guardarCotizacion(activo.client, payload())
    expect(creada.numero).toBeGreaterThanOrEqual(112712)
    expect(creada.version).toBe(await versionDe(activo.client, creada.id))
    const precios = await sql<{ precio_unitario: string }>(
      'select precio_unitario from public.cotizacion_items where cotizacion_id = $1 order by orden',
      [creada.id],
    )
    expect(precios.map((item) => Number(item.precio_unitario))).toEqual([1950000, 2800000])

    const conAsunto = (asunto: string) => payload(estadoEditor({ asunto }))
    const segunda = await guardarCotizacion(activo.client, conAsunto('Segunda'), creada.id, creada.version)
    expect(segunda).toMatchObject({ id: creada.id, numero: creada.numero })
    expect(segunda.version).not.toBe(creada.version)

    await rechazaCon(guardarCotizacion(activo.client, conAsunto('Vieja'), creada.id, creada.version), CAMBIO)
    await rechazaCon(guardarCotizacion(activo.client, payload(), creada.id), 'Falta la versión de la cotización')
    expect((await fila(creada.id)).asunto).toBe('Segunda')
  })
})

describe('servicio: enviar y aprobar con la versión de la pantalla', () => {
  it('enviar devuelve el envío; con una versión vieja no genera ni sube nada', async () => {
    const { id, version } = await guardarCotizacion(activo.client, payload())
    await rechazaCon(enviarCotizacion(activo.client, id, VERSION_VIEJA), CAMBIO)
    expect(await subidos(id)).toEqual([])

    const { envioId } = await enviarCotizacion(activo.client, id, version)
    const [envio] = await sql<{ id: string }>('select id from public.cotizacion_envios where cotizacion_id = $1', [id])
    expect(envioId).toBe(envio.id)
    const mostrado = await pdfParaMostrar(activo.client, id, envioId)
    expect(mostrado?.pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('la versión se compara al milisegundo, como llega de un Date del navegador', async () => {
    const { id, version } = await guardarCotizacion(activo.client, payload())
    await expect(enviarCotizacion(activo.client, id, new Date(version).toISOString())).resolves.toHaveProperty('envioId')
  })

  it('aprobar con una versión vieja no genera ni sube nada', async () => {
    const { id } = await guardarCotizacion(activo.client, payload())
    await rechazaCon(aprobarCotizacion(activo.client, id, '2026-10-23', VERSION_VIEJA), CAMBIO)
    expect(await subidos(id)).toEqual([])
    expect((await estadoDe(id)).estado).toBe('borrador')
  })

  it('aprobar una renegociación devuelve la anterior si su presupuesto sigue en curso; se la puede finalizar', async () => {
    const original = await guardarCotizacion(activo.client, payload())
    expect(await aprobarCotizacion(activo.client, original.id, '2026-10-23', original.version)).toEqual({ anterior: null })

    // duplicar_cotizacion con el mismo cliente la deja como renegociación (reemplaza_a) y con fecha de hoy.
    const copia = await duplicarCotizacion(activo.client, original.id)
    const { anterior } = await aprobarCotizacion(activo.client, copia.id, undefined, await marcarCopia(copia.id))
    expect(anterior).toEqual({ id: original.id, numero: original.numero })

    await finalizarPresupuesto(activo.client, original.id)
    expect(await estadoDe(original.id)).toEqual({ estado: 'aprobada', presupuesto_estado: 'finalizado' })

    const otra = await duplicarCotizacion(activo.client, original.id)
    const versionOtra = await marcarCopia(otra.id)
    expect(await aprobarCotizacion(activo.client, otra.id, undefined, versionOtra)).toEqual({ anterior: null })
  })
})

describe('servicio: transiciones', () => {
  it('rechazar, reabrir, revertir, duplicar y borrar hacen su transición', async () => {
    const { id } = await guardarCotizacion(activo.client, payload())
    await rechazarCotizacion(activo.client, id)
    expect((await estadoDe(id)).estado).toBe('rechazada')
    await reabrirCotizacion(activo.client, id)
    expect((await estadoDe(id)).estado).toBe('borrador')

    await aprobarCotizacion(activo.client, id, '2026-10-23', await versionDe(activo.client, id))
    await revertirAprobacion(activo.client, id)
    expect(await estadoDe(id)).toEqual({ estado: 'borrador', presupuesto_estado: null })

    const copia = await duplicarCotizacion(activo.client, id)
    await marcarCopia(copia.id)
    await borrarCotizacion(activo.client, copia.id)
    expect(await sql('select 1 from public.cotizaciones where id = $1', [copia.id])).toHaveLength(0)
  })

  it('los errores de negocio llegan como ErrorCotizacion con el mensaje de la base', async () => {
    const { id } = await guardarCotizacion(activo.client, payload())
    await rechazaCon(reabrirCotizacion(activo.client, id), 'Solo se puede reabrir una cotización rechazada')
    await rechazaCon(
      revertirAprobacion(activo.client, id),
      'Solo se puede revertir la aprobación de una cotización aprobada',
    )
    await rechazaCon(finalizarPresupuesto(activo.client, id), 'El presupuesto no existe')
    await rechazaCon(duplicarCotizacion(activo.client, crypto.randomUUID()), 'La cotización no existe')

    await enviarCotizacion(activo.client, id)
    await rechazaCon(borrarCotizacion(activo.client, id), 'Solo se pueden borrar cotizaciones en borrador')
    await rechazarCotizacion(activo.client, id)
    await rechazaCon(rechazarCotizacion(activo.client, id), 'Solo se puede rechazar una cotización en borrador o enviada')
  })

  it('un error que no es de negocio llega tal cual (usuario inactivo)', async () => {
    const { id } = await guardarCotizacion(activo.client, payload())
    const error = await rechazarCotizacion(inactivo.client, id).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error).not.toBeInstanceOf(ErrorCotizacion)
    expect(error).toMatchObject({ code: '42501' })
    expect((await estadoDe(id)).estado).toBe('borrador')
  })
})

describe('servicio: vista previa', () => {
  it('dibuja el editor sin guardar, con los datos de la base y las variables pendientes en amarillo', async () => {
    const antes = await sql('select id from public.cotizaciones where notas = $1', [MARCA])
    const pdf = await vistaPrevia(activo.client, {
      estado: estadoEditor({
        cliente: { id: ids.cliente_id, razon_social: 'Lo que diga el navegador', cuit: null },
        contactoId: ids.contacto_id, // es de otro cliente (Milicic): no va
        datos: { ...estadoEditor().datos, ubicacion: '' },
        bloques: [
          ...estadoEditor().bloques,
          { clave: 'd', titulo: 'Bloque oculto', contenido: '- No tiene que salir', oculto: true },
        ],
      }),
    })

    const texto = await textoDelPdf(pdf)
    expect(texto).toContain('VERTICE SERVICIOS INTEGRALES S.R.L.')
    expect(texto).not.toContain('Lo que diga el navegador')
    expect(texto).not.toContain('Atte.')
    expect(texto).toContain('capacidad 40 TN')
    expect(texto).toContain('Servicios de izaje en {{ubicacion}}.')
    expect(texto).toContain('Horario de 8 a 17 hs.')
    expect(texto).not.toContain('No tiene que salir')
    // Sin guardar todavía no tiene número (decisión 8).
    expect(texto).toContain('Cotización N° {{numero}}')
    expect(await coloresDeRelleno(pdf)).toContain(AMARILLO_VARIABLE.toLowerCase())
    expect(await sql('select id from public.cotizaciones where notas = $1', [MARCA])).toEqual(antes)
  })

  it('con un contacto del cliente lo pone en Atte.; guardada, muestra su número', async () => {
    const [contacto] = await sql<{ nombre: string }>('select nombre from public.contactos where id = $1', [ids.contacto_id])
    const creada = await guardarCotizacion(activo.client, payload())
    const pdf = await vistaPrevia(activo.client, {
      estado: estadoEditor({
        id: creada.id,
        version: creada.version,
        numero: creada.numero,
        cliente: { id: ids.cliente_con_contacto_id, razon_social: 'Milicic S.A.', cuit: null },
        contactoId: ids.contacto_id,
      }),
    })
    const texto = await textoDelPdf(pdf)
    expect(texto).toContain(`Atte. ${contacto.nombre}`)
    expect(texto).toContain(`Cotización N° ${creada.numero}`)
  })
})

describe('servicio: PDF actual', () => {
  it('con actual, una enviada muestra lo guardado y no el último envío; una aprobada, su PDF congelado', async () => {
    const conIntro = (intro: string) => payload(estadoEditor({ intro }))
    const creada = await guardarCotizacion(activo.client, conIntro('Versión enviada en {{ubicacion}}.'))
    await enviarCotizacion(activo.client, creada.id, creada.version)
    const editada = await guardarCotizacion(
      activo.client,
      conIntro('Versión corregida en {{ubicacion}}.'),
      creada.id,
      await versionDe(activo.client, creada.id),
    )

    const ultimoEnvio = await pdfParaMostrar(activo.client, creada.id)
    expect(await textoDelPdf(ultimoEnvio!.pdf)).toContain('Versión enviada en')
    const actual = await pdfParaMostrar(activo.client, creada.id, undefined, { actual: true })
    expect(await textoDelPdf(actual!.pdf)).toContain('Versión corregida en')

    await aprobarCotizacion(activo.client, creada.id, '2026-10-23', editada.version)
    const [{ pdf_aprobado_path }] = await sql<{ pdf_aprobado_path: string }>(
      'select pdf_aprobado_path from public.cotizaciones where id = $1',
      [creada.id],
    )
    const congelado = await activo.client.storage.from('documentos').download(pdf_aprobado_path)
    const aprobada = await pdfParaMostrar(activo.client, creada.id, undefined, { actual: true })
    expect(Buffer.compare(aprobada!.pdf, Buffer.from(await congelado.data!.arrayBuffer()))).toBe(0)
  })
})
