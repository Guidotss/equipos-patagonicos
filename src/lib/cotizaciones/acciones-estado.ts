// src/lib/cotizaciones/acciones-estado.ts
// Qué acciones de estado ofrece el editor, qué franjas muestra y qué falta para enviar (decisiones 11 a 17).
// Puro: lo usan los componentes de cliente del editor.
import { formatFechaCorta, ZONA_ARGENTINA } from '@/lib/format/fechas'
import { parsePrecio } from '@/lib/format/montos'
import { VARIABLES, type NombreVariable } from '@/lib/plantillas/variables'
import type { ContextoEstado } from './contexto-estado'
import { MENSAJE_CONFLICTO, puedeEnviar, type EstadoEditor, type Pendientes } from './editor'
import { idCampoVariable } from './editor-pantalla'
import { fechaDeMarca } from './vista-previa'

/** El error de private.exigir_version (MENSAJE_CONFLICTO, editor.ts): la cotización cambió desde que se abrió. */
export function esConflicto(mensaje: string | null | undefined): boolean {
  return mensaje === MENSAJE_CONFLICTO
}

export type AccionEstado =
  | 'enviar'
  | 'reenviar'
  | 'aprobar'
  | 'rechazar'
  | 'reabrir'
  | 'revertir'
  | 'borrar'
  | 'duplicar'
  | 'descargar'

export const ETIQUETA_ACCION: Record<AccionEstado, string> = {
  enviar: 'Descargar y marcar enviada',
  reenviar: 'Descargar y marcar enviada de nuevo',
  aprobar: 'Aprobar',
  rechazar: 'Rechazar',
  reabrir: 'Reabrir',
  revertir: 'Revertir aprobación',
  borrar: 'Eliminar borrador',
  duplicar: 'Duplicar',
  descargar: 'Descargar PDF',
}

/** El texto del botón mientras la acción corre. */
export const ETIQUETA_EN_CURSO: Record<AccionEstado, string> = {
  enviar: 'Generando…',
  reenviar: 'Generando…',
  aprobar: 'Aprobando…',
  rechazar: 'Rechazando…',
  reabrir: 'Reabriendo…',
  revertir: 'Revirtiendo…',
  borrar: 'Eliminando…',
  duplicar: 'Duplicando…',
  descargar: 'Descargar PDF',
}

/** Las que piden confirmación en el lugar (decisión 15). Duplicar y enviar no. */
export const CONFIRMABLES = ['aprobar', 'rechazar', 'reabrir', 'revertir', 'borrar'] as const
export type AccionConfirmable = (typeof CONFIRMABLES)[number]

export function esConfirmable(accion: AccionEstado): accion is AccionConfirmable {
  return (CONFIRMABLES as readonly string[]).includes(accion)
}

/** `?accion=aprobar` (desde el menú de una fila de la lista): abre esa confirmación al entrar. */
export function accionDesdeParametro(valor: string | string[] | undefined): AccionConfirmable | null {
  return typeof valor === 'string' && (CONFIRMABLES as readonly string[]).includes(valor)
    ? (valor as AccionConfirmable)
    : null
}

/** Una transición del ⋯ de una fila de la lista: lleva a `/cotizaciones/{id}?accion={accion}`. */
export type TransicionLista = { accion: AccionConfirmable; etiqueta: string }

/**
 * Las transiciones del ⋯ de una fila de la lista (relev-visual §1.6), solo en las armadas en la app (`origen` es el
 * de FilaCotizacion: null en las de la app). Llevan al editor con la confirmación abierta; si al entrar ya no se
 * puede (por ejemplo, un borrador que ya se envió no se elimina), el editor no la abre.
 */
export function transicionesDeLista(fila: { estado: string; origen: string | null }): TransicionLista[] {
  if (fila.origen !== null) return []
  switch (fila.estado) {
    case 'borrador':
      return [{ accion: 'borrar', etiqueta: 'Eliminar borrador…' }]
    case 'enviada':
      return [
        { accion: 'aprobar', etiqueta: 'Aprobar…' },
        { accion: 'rechazar', etiqueta: 'Rechazar…' },
      ]
    case 'rechazada':
      return [{ accion: 'reabrir', etiqueta: 'Reabrir…' }]
    default:
      return []
  }
}

/** Solo se editan los borradores y las enviadas armadas en la app (guardar_cotizacion rechaza el resto). */
export function esEditable(estado: Pick<EstadoEditor, 'origen' | 'estado'>): boolean {
  return estado.origen === 'app' && (estado.estado === 'borrador' || estado.estado === 'enviada')
}

export type BotonAccion = { accion: AccionEstado; primaria: boolean }
export type DisposicionAcciones = {
  /** Los botones del encabezado después de Guardar, de izquierda a derecha. */
  botones: BotonAccion[]
  /** Lo que va en el menú ⋯ (los envíos anteriores se agregan aparte). */
  menu: AccionEstado[]
}

/**
 * Los botones de cada estado (docs/diseno/referencias/03-editor-cotizacion.png y relev-visual §3.2). Las cargadas y
 * las directas no usan el editor (decisión 24). Eliminar solo aparece en un borrador que nunca se envió. Una nueva
 * muestra enviar y aprobar: guardan primero (decisión 12).
 */
export function disposicionAcciones(
  estado: Pick<EstadoEditor, 'id' | 'estado' | 'origen'>,
  contexto: Pick<ContextoEstado, 'envios'>,
): DisposicionAcciones {
  if (estado.origen !== 'app') return { botones: [], menu: [] }
  if (!estado.id) {
    return { botones: [{ accion: 'enviar', primaria: true }, { accion: 'aprobar', primaria: false }], menu: [] }
  }
  switch (estado.estado) {
    case 'borrador':
      return {
        botones: [
          { accion: 'enviar', primaria: true },
          { accion: 'aprobar', primaria: false },
        ],
        menu: contexto.envios.length ? ['duplicar', 'rechazar'] : ['duplicar', 'rechazar', 'borrar'],
      }
    case 'enviada':
      return {
        botones: [
          { accion: 'rechazar', primaria: false },
          { accion: 'aprobar', primaria: true },
        ],
        menu: ['reenviar', 'duplicar'],
      }
    case 'aprobada':
      return {
        botones: [
          { accion: 'descargar', primaria: false },
          { accion: 'duplicar', primaria: true },
        ],
        menu: ['revertir'],
      }
    case 'rechazada':
      return {
        botones: [
          { accion: 'reabrir', primaria: true },
          { accion: 'duplicar', primaria: false },
        ],
        menu: [],
      }
  }
}

/**
 * Por qué un botón está deshabilitado (null: se puede). El detalle de lo que falta va en la franja amarilla. Una
 * nueva no se bloquea por no estar guardada: enviar y aprobar la guardan primero (decisión 12).
 */
export function motivoBloqueo(accion: AccionEstado, pendientes: Pendientes): string | null {
  if (accion !== 'enviar' && accion !== 'reenviar' && accion !== 'aprobar') return null
  if (!puedeEnviar(pendientes)) return 'Completá lo que falta para enviarla o aprobarla'
  return null
}

/** true si la cotización se editó después del último envío (marcar_enviada deja updated_at = enviada_at). */
export function editadaDespuesDelEnvio(version: string | null, ultimoEnvio: string | null): boolean {
  if (!version || !ultimoEnvio) return false
  return new Date(version).getTime() > new Date(ultimoEnvio).getTime()
}

/**
 * Aprobar una enviada con cambios que el cliente no recibió congela una versión que no vio (decisión 14).
 * Limitación aceptada: después de revertir la aprobación de una enviada, updated_at queda posterior al último envío
 * aunque el contenido no haya cambiado, y el aviso aparece igual. Es solo un aviso; no hay en la base una marca del
 * último guardado de contenido con la que distinguirlo.
 */
export function apruebaVersionNoEnviada(
  estado: Pick<EstadoEditor, 'estado' | 'version'>,
  contexto: Pick<ContextoEstado, 'envios'>,
  hayCambiosSinGuardar: boolean,
): boolean {
  if (estado.estado !== 'enviada') return false
  return hayCambiosSinGuardar || editadaDespuesDelEnvio(estado.version, contexto.envios[0]?.enviada_at ?? null)
}

/** El mensaje de la fecha de aprobación (null si sirve). La base vuelve a controlarlo. */
export function errorFechaAprobacion(fecha: string, fechaCotizacion: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Ingresá la fecha de aprobación'
  if (fecha < fechaCotizacion) {
    return `No puede ser anterior a la fecha de la cotización (${formatFechaCorta(fechaCotizacion)})`
  }
  return null
}

/** Qué pasa al revertir: vuelve a enviada si se envió alguna vez (revertir_aprobacion). */
export function estadoAlRevertir(contexto: Pick<ContextoEstado, 'envios'>): 'enviada' | 'borrador' {
  return contexto.envios.length ? 'enviada' : 'borrador'
}

const HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_ARGENTINA,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** "20/10/2026 14:35" (hora argentina): cada envío del historial. */
export function fechaHoraDeMarca(marca: string): string {
  return `${fechaDeMarca(marca)} ${HORA.format(new Date(marca))}`
}

export type Franja =
  | { tipo: 'enviada'; texto: string; envioId: string | null }
  | { tipo: 'vencida'; texto: string }
  | { tipo: 'aprobada'; texto: string }
  | { tipo: 'rechazada'; texto: string }
  | { tipo: 'duplicada'; anterior: { id: string; numero: number } }

/** Las franjas de estado bajo el encabezado (relev-visual §3.9), en orden. */
export function franjasEstado(estado: Pick<EstadoEditor, 'estado'>, contexto: ContextoEstado): Franja[] {
  const franjas: Franja[] = []
  if (estado.estado === 'enviada') {
    if (contexto.vencida && contexto.venceEl) {
      franjas.push({
        tipo: 'vencida',
        texto: `Venció el ${formatFechaCorta(contexto.venceEl)}. Duplicala para renegociar o aprobala si el cliente la aceptó.`,
      })
    } else {
      const ultimo = contexto.envios[0] ?? null
      franjas.push({
        tipo: 'enviada',
        texto: `${ultimo ? `Enviada el ${fechaDeMarca(ultimo.enviada_at)}` : 'Enviada'}. Lo que edites no le llega al cliente hasta que la vuelvas a mandar.`,
        envioId: ultimo?.id ?? null,
      })
    }
  }
  if (estado.estado === 'aprobada') {
    const fecha = contexto.fechaAprobacion ? ` el ${formatFechaCorta(contexto.fechaAprobacion)}` : ''
    franjas.push({ tipo: 'aprobada', texto: `Aprobada${fecha}: es un presupuesto y no se modifica.` })
  }
  if (estado.estado === 'rechazada') {
    franjas.push({ tipo: 'rechazada', texto: 'Rechazada. Para volver a editarla, reabrila.' })
  }
  if (contexto.anterior) franjas.push({ tipo: 'duplicada', anterior: contexto.anterior })
  return franjas
}

/**
 * El nombre con que la franja amarilla menciona una variable: el de la etiqueta de su campo en el editor (Task 8:
 * los datos usan VARIABLES; capacidad y descripción salen del equipo elegido).
 */
export function etiquetaVariable(nombre: NombreVariable): string {
  switch (nombre) {
    case 'capacidad':
    case 'equipo_descripcion':
      return 'Equipo'
    case 'validez_dias':
      return 'Validez (días)'
    case 'proxima_actualizacion':
      return 'Próxima actualización'
    default:
      return VARIABLES[nombre]
  }
}

/** El id del precio de un ítem en la grilla (TarjetaItems, Task 9: `item-{clave}-precio`). */
export function idPrecioItem(clave: string): string {
  return `item-${clave}-precio`
}

/** Un faltante de la franja amarilla: `destino` es el id del campo que recibe el foco (null: no hay un campo). */
export type Pendiente = { clave: string; texto: string; destino: string | null }

/**
 * Lo que la franja amarilla lista como "Para enviar falta completar" (decisión 17), sin repetir el mismo campo,
 * y aparte las variables mal escritas (se corrigen en los textos: no hay un campo al que llevar el foco).
 */
export function pendientesVisibles(
  pendientes: Pendientes,
  estado: Pick<EstadoEditor, 'items'>,
): { faltan: Pendiente[]; malEscritas: string[] } {
  const faltan: Pendiente[] = []
  const vistos = new Set<string>()
  for (const variable of pendientes.variables) {
    const destino = idCampoVariable(variable)
    const texto = etiquetaVariable(variable)
    // Capacidad y descripción del equipo van al mismo campo: se nombra una vez.
    if (vistos.has(texto)) continue
    vistos.add(texto)
    faltan.push({ clave: `variable-${variable}`, texto, destino })
  }
  if (pendientes.sinItems) faltan.push({ clave: 'sin-items', texto: 'al menos un ítem', destino: null })
  if (pendientes.itemsSinPrecio > 0) {
    // El mismo criterio que pendientesEditor: un precio vacío o que no se puede leer cuenta como sin precio.
    const primero = estado.items.find((item) => parsePrecio(item.precio) === null)
    faltan.push({
      clave: 'items-sin-precio',
      texto: pendientes.itemsSinPrecio === 1 ? '1 ítem sin precio' : `${pendientes.itemsSinPrecio} ítems sin precio`,
      destino: primero ? idPrecioItem(primero.clave) : null,
    })
  }
  return { faltan, malEscritas: pendientes.desconocidas.map((nombre) => `{{${nombre}}}`) }
}
