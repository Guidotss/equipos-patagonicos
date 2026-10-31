// src/lib/cotizaciones/editor.ts
// Estado del editor de cotizaciones y todo lo que se calcula a partir de él, sin React ni Supabase: el componente
// lo usa con useReducer, la Server Action valida con payloadGuardar y la vista previa arma el documento con
// fuenteDesdeEditor. Se puede importar desde el navegador.
import { z } from 'zod'
import { esFecha, esMes, hoyArgentina, mesEnLetras } from '@/lib/format/fechas'
import { parsePrecio } from '@/lib/format/montos'
import { erroresPorRuta } from '@/lib/formularios'
import {
  UNIDADES,
  leerBloques,
  type Bloque,
  type Formato,
  type ItemPlantilla,
  type Unidad,
} from '@/lib/plantillas/contenido'
import type { NombreVariable } from '@/lib/plantillas/variables'
import { esUuid } from '@/lib/validacion'
import { esquemaDatos, esquemaItem, leerDatos, type CampoDatos, type DatosCotizacion } from './datos'
import { armarDocumento, type FuenteDocumento } from './documento'

// ---------------------------------------------------------------------------------------------------------------
// Tipos

/** Una fila de la grilla. Cantidad y precio quedan como texto mientras se escriben ("39.000.000", "1,5"). */
export type ItemEditor = {
  clave: string
  seccion: string
  descripcion: string
  cantidad: string
  precio: string
  unidad: Unidad
}
export type BloqueEditor = { clave: string; titulo: string; contenido: string; oculto: boolean }

export type EstadoEditor = {
  id: string | null
  version: string | null
  numero: number | null
  estado: 'borrador' | 'enviada' | 'aprobada' | 'rechazada'
  origen: 'app' | 'importada' | 'directa'
  cliente: { id: string; razon_social: string; cuit: string | null } | null
  contactoId: string // '' = Sin Atte.
  plantillaId: string
  formato: Formato
  equipoId: string
  firmanteId: string
  fecha: string // 'YYYY-MM-DD'
  validezDias: string
  mostrarTotal: boolean
  proximaActualizacion: string // 'YYYY-MM' o ''
  asunto: string
  intro: string
  datos: DatosCotizacion // incluye proxima_actualizacion (texto) e indice_base
  items: ItemEditor[]
  bloques: BloqueEditor[]
  reemplazaA: string | null // solo cuenta al crear
}

export type PlantillaEditor = {
  id: string
  nombre: string
  formato: Formato
  asunto: string
  intro: string
  validez_dias: number
  bloques: Bloque[]
  items: ItemPlantilla[]
}

export type CatalogosEditor = {
  plantillas: PlantillaEditor[]
  equipos: { id: string; nombre: string; capacidad_tn: number | null; descripcion: string; activo: boolean }[]
  firmantes: { id: string; nombre: string; cargo: string; telefono: string; activo: boolean }[]
  empresa: FuenteDocumento['empresa']
}

/**
 * Lo que la página del editor lee de una cotización:
 * `supabase.from('cotizaciones').select(SELECT_EDITOR).eq('id', id).maybeSingle()`.
 * Los envíos vienen sin orden (la página los ordena por `enviada_at`); estadoDesdeFila no los usa, pero la página
 * los necesita para el historial y para avisar si se aprueba algo editado después del último envío.
 */
export const SELECT_EDITOR = `id, numero, estado, origen, fecha, formato, asunto, intro, datos, bloques, validez_dias,
  mostrar_total, fecha_proxima_actualizacion, contacto_id, plantilla_id, equipo_id, firmante_id, reemplaza_a,
  fecha_aprobacion, archivo_original_path, updated_at,
  cliente:clientes(id, razon_social, cuit),
  items:cotizacion_items(orden, seccion, descripcion, cantidad, precio_unitario, unidad),
  envios:cotizacion_envios(id, enviada_at)`

/** La fila que devuelve la consulta de SELECT_EDITOR (editor.test.ts comprueba que el tipo inferido encaja). */
export type FilaEditor = {
  id: string
  numero: number
  estado: string
  origen: string
  fecha: string
  formato: string
  asunto: string
  intro: string
  datos: unknown
  bloques: unknown
  validez_dias: number
  mostrar_total: boolean
  fecha_proxima_actualizacion: string | null
  contacto_id: string | null
  plantilla_id: string | null
  equipo_id: string | null
  firmante_id: string | null
  reemplaza_a: string | null
  fecha_aprobacion: string | null
  archivo_original_path: string | null
  updated_at: string
  cliente: { id: string; razon_social: string; cuit: string | null }
  items: {
    orden: number
    seccion: string
    descripcion: string
    cantidad: number
    precio_unitario: number | null
    unidad: string
  }[]
  envios: { id: string; enviada_at: string }[]
}

export type AccionEditor =
  | { tipo: 'campo'; campo: CampoEditor; valor: string }
  | { tipo: 'dato'; campo: CampoDatos; valor: string }
  | { tipo: 'mostrarTotal'; valor: boolean }
  | { tipo: 'cliente'; cliente: EstadoEditor['cliente']; contactoId: string }
  | { tipo: 'plantilla'; plantilla: PlantillaEditor }
  | { tipo: 'agregarItem'; despuesDe?: string; seccion?: string }
  | { tipo: 'item'; clave: string; cambios: Partial<Omit<ItemEditor, 'clave'>> }
  | { tipo: 'moverItem'; desde: number; hasta: number }
  | { tipo: 'quitarItem'; clave: string }
  | { tipo: 'duplicarItem'; clave: string }
  | { tipo: 'renombrarSeccion'; clave: string; seccion: string }
  | { tipo: 'agregarSeccion'; nombre: string }
  | { tipo: 'bloque'; clave: string; cambios: Partial<Omit<BloqueEditor, 'clave'>> }
  | { tipo: 'moverBloque'; clave: string; direccion: -1 | 1 }
  | { tipo: 'restaurarBloques'; bloques: Bloque[] }
  | { tipo: 'guardado'; id: string; version: string; numero: number }
  | { tipo: 'reemplazar'; estado: EstadoEditor }

/** Campos de texto de la cabecera que se cambian con la acción 'campo'. */
export type CampoEditor =
  | 'contactoId'
  | 'equipoId'
  | 'firmanteId'
  | 'fecha'
  | 'validezDias'
  | 'proximaActualizacion'
  | 'asunto'
  | 'intro'

export type PayloadGuardar = { p_datos: Record<string, unknown>; p_items: Record<string, unknown>[] }

export type Pendientes = {
  variables: NombreVariable[]
  desconocidas: string[]
  itemsSinPrecio: number
  sinItems: boolean
}

/**
 * El texto de private.exigir_version (supabase/migrations/20261025100200_cotizaciones_estados.sql) cuando la versión
 * que vio la pantalla ya no es la de la fila. El servicio da el mismo error antes de generar un PDF y el editor lo
 * reconoce para ofrecer "Recargar" (acciones-estado.ts): si cambia en la base, cambia acá.
 */
export const MENSAJE_CONFLICTO = 'La cotización cambió desde que la abriste; volvé a intentarlo'

// ---------------------------------------------------------------------------------------------------------------
// Texto de los números de la grilla

let clavesSinCrypto = 0

/** Clave estable de una fila o un bloque (para React y para arrastrar); no se guarda. */
export function nuevaClave(): string {
  // crypto.randomUUID solo existe en un contexto seguro (HTTPS o localhost): el dev server abierto desde el celular
  // por la IP de la red no lo tiene. La clave no se guarda: alcanza con que no se repita en la página.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  clavesSinCrypto += 1
  return `clave-${clavesSinCrypto}-${Math.random().toString(36).slice(2)}`
}

const sinDecimales = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0, useGrouping: 'always' })
const conDecimales = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
})

/** Precio guardado → texto de la celda: "39.000.000" o "1.950.000,50". parsePrecio lo vuelve a leer igual. */
export function textoPrecio(precio: number): string {
  return Number.isInteger(precio) ? sinDecimales.format(precio) : conDecimales.format(precio)
}

/** Cantidad guardada → texto de la celda, con coma decimal: 1 → "1", 1.5 → "1,5". */
export function textoCantidad(cantidad: number): string {
  return String(cantidad).replace('.', ',')
}

// ---------------------------------------------------------------------------------------------------------------
// Crear el estado

const ESTADOS = ['borrador', 'enviada', 'aprobada', 'rechazada'] as const
const ORIGENES = ['app', 'importada', 'directa'] as const
const FORMATOS_EDITOR = ['mensual', 'jornada'] as const satisfies readonly Formato[]

/** La base garantiza estos valores (CHECK): uno distinto es un error de programación. */
function unoDe<const T extends readonly string[]>(valor: string, opciones: T, error: string): T[number] {
  if (!opciones.includes(valor)) throw new Error(`${error}: ${valor}`)
  return valor as T[number]
}

function bloquesDelEditor(bloques: Bloque[]): BloqueEditor[] {
  return bloques.map((bloque) => ({
    clave: nuevaClave(),
    titulo: bloque.titulo,
    contenido: bloque.contenido,
    oculto: bloque.oculto,
  }))
}

/** Una cotización nueva: borrador de la app, con la plantilla aplicada si hay una. */
export function estadoNuevo(args: {
  plantilla: PlantillaEditor | null
  firmanteId: string
  hoy: string
}): EstadoEditor {
  const vacio: EstadoEditor = {
    id: null,
    version: null,
    numero: null,
    estado: 'borrador',
    origen: 'app',
    cliente: null,
    contactoId: '',
    plantillaId: '',
    formato: 'mensual',
    equipoId: '',
    firmanteId: args.firmanteId,
    fecha: args.hoy,
    validezDias: '30',
    mostrarTotal: false,
    proximaActualizacion: '',
    asunto: '',
    intro: '',
    datos: leerDatos({}),
    items: [],
    bloques: [],
    reemplazaA: null,
  }
  return args.plantilla ? aplicarPlantilla(vacio, args.plantilla) : vacio
}

/** El estado de una cotización guardada, tal como la lee la página (ver SELECT_EDITOR). */
export function estadoDesdeFila(fila: FilaEditor): EstadoEditor {
  return {
    id: fila.id,
    version: fila.updated_at,
    numero: fila.numero,
    estado: unoDe(fila.estado, ESTADOS, 'Estado desconocido'),
    origen: unoDe(fila.origen, ORIGENES, 'Origen desconocido'),
    cliente: { id: fila.cliente.id, razon_social: fila.cliente.razon_social, cuit: fila.cliente.cuit },
    contactoId: fila.contacto_id ?? '',
    plantillaId: fila.plantilla_id ?? '',
    formato: unoDe(fila.formato, FORMATOS_EDITOR, 'Formato desconocido'),
    equipoId: fila.equipo_id ?? '',
    firmanteId: fila.firmante_id ?? '',
    fecha: fila.fecha,
    validezDias: String(fila.validez_dias),
    mostrarTotal: fila.mostrar_total,
    // La columna guarda el primer día del mes ('2026-11-01'); el control es <input type="month">.
    proximaActualizacion: fila.fecha_proxima_actualizacion?.slice(0, 7) ?? '',
    asunto: fila.asunto,
    intro: fila.intro,
    datos: leerDatos(fila.datos),
    items: [...fila.items]
      .sort((a, b) => a.orden - b.orden)
      .map((item) => ({
        clave: nuevaClave(),
        seccion: item.seccion,
        descripcion: item.descripcion,
        cantidad: textoCantidad(item.cantidad),
        precio: item.precio_unitario === null ? '' : textoPrecio(item.precio_unitario),
        unidad: unoDe(item.unidad, UNIDADES, 'Unidad desconocida'),
      })),
    bloques: bloquesDelEditor(leerBloques(fila.bloques)),
    reemplazaA: fila.reemplaza_a,
  }
}

/**
 * Precarga lo que trae la plantilla: formato, asunto, introducción, textos, validez e ítems sin precio.
 * Cliente, contacto, equipo, firmante, fecha, datos, próxima actualización y "mostrar total" no cambian.
 */
export function aplicarPlantilla(estado: EstadoEditor, plantilla: PlantillaEditor): EstadoEditor {
  return {
    ...estado,
    plantillaId: plantilla.id,
    formato: plantilla.formato,
    asunto: plantilla.asunto,
    intro: plantilla.intro,
    validezDias: String(plantilla.validez_dias),
    items: plantilla.items.map((item) => ({
      clave: nuevaClave(),
      seccion: item.seccion,
      descripcion: item.descripcion,
      cantidad: textoCantidad(item.cantidad),
      precio: '',
      unidad: item.unidad,
    })),
    bloques: bloquesDelEditor(plantilla.bloques),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Reducer

function insertar<T>(lista: T[], posicion: number, elemento: T): T[] {
  return [...lista.slice(0, posicion), elemento, ...lista.slice(posicion)]
}

/** Saca el elemento de `desde` y lo pone en `hasta` (como arrayMove de dnd-kit). */
function mover<T>(lista: T[], desde: number, hasta: number): T[] {
  const copia = [...lista]
  const [elemento] = copia.splice(desde, 1)
  copia.splice(hasta, 0, elemento)
  return copia
}

/** Fila vacía: copia sección y unidad de la fila de referencia; sin referencia, la unidad típica del formato. */
function itemNuevo(estado: EstadoEditor, referencia: ItemEditor | undefined, seccion?: string): ItemEditor {
  return {
    clave: nuevaClave(),
    seccion: seccion ?? referencia?.seccion ?? '',
    descripcion: '',
    cantidad: '1',
    precio: '',
    unidad: referencia?.unidad ?? (estado.formato === 'jornada' ? 'JORNADA' : 'UNIDAD'),
  }
}

function moverItem(items: ItemEditor[], desde: number, hasta: number): ItemEditor[] {
  const valido = (indice: number) => Number.isInteger(indice) && indice >= 0 && indice < items.length
  if (desde === hasta || !valido(desde) || !valido(hasta)) return items
  const lista = mover(items, desde, hasta)
  const anterior = lista[hasta - 1]
  const siguiente = lista[hasta + 1]
  const movido = lista[hasta]
  // Las secciones son rachas de filas consecutivas. Si la fila cae en el medio de otro grupo, se suma a ese grupo:
  // si conservara la suya, partiría el grupo en dos. En el borde entre dos grupos conserva su sección.
  if (anterior && siguiente && anterior.seccion === siguiente.seccion && movido.seccion !== anterior.seccion) {
    lista[hasta] = { ...movido, seccion: anterior.seccion }
  }
  return lista
}

/** Renombra la racha de filas consecutivas con la misma sección que la fila `clave` (no otras rachas iguales). */
function renombrarSeccion(items: ItemEditor[], clave: string, seccion: string): ItemEditor[] {
  const indice = items.findIndex((item) => item.clave === clave)
  if (indice < 0) return items
  const actual = items[indice].seccion
  let inicio = indice
  while (inicio > 0 && items[inicio - 1].seccion === actual) inicio--
  let fin = indice
  while (fin < items.length - 1 && items[fin + 1].seccion === actual) fin++
  return items.map((item, i) => (i >= inicio && i <= fin ? { ...item, seccion } : item))
}

/**
 * Todas las transiciones del editor. Pura salvo las claves nuevas (crypto.randomUUID). Si la acción no cambia nada
 * (mover fuera de rango, una clave que ya no existe), devuelve el mismo estado.
 */
export function reducirEditor(estado: EstadoEditor, accion: AccionEditor): EstadoEditor {
  switch (accion.tipo) {
    case 'campo':
      if (accion.campo === 'proximaActualizacion') {
        // Un solo control llena la fecha y el texto del PDF (decisión 7). Vaciarlo borra también el texto: el PDF
        // vuelve al valor de la empresa, igual antes y después de recargar. Mientras no se toque, el texto que trajo
        // la fila se conserva.
        return {
          ...estado,
          proximaActualizacion: accion.valor,
          datos: { ...estado.datos, proxima_actualizacion: esMes(accion.valor) ? mesEnLetras(accion.valor) : '' },
        }
      }
      return { ...estado, [accion.campo]: accion.valor }
    case 'dato':
      return { ...estado, datos: { ...estado.datos, [accion.campo]: accion.valor } }
    case 'mostrarTotal':
      return { ...estado, mostrarTotal: accion.valor }
    case 'cliente':
      return { ...estado, cliente: accion.cliente, contactoId: accion.contactoId }
    case 'plantilla':
      return aplicarPlantilla(estado, accion.plantilla)
    case 'agregarItem': {
      const indice = accion.despuesDe ? estado.items.findIndex((item) => item.clave === accion.despuesDe) : -1
      const referencia = indice >= 0 ? estado.items[indice] : estado.items.at(-1)
      const nuevo = itemNuevo(estado, referencia, accion.seccion)
      return { ...estado, items: insertar(estado.items, indice >= 0 ? indice + 1 : estado.items.length, nuevo) }
    }
    case 'item':
      if (!estado.items.some((item) => item.clave === accion.clave)) return estado
      return {
        ...estado,
        items: estado.items.map((item) =>
          item.clave === accion.clave ? { ...item, ...accion.cambios, clave: item.clave } : item,
        ),
      }
    case 'moverItem': {
      const items = moverItem(estado.items, accion.desde, accion.hasta)
      return items === estado.items ? estado : { ...estado, items }
    }
    case 'quitarItem':
      if (!estado.items.some((item) => item.clave === accion.clave)) return estado
      return { ...estado, items: estado.items.filter((item) => item.clave !== accion.clave) }
    case 'duplicarItem': {
      const indice = estado.items.findIndex((item) => item.clave === accion.clave)
      if (indice < 0) return estado
      const copia = { ...estado.items[indice], clave: nuevaClave() }
      return { ...estado, items: insertar(estado.items, indice + 1, copia) }
    }
    case 'renombrarSeccion': {
      const items = renombrarSeccion(estado.items, accion.clave, accion.seccion)
      return items === estado.items ? estado : { ...estado, items }
    }
    case 'agregarSeccion': {
      const nuevo = itemNuevo(estado, estado.items.at(-1), accion.nombre.trim() || 'Nueva sección')
      return { ...estado, items: [...estado.items, nuevo] }
    }
    case 'bloque':
      if (!estado.bloques.some((bloque) => bloque.clave === accion.clave)) return estado
      return {
        ...estado,
        bloques: estado.bloques.map((bloque) =>
          bloque.clave === accion.clave ? { ...bloque, ...accion.cambios, clave: bloque.clave } : bloque,
        ),
      }
    case 'moverBloque': {
      const indice = estado.bloques.findIndex((bloque) => bloque.clave === accion.clave)
      const destino = indice + accion.direccion
      if (indice < 0 || destino < 0 || destino >= estado.bloques.length) return estado
      return { ...estado, bloques: mover(estado.bloques, indice, destino) }
    }
    case 'restaurarBloques':
      return { ...estado, bloques: bloquesDelEditor(accion.bloques) }
    case 'guardado':
      return { ...estado, id: accion.id, version: accion.version, numero: accion.numero }
    case 'reemplazar':
      return accion.estado
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Forma de lo que llega del navegador

const textoLibre = z.string().max(20_000)
const idOpcional = z.union([z.literal(''), z.uuid()])

/**
 * La forma de EstadoEditor, sin reglas de negocio (un precio mal escrito o la falta de cliente pasan). Sirve para
 * rechazar con 400 un cuerpo que no es un estado del editor (POST /cotizaciones/vista-previa) antes de usarlo; las
 * reglas para guardar están en payloadGuardar. Los ids son uuid o '' porque el servidor los relee de la base.
 */
export const esquemaEstadoEditor = z.object({
  id: z.uuid().nullable(),
  version: z.string().max(64).nullable(),
  numero: z.number().int().positive().nullable(),
  estado: z.enum(ESTADOS),
  origen: z.enum(ORIGENES),
  cliente: z.object({ id: z.uuid(), razon_social: textoLibre, cuit: z.string().nullable() }).nullable(),
  contactoId: idOpcional,
  plantillaId: idOpcional,
  formato: z.enum(FORMATOS_EDITOR),
  equipoId: idOpcional,
  firmanteId: idOpcional,
  fecha: z.string().max(10),
  validezDias: z.string().max(10),
  mostrarTotal: z.boolean(),
  proximaActualizacion: z.string().max(7),
  asunto: textoLibre,
  intro: textoLibre,
  datos: z.object({
    ubicacion: textoLibre,
    horario: textoLibre,
    plazo_entrega: textoLibre,
    duracion_estimada: textoLibre,
    forma_pago: textoLibre,
    disponibilidad: textoLibre,
    indice_base: textoLibre,
    proxima_actualizacion: textoLibre,
  }),
  items: z
    .array(
      z.object({
        clave: z.string().max(64),
        seccion: textoLibre,
        descripcion: textoLibre,
        cantidad: z.string().max(30),
        precio: z.string().max(30),
        unidad: z.enum(UNIDADES),
      }),
    )
    .max(500),
  bloques: z
    .array(z.object({ clave: z.string().max(64), titulo: textoLibre, contenido: textoLibre, oculto: z.boolean() }))
    .max(100),
  reemplazaA: z.uuid().nullable(),
}) satisfies z.ZodType<EstadoEditor>

// ---------------------------------------------------------------------------------------------------------------
// Guardar

const MENSAJE_VALIDEZ = 'Ingresá una validez de 1 a 365 días'
const MENSAJE_MES = 'Elegí un mes válido'
const MENSAJE_FECHA = 'Ingresá una fecha válida'

/** El texto de la próxima actualización en el PDF: el mes elegido manda; sin mes, queda el texto que hubiera. */
function proximaActualizacionEnTexto(mes: string, textoActual: string): string {
  return esMes(mes) ? mesEnLetras(mes) : textoActual
}

function uuidOpcional(mensaje: string) {
  return z
    .string(mensaje)
    .refine((valor) => valor === '' || esUuid(valor), mensaje)
    .transform((valor) => valor || null)
}

const clienteElegido = z.unknown().transform((cliente, ctx) => {
  const id = cliente !== null && typeof cliente === 'object' ? (cliente as { id?: unknown }).id : undefined
  if (typeof id === 'string' && esUuid(id)) return id
  ctx.addIssue({ code: 'custom', message: 'Elegí el cliente' })
  return z.NEVER
})

const cantidadEscrita = z
  .string('Ingresá la cantidad')
  .transform((texto, ctx) => {
    const cantidad = parsePrecio(texto)
    if (cantidad === null) {
      ctx.addIssue({ code: 'custom', message: texto.trim() ? 'Cantidad inválida' : 'Ingresá la cantidad' })
      return z.NEVER
    }
    return cantidad
  })
  .pipe(esquemaItem.shape.cantidad)

const precioEscrito = z
  .string('Precio inválido')
  .transform((texto, ctx) => {
    if (texto.trim() === '') return null
    const precio = parsePrecio(texto)
    if (precio === null) {
      ctx.addIssue({ code: 'custom', message: 'Precio inválido' })
      return z.NEVER
    }
    return precio
  })
  .pipe(esquemaItem.shape.precio_unitario)

// Las reglas de cada celda son las de esquemaItem; las claves de error usan los nombres de la grilla
// ('items.2.precio'), no los de la base ('precio_unitario').
const esquemaItemEditor = z
  .object({
    seccion: esquemaItem.shape.seccion,
    descripcion: esquemaItem.shape.descripcion,
    cantidad: cantidadEscrita,
    precio: precioEscrito,
    unidad: esquemaItem.shape.unidad,
  })
  .superRefine((item, ctx) => {
    // El total de la fila es numeric(16,2) en la base: si no entra, la base contestaría con un error de desborde.
    if (item.precio !== null && item.cantidad * item.precio >= 1e14) {
      ctx.addIssue({ code: 'custom', path: ['precio'], message: 'El total de la fila es demasiado grande' })
    }
  })
  .transform((item) => ({
    seccion: item.seccion,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precio,
    unidad: item.unidad,
  }))

const esquemaBloqueEditor = z.object({
  titulo: z.string().trim().max(200, 'Máximo 200 caracteres'),
  // Sin trim: dos espacios al principio de una línea son una subviñeta.
  contenido: z.string().max(10_000, 'Máximo 10.000 caracteres'),
  oculto: z.boolean(),
})

// Las claves son las de EstadoEditor, así erroresPorRuta devuelve 'cliente', 'validezDias', 'items.2.precio'…
const esquemaEditor = z.object({
  cliente: clienteElegido,
  contactoId: uuidOpcional('Contacto inválido'),
  plantillaId: uuidOpcional('Plantilla inválida'),
  formato: z.enum(FORMATOS_EDITOR, { error: 'Elegí el formato' }),
  equipoId: uuidOpcional('Equipo inválido'),
  firmanteId: uuidOpcional('Firmante inválido'),
  fecha: z.string(MENSAJE_FECHA).refine(esFecha, MENSAJE_FECHA),
  validezDias: z
    .string(MENSAJE_VALIDEZ)
    .trim()
    .regex(/^\d{1,3}$/, MENSAJE_VALIDEZ)
    .transform(Number)
    .refine((dias) => dias >= 1 && dias <= 365, MENSAJE_VALIDEZ),
  mostrarTotal: z.boolean(),
  proximaActualizacion: z.string(MENSAJE_MES).refine((mes) => mes === '' || esMes(mes), MENSAJE_MES),
  asunto: z.string().trim().max(500, 'Máximo 500 caracteres'),
  intro: z.string().trim().max(5000, 'Máximo 5000 caracteres'),
  datos: esquemaDatos,
  items: z.array(esquemaItemEditor),
  bloques: z.array(esquemaBloqueEditor),
  reemplazaA: z
    .string()
    .nullable()
    .refine((id) => id === null || esUuid(id), 'Cotización anterior inválida'),
})

/**
 * Valida el estado y arma los parámetros de guardar_cotizacion. p_datos lleva la cabecera COMPLETA porque la RPC
 * pisa con vacío lo que no se manda. Los uuid vacíos van como null; el mes elegido llena
 * fecha_proxima_actualizacion ('YYYY-MM-01') y el texto datos.proxima_actualizacion; los bloques ocultos viajan
 * con oculto: true. Lo usan la Server Action (que no confía en lo que manda el navegador) y hayCambios.
 */
export function payloadGuardar(
  estado: EstadoEditor,
): { ok: true; payload: PayloadGuardar } | { ok: false; errores: Record<string, string> } {
  const resultado = esquemaEditor.safeParse(estado)
  if (!resultado.success) return { ok: false, errores: erroresPorRuta(resultado.error) }
  const valido = resultado.data
  return {
    ok: true,
    payload: {
      p_datos: {
        cliente_id: valido.cliente,
        contacto_id: valido.contactoId,
        formato: valido.formato,
        plantilla_id: valido.plantillaId,
        equipo_id: valido.equipoId,
        firmante_id: valido.firmanteId,
        fecha: valido.fecha,
        asunto: valido.asunto,
        intro: valido.intro,
        datos: {
          ...valido.datos,
          proxima_actualizacion: proximaActualizacionEnTexto(
            valido.proximaActualizacion,
            valido.datos.proxima_actualizacion,
          ),
        },
        bloques: valido.bloques,
        validez_dias: valido.validezDias,
        mostrar_total: valido.mostrarTotal,
        fecha_proxima_actualizacion: valido.proximaActualizacion ? `${valido.proximaActualizacion}-01` : null,
        reemplaza_a: valido.reemplazaA,
      },
      p_items: valido.items,
    },
  }
}

/** Huella de lo que se guardaría. Con algo a medio escribir (un precio inválido, sin cliente) se usa el contenido. */
function huella(estado: EstadoEditor): string {
  const resultado = payloadGuardar(estado)
  if (resultado.ok) return `payload:${JSON.stringify(resultado.payload)}`
  return `estado:${JSON.stringify({
    ...estado,
    items: estado.items.map((item) => [item.seccion, item.descripcion, item.cantidad, item.precio, item.unidad]),
    bloques: estado.bloques.map((bloque) => [bloque.titulo, bloque.contenido, bloque.oculto]),
  })}`
}

/**
 * true si guardar cambiaría algo. Compara lo que se mandaría a la base, no las claves ni cómo está escrito
 * ("39000000" y "39.000.000" son el mismo precio).
 */
export function hayCambios(guardado: EstadoEditor, actual: EstadoEditor): boolean {
  return huella(guardado) !== huella(actual)
}

// ---------------------------------------------------------------------------------------------------------------
// Documento y pendientes

/**
 * El FuenteDocumento del estado sin guardar, para armarDocumento (pendientes en el navegador, vista previa en el
 * servidor). Equipo y firmante salen de los catálogos; el contacto lo pasa quien llama (null alcanza para las
 * variables). Lo que está a medio escribir no rompe: fecha inválida → hoy, validez inválida → 0, cantidad
 * inválida → 1, precio inválido → sin precio.
 */
export function fuenteDesdeEditor(
  estado: EstadoEditor,
  catalogos: CatalogosEditor,
  contacto: { nombre: string; email: string } | null,
): FuenteDocumento {
  const equipo = catalogos.equipos.find((candidato) => candidato.id === estado.equipoId)
  const firmante = catalogos.firmantes.find((candidato) => candidato.id === estado.firmanteId)
  const validez = Number(estado.validezDias.trim())
  return {
    cotizacion: {
      numero: estado.numero,
      fecha: esFecha(estado.fecha) ? estado.fecha : hoyArgentina(),
      formato: estado.formato,
      asunto: estado.asunto,
      intro: estado.intro,
      validez_dias: Number.isInteger(validez) && validez > 0 ? validez : 0,
      mostrar_total: estado.mostrarTotal,
      datos: {
        ...estado.datos,
        proxima_actualizacion: proximaActualizacionEnTexto(
          estado.proximaActualizacion,
          estado.datos.proxima_actualizacion,
        ),
      },
      bloques: estado.bloques.map(({ titulo, contenido, oculto }) => ({ titulo, contenido, oculto })),
    },
    items: estado.items.map((item, indice) => ({
      orden: indice + 1,
      seccion: item.seccion,
      descripcion: item.descripcion,
      cantidad: parsePrecio(item.cantidad) ?? 1,
      precio_unitario: parsePrecio(item.precio),
      unidad: item.unidad,
    })),
    cliente: { razon_social: estado.cliente?.razon_social ?? '', cuit: estado.cliente?.cuit ?? null },
    contacto,
    equipo: equipo ? { capacidad_tn: equipo.capacidad_tn, descripcion: equipo.descripcion } : null,
    firmante: firmante ? { nombre: firmante.nombre, cargo: firmante.cargo, telefono: firmante.telefono } : null,
    empresa: catalogos.empresa,
  }
}

/** Lo que falta para poder enviar o aprobar, calculado con el mismo armarDocumento que dibuja el PDF. */
export function pendientesEditor(estado: EstadoEditor, catalogos: CatalogosEditor): Pendientes {
  const documento = armarDocumento(fuenteDesdeEditor(estado, catalogos, null))
  return {
    // Sin guardar todavía no hay número: se asigna al guardar, no es algo que el usuario tenga que completar.
    variables: documento.faltantes.filter((nombre) => nombre !== 'numero' || estado.id !== null),
    desconocidas: documento.desconocidas,
    itemsSinPrecio: estado.items.filter((item) => parsePrecio(item.precio) === null).length,
    sinItems: estado.items.length === 0,
  }
}

export function puedeEnviar(p: Pendientes): boolean {
  return p.variables.length === 0 && p.desconocidas.length === 0 && p.itemsSinPrecio === 0 && !p.sinItems
}
